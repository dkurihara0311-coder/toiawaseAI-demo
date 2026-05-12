import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import sys

# プロジェクトのパスをパスに追加してモデルを読み込めるようにする
sys.path.append(os.path.abspath("j:/Users/Administrator/Documents/toiawaseAI/backend"))
import models

# ユーザーから提示された接続文字列（外部接続用ホスト名に調整が必要な場合がある）
# ひとまず提示されたものをベースにする
# Renderの外部接続用ホスト名は通常 dpg-xxx.ohio-postgres.render.com のようになる
DB_URL = "postgresql://toiawaseragdb_user:8lc53dI9w2AaNMNnXplizuIyFIdyCiW7@dpg-d80ms2egvqtc73dmgpi0-a.ohio-postgres.render.com/toiawaseragdb"

print(f"Connecting to: {DB_URL}")

try:
    engine = create_engine(DB_URL)
    
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

    print("SUCCESS: Remote DB initialization completed.")

except Exception as e:
    print(f"ERROR: {e}")
