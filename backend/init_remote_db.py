import os
from sqlalchemy import text
import sys

# プロジェクトのパスをパスに追加してモデルを読み込めるようにする
sys.path.append(os.path.abspath("j:/Users/Administrator/Documents/toiawaseAI/backend"))
import models
from database import engine

print("Connecting to database and initializing schema...")

try:
    with engine.connect() as conn:
        print("Checking/Enabling pgvector extension...")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
        print("pgvector expansion checked.")

        print("Creating tables...")
        models.Base.metadata.create_all(bind=engine)
        print("Table creation checked.")

        # デモユーザーの作成（チャットに必要）
        from sqlalchemy.orm import Session
        with Session(engine) as session:
            DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
            user = models.User(id=DEMO_USER_ID, email="demo@example.com", display_name="Demo User")
            session.merge(user)
            session.commit()
            print("Demo user checked.")

    print("SUCCESS: DB initialization completed.")

except Exception as e:
    print(f"ERROR: {e}")

