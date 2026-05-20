import os
import json
import uuid
import io
import mimetypes
from urllib.parse import quote
from fastapi import FastAPI, Depends, UploadFile, File, BackgroundTasks, HTTPException, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List

import models, schemas, database
from database import engine, get_db, SessionLocal
from services.document_service import analyze_document, reextract_document_tags
from services.storage_service import storage_service
from services.ai_service import get_embedding, generate_answer, analyze_query_and_filters, classify_tags_by_theme, classify_dynamic_tree_by_theme
from sqlalchemy import or_

app = FastAPI(title="TANK")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.on_event("startup")
def startup():
    # 1. Enable pgvector extension (MUST happen before creating tables using VECTOR type)
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    
    # 2. Create tables
    models.Base.metadata.create_all(bind=engine)

@app.get("/")
def read_root():
    return {"message": "Welcome to TANK API"}

# Placeholder for Demo User
DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"

@app.post("/api/setup-demo")
def setup_demo(db: Session = Depends(get_db)):
    user = models.User(id=DEMO_USER_ID, email="demo@example.com", display_name="Demo User")
    db.merge(user)
    db.commit()
    return {"status": "ok", "user_id": DEMO_USER_ID}

# Background analysis wrapper to get fresh DB session
def analyze_bg(document_id: str):
    # 1. Start Analysis
    db = SessionLocal()
    try:
        analyze_document(document_id, db)
    except Exception as e:
        print(f"CRITICAL ERROR in background analysis: {e}")
        # Analysis session might be broken, close and use a fresh one for status update
        db.rollback()
        db.close()
        
        # 2. Forced status update in a fresh session
        db_fail = SessionLocal()
        try:
            doc = db_fail.query(models.Document).filter(models.Document.id == document_id).first()
            if doc:
                doc.status = "failed"
                db_fail.commit()
                print(f"Status for {document_id} set to FAILED.")
        except Exception as db_err:
            print(f"Could not set status to failed: {db_err}")
        finally:
            db_fail.close()
        return
    finally:
        # Check if session is still open (might have been closed in except)
        try:
            db.close()
        except:
            pass

def reextract_tags_bg(document_id: str):
    db = SessionLocal()
    try:
        reextract_document_tags(document_id, db)
    except Exception as e:
        print(f"CRITICAL ERROR in background tag re-extraction: {e}")
        db.rollback()
    finally:
        try:
            db.close()
        except:
            pass

@app.post("/api/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    file_id = uuid.uuid4()
    file_ext = file.filename.split(".")[-1].lower()
    allowed_exts = ["pdf", "docx", "xlsx", "txt", "md"]
    if file_ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported file format. Allowed: {', '.join(allowed_exts)}")
    
    storage_dir = "/app/uploads"
    os.makedirs(storage_dir, exist_ok=True)
    file_path = os.path.join(storage_dir, f"{file_id}.{file_ext}")
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    # Upload to Supabase Storage for cloud persistence
    remote_path = f"{file_id}.{file_ext}"
    storage_service.upload_file(file_path, remote_path)
    
    doc = models.Document(
        id=file_id,
        file_name=file.filename,
        storage_path=remote_path, # Use remote path as unique identifier
        uploaded_by=DEMO_USER_ID,
        file_size=len(content),
        status="uploaded"
    )
    db.add(doc)
    db.commit()
    
    background_tasks.add_task(analyze_bg, str(file_id))
    
    return {"file_id": file_id, "status": "processing"}

@app.get("/api/documents")
@app.get("/documents") # 404回避のためのエイリアス
def list_documents(sort_key: str = "created_at", sort_order: str = "desc", db: Session = Depends(get_db)):
    query = db.query(models.Document)
    
    # 有効なカラムかつ、SQLインジェクション防止のためモデル属性から取得
    sort_col = getattr(models.Document, sort_key, models.Document.created_at)
    
    if sort_order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())
        
    return query.all()

