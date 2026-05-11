import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

def get_embedding(text: str):
    """Get embedding from Gemini Studio API."""
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_document"
        )
        return result['embedding']
    except Exception as e:
        print(f"Error getting embedding: {e}")
        return None

def get_embeddings_batch(texts: list[str]):
    """Get multiple embeddings in a single API call (Batching)."""
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=texts,
            task_type="retrieval_document"
        )
        return result['embedding']
    except Exception as e:
        print(f"Error getting batch embeddings: {e}")
        return None

def generate_standalone_query(message: str, history: list):
    """Convert a follow-up question into a standalone search query based on history."""
    if not history:
        return message
    
    model = genai.GenerativeModel('models/gemini-2.5-flash')
    history_text = "\n".join([f"{h['role']}: {h['content']}" for h in history])
    prompt = f"""
以下の対話履歴を踏まえて、ユーザーの最新のメッセージを、資料検索に最適な「単独の検索クエリ」に変換してください。
ユーザーが「なんで？」や「それはどこにある？」と言った場合、何についての話かを履歴から補完してください。
余計な解説は不要です。クエリのみを出力してください。

対話履歴:
{history_text}

ユーザーの最新メッセージ:
{message}

検索用クエリ:"""
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Error generating standalone query: {e}")
        return message

def generate_answer(question: str, context: str, history: list = None):
    """Generate answer based on context and history using Gemini."""
    model = genai.GenerativeModel('models/gemini-2.5-flash')
    
    history_section = ""
    if history:
        history_text = "\n".join([f"{h['role']}: {h['content']}" for h in history])
        history_section = f"以前の会話履歴:\n{history_text}\n\n"

    prompt = f"""
あなたは社内資料検索AIです。
{history_section}提供された資料断片（コンテキスト）を細部まで精査し、ユーザーの質問に答えてください。

回答の指針：
- 表形式のデータや日付（例：5月、05月、2024/05）の表記揺れを考慮して名寄せ・推論してください。
- 根拠資料に明確に存在する情報のみを回答してください。
- 以前の自分の回答に誤りがあったとユーザーから指摘された場合、コンテキストを再確認して誠実に対応してください。
- 資料内に該当する情報が全く見当たらない場合のみ、「該当する情報は、現在閲覧可能な資料上では確認できません。」と回答してください。

コンテキスト：
---
{context}
---

ユーザーの質問：
{question}
"""
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Error generating answer: {e}")
        return "申し訳ありません。回答の生成中にエラーが発生しました。"
