import openpyxl
from typing import List

def extract_text_from_xlsx(file_path: str) -> List[str]:
    """Extract text chunks from an XLSX file, sheet by sheet, splitting sheets if too large."""
    wb = openpyxl.load_workbook(file_path, data_only=True)
    chunks = []
    for sheet in wb.worksheets:
        sheet_data = []
        for row in sheet.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                row_text = " | ".join([str(cell) if cell is not None else "" for cell in row])
                sheet_data.append(row_text)
        
        if sheet_data:
            sheet_text = f"Sheet: {sheet.title}\n" + "\n".join(sheet_data)
            if len(sheet_text) > 5000:
                for i in range(0, len(sheet_text), 4000):
                    chunks.append(sheet_text[i:i+4000])
            else:
                chunks.append(sheet_text)
                
    return chunks
