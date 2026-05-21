import sqlalchemy
from sqlalchemy import create_engine, text
import sys

database_url = "postgresql://user:password@localhost:5432/toiawase_db"

print("Connecting to LOCAL database and updating schema...")

sql = "ALTER TABLE documents ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;"

try:
    engine = sqlalchemy.create_engine(database_url)
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print("Schema update COMPLETED for local database.")
except Exception as e:
    print(f"FAILED to update local database: {e}")
    sys.exit(1)
