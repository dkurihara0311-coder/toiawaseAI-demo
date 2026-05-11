import os
import uuid
from fastapi import FastAPI, Depends, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List

import models, schemas, database
from database import engine, get_db, SessionLocal
from services.document_service import analyze_document
from services.storage_service import storage_service
from services.ai_service import get_embedding, generate_answer, generate_standalone_query

app = FastAPI(title="Corporate Doc AI MVP")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return {"message": "Welcome to Corporate Doc AI MVP API"}

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
    db = SessionLocal()
    try:
        analyze_document(document_id, db)
    finally:
        db.close()

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
        status="uploaded"
    )
    db.add(doc)
    db.commit()
    
    background_tasks.add_task(analyze_bg, str(file_id))
    
    return {"file_id": file_id, "status": "processing"}

@app.get("/api/documents")
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(models.Document).order_by(models.Document.created_at.desc()).all()
    return docs

@app.post("/api/chat")
def chat(request: schemas.ChatRequest, db: Session = Depends(get_db)):
    # 0. Contextualize the question (Query Re-writing)
    search_query = generate_standalone_query(request.message, [h.dict() for h in request.history])
    
    # 1. Embed the search-friendly query
    question_embedding = get_embedding(search_query)
    if not question_embedding:
        raise HTTPException(status_code=500, detail="Failed to generate embedding for the question.")

    # 2. Vector Search (Top 15)
    results = db.query(models.DocumentChunk).order_by(
        models.DocumentChunk.embedding.cosine_distance(question_embedding)
    ).limit(15).all()

    if not results:
        return {"answer": "該当する情報は、現在閲覧可能な資料上では確認できません。", "references": []}

    # 3. Form Context
    context_parts = []
    references = []
    seen_docs = set()
    for res in results:
        doc = db.query(models.Document).filter(models.Document.id == res.document_id).first()
        if doc:
            context_parts.append(f"Source: {doc.file_name}\nContent: {res.content}")
            if doc.id not in seen_docs:
                references.append({"document_id": str(doc.id), "file_name": doc.file_name})
                seen_docs.add(doc.id)

    context_text = "\n\n---\n\n".join(context_parts)

    # 4. Generate Answer with Context and History
    answer = generate_answer(request.message, context_text, [h.dict() for h in request.history])

    return {
        "answer": answer,
        "references": references
    }

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
