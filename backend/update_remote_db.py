import sqlalchemy
from sqlalchemy import text
import sys

database_url = "postgresql://postgres.dqzhoedoubikpkwsndjs:toiawaseRag@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

print("Connecting to remote database and updating schema...")

sql = "ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT; ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT;"

try:
    engine = sqlalchemy.create_engine(database_url)
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print("Schema update COMPLETED for remote database.")
except Exception as e:
    print(f"FAILED to update remote database: {e}")
    sys.exit(1)
