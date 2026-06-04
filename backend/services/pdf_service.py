from pypdf import PdfReader
from typing import List

def extract_text_from_pdf(file_path: str) -> List[str]:
    """Extract text page by page from a PDF file."""
    reader = PdfReader(file_path)
    pages_text = []
    for page in reader.pages:
        text = page.extract_text()
        if text.strip():
            pages_text.append(text)
    return pages_text