@app.get("/api/tags")
@app.get("/tags") # 404回避のためのエイリアス
def list_tags(db: Session = Depends(get_db)):
    # tagsはカンマ区切りの文字列として格納されているため、全て取得してユニークなリストを作成する
    results = db.query(models.Document.tags).filter(models.Document.tags != None).all()
    all_tags = set()
    for row in results:
        if row[0]:
            # 不要な記号 ({, }, [, ]) を除去してから分割
            clean_row = row[0].replace("{", "").replace("}", "").replace("[", "").replace("]", "")
            tags = [t.strip() for t in clean_row.split(",") if t.strip()]
            all_tags.update(tags)
    return sorted(list(all_tags))

@app.get("/api/tags/classify")
def classify_tags(theme: str, db: Session = Depends(get_db)):
    results = db.query(models.Document.tags).filter(models.Document.tags != None).all()
    all_tags = set()
    for row in results:
        if row[0]:
            clean_row = row[0].replace("{", "").replace("}", "").replace("[", "").replace("]", "")
            tags = [t.strip() for t in clean_row.split(",") if t.strip()]
            all_tags.update(tags)
    
    unique_tags = sorted(list(all_tags))
    if not unique_tags:
        return {"theme": theme, "tags": []}
        
    extracted_tags = classify_tags_by_theme(theme, unique_tags)
    return {"theme": theme, "tags": extracted_tags}

@app.get("/api/tree/classify")
def classify_dynamic_tree(theme: str, db: Session = Depends(get_db)):
    from sqlalchemy import inspect
    mapper = inspect(models.Document)
    available_columns = [column.key for column in mapper.columns]
    
    results = db.query(models.Document.tags).filter(models.Document.tags != None).all()
    all_tags = set()
    for row in results:
        if row[0]:
            clean_row = row[0].replace("{", "").replace("}", "").replace("[", "").replace("]", "")
            tags = [t.strip() for t in clean_row.split(",") if t.strip()]
            all_tags.update(tags)
    
    unique_tags = sorted(list(all_tags))
    
    tree_config = classify_dynamic_tree_by_theme(theme, available_columns, unique_tags)
    return tree_config

@app.get("/api/organizations")
@app.get("/organizations")
def list_organizations(db: Session = Depends(get_db)):
    # customer_name はカンマ区切りの文字列として格納される仕様に変更（タグと同様）
    results = db.query(models.Document.customer_name).filter(models.Document.customer_name != None).all()
    all_orgs = set()
    for row in results:
        if row[0]:
            clean_row = row[0].replace("{", "").replace("}", "").replace("[", "").replace("]", "")
            orgs = [o.strip() for o in clean_row.split(",") if o.strip()]
            all_orgs.update(orgs)
    return sorted(list(all_orgs))

@app.post("/api/chat")
def chat(request: schemas.ChatRequest, db: Session = Depends(get_db)):
    # 0. クエリ解析とインテント判定 (Metadata-aware analysis)
    analysis = analyze_query_and_filters(request.message, [h.dict() for h in request.history])
    search_query = analysis.get("standalone_query", request.message)
    is_search_required = analysis.get("is_search_required", True)
    
    context_text = ""
    references = []

    if is_search_required:
        # 1. メタデータによるドキュメントの事前絞り込み
        filters = analysis.get("filters", {})
        doc_ids = []
        
        # フィルタキーワードがある場合、該当するドキュメントを探す
        keywords = filters.get("file_names", []) + filters.get("customer_names", []) + filters.get("tags", [])
        if keywords:
            search_filters = []
            for kw in keywords:
                if kw:
                    search_filters.append(models.Document.file_name.ilike(f"%{kw}%"))
                    search_filters.append(models.Document.customer_name.ilike(f"%{kw}%"))
                    search_filters.append(models.Document.tags.ilike(f"%{kw}%"))
            
            if search_filters:
                docs = db.query(models.Document).filter(or_(*search_filters)).all()
                doc_ids = [d.id for d in docs]

        # 2. 埋め込みとベクトル検索（範囲制限付き）
        question_embedding = get_embedding(search_query)
        if question_embedding:
            # しきい値を 0.3 に厳格化してノイズを抑制
            query = db.query(models.DocumentChunk).filter(
                models.DocumentChunk.embedding.cosine_distance(question_embedding) < 0.3
            )
            
            # メタデータフィルタでドキュメントが特定されている場合、範囲を絞る
            if doc_ids:
                query = query.filter(models.DocumentChunk.document_id.in_(doc_ids))
            
            results = query.order_by(
                models.DocumentChunk.embedding.cosine_distance(question_embedding)
            ).limit(8).all()

            if results:
                # 3. コンテキスト構築
                context_parts = []
                seen_docs = set()
                for res in results:
                    doc = db.query(models.Document).filter(models.Document.id == res.document_id).first()
                    if doc:
                        context_parts.append(f"Source: {doc.file_name}\nContent: {res.content}")
                        if doc.id not in seen_docs:
                            references.append({"document_id": str(doc.id), "file_name": doc.file_name})
                            seen_docs.add(doc.id)
                context_text = "\n\n---\n\n".join(context_parts)

    # 4. 回答生成 (RAG結果が空でも、履歴に基づき回答)
    answer = generate_answer(search_query, context_text, [h.dict() for h in request.history])
    
    return {"answer": answer, "references": references}

