from typing import List

def extract_text_from_text(file_path: str) -> List[str]:
    """Extract text chunks from a TXT or MD file, split into 1500 character chunks."""
    chunks = []
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
        for i in range(0, len(content), 1500):
            chunks.append(content[i:i+1500])
    return chunks
