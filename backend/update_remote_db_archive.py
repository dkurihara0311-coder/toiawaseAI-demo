import sqlalchemy
from sqlalchemy import text
import sys
from database import engine

print("Connecting to database and updating schema for archive feature...")

sql = "ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;"

try:
    with engine.connect() as conn:
        print("Executing schema update...")
        conn.execute(text(sql))
        conn.commit()
    print("Schema update COMPLETED.")
except Exception as e:
    import traceback
    print("FAILED to update database:")
    traceback.print_exc()
    sys.exit(1)

