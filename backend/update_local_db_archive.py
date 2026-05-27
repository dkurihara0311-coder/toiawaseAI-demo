import os
import sqlalchemy
from sqlalchemy import create_engine, text
import sys
from dotenv import load_dotenv

load_dotenv()

database_url = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/toiawase_db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

print(f"Connecting to database and updating schema for archive feature...")

sql = "ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;"

try:
    engine = sqlalchemy.create_engine(database_url)
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print("Schema update COMPLETED.")
except Exception as e:
    import traceback
    print("FAILED to update database:")
    traceback.print_exc()
    sys.exit(1)
