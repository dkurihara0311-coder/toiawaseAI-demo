from pypdf import PdfReader
from sqlalchemy.orm import Session
import models
from services.ai_service import get_embedding, get_embeddings_batch

def analyze_pdf(document_id: str, db: Session):
    """Extract text from PDF, chunk it, embed it, and save to DB."""
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        return

    try:
        doc.status = "processing"
        db.commit()

        reader = PdfReader(doc.storage_path)
        page_texts = []
        print(f"DEBUG: Extracting text from {doc.file_name}...")
        for page in reader.pages:
            text = page.extract_text()
            if text.strip():
                page_texts.append(text)
        print(f"DEBUG: Extracted {len(page_texts)} pages of text.")
        
        if page_texts:
            # Generate embeddings in batches of 100 (API limit)
            batch_size = 100
            for i in range(0, len(page_texts), batch_size):
                batch_slice = page_texts[i:i + batch_size]
                print(f"DEBUG: Requesting embeddings for batch {i//batch_size + 1} ({len(batch_slice)} texts)...")
                embeddings = get_embeddings_batch(batch_slice)
                
                if embeddings:
                    print(f"DEBUG: Received {len(embeddings)} embeddings from Gemini.")
                    for j, (text, emb) in enumerate(zip(batch_slice, embeddings)):
                        chunk = models.DocumentChunk(
                            document_id=doc.id,
                            chunk_index=i + j,
                            content=text,
                            embedding=emb
                        )
                        db.add(chunk)
                    print(f"DEBUG: Saved batch {i//batch_size + 1} to database.")
                else:
                    print(f"ERROR: Failed to get embeddings for batch {i//batch_size + 1}")
        
        doc.status = "completed"
        db.commit()
        print(f"DEBUG: PDF analysis COMPLETED for {doc.file_name}")
    except Exception as e:
        print(f"Error analyzing PDF {document_id}: {e}")
        doc.status = "failed"
        db.commit()
