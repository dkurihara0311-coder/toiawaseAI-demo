import sqlalchemy
from sqlalchemy import text
import sys
from database import engine

print("Connecting to database and creating proposed_document_metadata table...")

sql = """
CREATE TABLE IF NOT EXISTS proposed_document_metadata (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    tags TEXT,
    custom_attributes JSONB,
    summary TEXT,
    customer_name VARCHAR,
    document_type VARCHAR
);
"""

try:
    with engine.connect() as conn:
        print("Executing schema update...")
        conn.execute(text(sql))
        conn.commit()
    print("SUCCESS: DB schema updated. Added proposed_document_metadata table.")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)

