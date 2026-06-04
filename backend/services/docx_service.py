import docx
from typing import List

def extract_text_from_docx(file_path: str) -> List[str]:
    """Extract text chunks from a DOCX file, grouped into paragraphs up to 1500 characters."""
    doc_obj = docx.Document(file_path)
    full_text = []
    for para in doc_obj.paragraphs:
        if para.text.strip():
            full_text.append(para.text)
    
    chunks = []
    current_chunk = ""
    for text in full_text:
        if len(current_chunk) + len(text) > 1500:
            chunks.append(current_chunk)
            current_chunk = text
        else:
            current_chunk += "\n" + text if current_chunk else text
    if current_chunk:
        chunks.append(current_chunk)
    
    return chunks