@app.get("/api/documents/{document_id}/download")
def download_document(document_id: uuid.UUID, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Try multiple possible local paths
    file_ext = doc.file_name.split('.')[-1].lower()
    possible_paths = [
        f"uploads/{doc.id}.{file_ext}",
        f"backend/uploads/{doc.id}.{file_ext}",
        f"/app/uploads/{doc.id}.{file_ext}"
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            content_type, _ = mimetypes.guess_type(doc.file_name)
            if not content_type:
                content_type = "application/octet-stream"
            with open(path, "rb") as f:
                content = f.read()
            encoded_filename = quote(doc.file_name)
            return Response(
                content=content,
                media_type=content_type,
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
            )
    
    # Try Supabase download as fallback
    temp_path = f"/tmp/{doc.storage_path}"
    success = storage_service.download_file(doc.storage_path, temp_path)
    if success and os.path.exists(temp_path):
        content_type, _ = mimetypes.guess_type(doc.file_name)
        if not content_type:
            content_type = "application/octet-stream"
        with open(temp_path, "rb") as f:
            content = f.read()
        encoded_filename = quote(doc.file_name)
        return Response(
            content=content,
            media_type=content_type,
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )
    
    raise HTTPException(status_code=404, detail="File could not be retrieved from storage")

@app.get("/api/documents/{document_id}/export-md")
def export_document_md(document_id: uuid.UUID, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # リッチなレポート形式の構築
    try:
        if doc.summary and (doc.summary.startswith('{') or doc.summary.startswith('[')):
            summary_data = json.loads(doc.summary)
            summary_body = summary_data.get("detailed", doc.summary)
        else:
            summary_body = doc.summary or "要約は生成されていません。"
    except Exception:
        summary_body = doc.summary or "要約は生成されていません。"

    lines = [
        f"# {doc.file_name}",
        "",
        "## 資料情報",
        f"- **アップロード日時**: {doc.created_at.strftime('%Y/%m/%d %H:%M:%S')}",
        f"- **関連組織 / 名称**: {doc.customer_name or '未抽出'}",
        f"- **属性タグ**: {doc.tags or 'なし'}",
        "",
        "---",
        "",
        "## 解析結果（詳細要約）",
        "",
        summary_body,
        "",
        "---",
        "Generated by TANK AI ANALYTICS"
    ]
    md_content = "\n".join(lines)
        
    return Response(
        content=md_content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={doc.id}.md"}
    )

@app.post("/api/documents/{document_id}/reextract-tags")
def reextract_tags(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    background_tasks.add_task(reextract_tags_bg, str(document_id))
    return {"status": "processing"}

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: uuid.UUID, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Remove physical file if it exists
    if doc.storage_path and os.path.exists(doc.storage_path):
        try:
            os.remove(doc.storage_path)
        except Exception as e:
            print(f"Error deleting file {doc.storage_path}: {e}")
    
    # Delete from DB (ondelete="CASCADE" handles chunks)
    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}
