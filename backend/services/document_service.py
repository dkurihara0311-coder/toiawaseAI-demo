import os
import json
from sqlalchemy.orm import Session
import models
from services.ai_service import get_embeddings_batch, extract_doc_metadata
from services.storage_service import storage_service
from services.pdf_service import extract_text_from_pdf
from services.docx_service import extract_text_from_docx
from services.xlsx_service import extract_text_from_xlsx
from services.text_service import extract_text_from_text

def analyze_document(document_id: str, db: Session):
    """Extract text from various formats (PDF, DOCX, XLSX, TXT), chunk it, embed it, and save to DB."""
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        return

    try:
        doc.status = "processing"
        db.commit()

        # In local dev, the file should already be in /app/uploads/ (shared via volume or direct write)
        # Check local path first
        local_upload_path = f"/app/uploads/{doc.id}.{doc.file_name.split('.')[-1].lower()}"
        file_path = f"/tmp/{doc.storage_path}"

        if os.path.exists(local_upload_path):
            print(f"DEBUG: Using local file found at {local_upload_path}")
            file_path = local_upload_path
        elif not os.path.exists(file_path):
            print(f"DEBUG: Downloading {doc.storage_path} from Supabase...")
            os.makedirs("/tmp", exist_ok=True)
            success = storage_service.download_file(doc.storage_path, file_path)
            if not success:
                raise Exception("Failed to download file from storage")

        # ... (rest of extraction logic remains same)
        file_ext = doc.file_name.split(".")[-1].lower()
        chunks = []
        # ...

        print(f"DEBUG: Extracting text from {doc.file_name} (format: {file_ext})...")

        if file_ext == "pdf":
            chunks = extract_text_from_pdf(file_path)
        elif file_ext == "docx":
            chunks = extract_text_from_docx(file_path)
        elif file_ext == "xlsx":
            chunks = extract_text_from_xlsx(file_path)
        elif file_ext in ["txt", "md"]:
            chunks = extract_text_from_text(file_path)

        print(f"DEBUG: Extracted {len(chunks)} chunks of text.")
        
        if chunks:
            print(f"DEBUG: Generating embeddings for {len(chunks)} chunks...")
            # Generate embeddings in batches
            batch_size = 100
            for i in range(0, len(chunks), batch_size):
                batch_slice = chunks[i:i + batch_size]
                embeddings = get_embeddings_batch(batch_slice)
                
                if embeddings:
                    print(f"DEBUG: Saving batch {i//batch_size + 1} to database...")
                    for j, (text, emb) in enumerate(zip(batch_slice, embeddings)):
                        chunk = models.DocumentChunk(
                            document_id=doc.id,
                            chunk_index=i + j,
                            content=text,
                            embedding=emb
                        )
                        db.add(chunk)
                        db.add(chunk)
            db.commit()
        
        # 4. Extract Metadata (Summary, Tags, etc.)
        if chunks:
            full_text_sample = "\n".join(chunks)
            print(f"DEBUG: Extracting metadata for {doc.file_name}...")
            metadata = extract_doc_metadata(full_text_sample)
            
            doc.document_type = metadata.get("document_type", "未分類")
            doc.customer_name = metadata.get("customer_name", "")
            doc.summary = json.dumps({
                "brief": metadata.get("summary", ""),
                "detailed": metadata.get("content_report", "")
            }, ensure_ascii=False)
            doc.tags = metadata.get("tags", "")
            doc.custom_attributes = metadata.get("custom_attributes", {})
            db.commit()

        doc.status = "completed"
        db.commit()
        print(f"DEBUG: Analysis COMPLETED for {doc.file_name}")
    except Exception as e:
        print(f"Error analyzing document {document_id}: {e}")
        db.rollback()
        raise e

def reextract_document_tags(document_id: str, db: Session):
    """Re-extract metadata (tags, customer_name, summary) from the original file."""
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        return

    try:
        doc.status = "processing"
        db.commit()

        # 1. 元ファイルパスの特定・ダウンロード
        local_upload_path = f"/app/uploads/{doc.id}.{doc.file_name.split('.')[-1].lower()}"
        file_path = f"/tmp/{doc.storage_path}"

        if os.path.exists(local_upload_path):
            print(f"DEBUG: Using local file found at {local_upload_path}")
            file_path = local_upload_path
        elif not os.path.exists(file_path):
            print(f"DEBUG: Downloading {doc.storage_path} from Supabase...")
            os.makedirs("/tmp", exist_ok=True)
            success = storage_service.download_file(doc.storage_path, file_path)
            if not success:
                raise Exception("Failed to download file from storage")

        file_ext = doc.file_name.split(".")[-1].lower()
        chunks = []

        print(f"DEBUG: Re-extracting text from {doc.file_name} (format: {file_ext})...")

        if file_ext == "pdf":
            chunks = extract_text_from_pdf(file_path)
        elif file_ext == "docx":
            chunks = extract_text_from_docx(file_path)
        elif file_ext == "xlsx":
            chunks = extract_text_from_xlsx(file_path)
        elif file_ext in ["txt", "md"]:
            chunks = extract_text_from_text(file_path)

        if chunks:
            full_text_sample = "\n".join(chunks)
            print(f"DEBUG: Re-extracting metadata for {doc.file_name}...")
            metadata = extract_doc_metadata(full_text_sample)
            
            # Check if there is already a proposed record and delete it if so
            existing_proposed = db.query(models.ProposedDocumentMetadata).filter_by(document_id=doc.id).first()
            if existing_proposed:
                db.delete(existing_proposed)
                
            proposed_doc = models.ProposedDocumentMetadata(
                document_id=doc.id,
                document_type=metadata.get("document_type", "未分類"),
                customer_name=metadata.get("customer_name", ""),
                summary=json.dumps({
                    "brief": metadata.get("summary", ""),
                    "detailed": metadata.get("content_report", "")
                }, ensure_ascii=False),
                tags=metadata.get("tags", ""),
                custom_attributes=metadata.get("custom_attributes", {})
            )
            db.add(proposed_doc)
            
        doc.status = "review_pending"
        db.commit()
        print(f"DEBUG: Tag re-extraction COMPLETED for {doc.file_name}, waiting for review.")
    except Exception as e:
        print(f"Error re-extracting document tags {document_id}: {e}")
        db.rollback()
        try:
            doc.status = "failed"
            db.commit()
        except:
            pass
        raise e

