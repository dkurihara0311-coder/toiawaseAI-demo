import os
import sqlalchemy
from sqlalchemy import create_engine, text
import sys
from dotenv import load_dotenv

load_dotenv()

database_url = os.getenv("DATABASE_URL")
if not database_url:
    print("DATABASE_URL is not set in .env")
    sys.exit(1)

if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

print(f"Connecting to database and updating schema for archive feature...")

sql = "ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;"

try:
    engine = sqlalchemy.create_engine(database_url)
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print("Schema update COMPLETED for remote database.")
except Exception as e:
    import traceback
    print("FAILED to update remote database:")
    traceback.print_exc()
    sys.exit(1)
