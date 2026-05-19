import sqlalchemy
from sqlalchemy import create_engine, text
import sys
import os

# 既存の接続情報
DB_URL = "postgresql://toiawaseragdb_user:8lc53dI9w2AaNMNnXplizuIyFIdyCiW7@dpg-d80ms2egvqtc73dmgpi0-a.ohio-postgres.render.com/toiawaseragdb"

print(f"Connecting to: {DB_URL}")

sql = "ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT; ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT; ALTER TABLE documents ADD COLUMN IF NOT EXISTS customer_name TEXT; ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0;"

try:
    engine = create_engine(DB_URL)
    with engine.connect() as conn:
        print("Executing schema update...")
        conn.execute(text(sql))
        conn.commit()
    print("SUCCESS: Remote DB schema updated.")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
