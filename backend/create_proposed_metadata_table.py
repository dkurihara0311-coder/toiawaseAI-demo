import sqlalchemy
from sqlalchemy import create_engine, text
import sys

# 既存の接続情報
DB_URL = "postgresql://toiawaseragdb_user:8lc53dI9w2AaNMNnXplizuIyFIdyCiW7@dpg-d80ms2egvqtc73dmgpi0-a.ohio-postgres.render.com/toiawaseragdb"

print(f"Connecting to: {DB_URL}")

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
    engine = create_engine(DB_URL)
    with engine.connect() as conn:
        print("Executing schema update...")
        conn.execute(text(sql))
        conn.commit()
    print("SUCCESS: Remote DB schema updated. Added proposed_document_metadata table.")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
