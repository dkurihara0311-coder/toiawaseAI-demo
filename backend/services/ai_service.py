import os
import google.generativeai as genai
import json
import re
import time
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))

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

def get_model():
    generation_config = {
        "temperature": 0.2,
        "top_p": 0.95,
        "max_output_tokens": 8192,
    }
    
    safety_settings = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]
    
    return genai.GenerativeModel(
        model_name='models/gemini-2.5-flash',
        generation_config=generation_config,
        safety_settings=safety_settings
    )

def safe_generate_with_retry(model, prompt, max_retries=4):
    """Generate content with Gemini 2.5-flash, retrying several times on 429."""
    for attempt in range(max_retries):
        try:
            return model.generate_content(prompt)
        except Exception as e:
            if "429" in str(e):
                # リトライを重ねるごとに待機時間を少しずつ増やす (10s -> 20s -> 30s)
                wait_time = (attempt + 1) * 10
                print(f"DEBUG: Limit 429. Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
            elif attempt < max_retries - 1:
                time.sleep(2)
            else:
                raise e
    raise Exception(f"Failed after {max_retries} attempts.")

def extract_doc_metadata(text: str):
    """Efficient summary strategy to save quotas."""
    model = get_model()
    context_text = text[:1000000]
    char_count = len(text)
    
    is_eco_mode = char_count > 10000
    
    prompt = f"""
あなたは超一流のドキュメントアナリストです。資料を精査し、以下の情報を出力してください。

1. 【JSONメタデータ】
資料の種類、組織名、短い概要、タグをJSONで出力。
2. 【資料の章立て】
主要な章（見出し）を抽出。
{'各見出しについて、内容は書かず見出しのみを出力。' if is_eco_mode else '各見出しについて、詳細な分析内容を記述。'}

最後に【エグゼクティブ・サマリー】を1,000文字程度で記述。

資料：
---
{context_text}
---
"""
    try:
        response = safe_generate_with_retry(model, prompt)
        full_output = response.text
        
        # JSON部分
        metadata = {"document_type": "未分類", "customer_name": "未抽出", "summary": "", "tags": "資料"}
        try:
            json_match = re.search(r'\{.*\}', full_output, re.DOTALL)
            if json_match:
                metadata = json.loads(json_match.group())
        except:
            pass
            
        return {
            "document_type": metadata.get("document_type", "未分類"),
            "customer_name": metadata.get("customer_name", "未抽出"),
            "summary": metadata.get("summary", ""),
            "content_report": full_output,
            "tags": metadata.get("tags", "資料")
        }
    except Exception as e:
        print(f"Critical error in analysis: {e}")
        # 呼び出し元（main.py/analyze_bg）で status = 'failed' に更新させるため例外を投げる
        raise Exception(f"解析プロセス中に致命的なエラーが発生しました: {e}")

def generate_standalone_query(message: str, history: list):
    model = get_model()
    # 履歴を簡略化
    h_text = " ".join([h['content'] for h in history[-2:]]) # 直近2件のみ
    prompt = f"Query: {h_text} {message}"
    try:
        response = safe_generate_with_retry(model, prompt)
        return response.text.strip() if response else message
    except:
        return message

def generate_answer(question: str, context: str, history: list = None):
    model = get_model()
    # 命令を最短化
    prompt = f"資料に基づき簡潔に答えよ。資料:\n{context}\n問:{question}"
    try:
        response = safe_generate_with_retry(model, prompt)
        return response.text if response else "回答不可。"
    except:
        return "混雑中。時間を置いて再試行してください。"
