import sqlalchemy
from sqlalchemy import text
import sys
import os

from database import engine

print("Connecting to database and updating schema...")

sql = """
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0;
"""

try:
    with engine.connect() as conn:
        print("Executing schema update...")
        conn.execute(text(sql))
        conn.commit()
    print("SUCCESS: DB schema updated.")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
