import sqlalchemy
from sqlalchemy import text
import sys

from database import engine

print("Connecting to application database and updating schema...")

sql = """
ALTER TABLE documents ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;
"""

try:
    with engine.connect() as conn:
        print("Executing schema update...")
        conn.execute(text(sql))
        conn.commit()
    print("SUCCESS: DB schema updated with custom_attributes.")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
