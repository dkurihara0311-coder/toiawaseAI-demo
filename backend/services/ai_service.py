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
資料の種類、組織名、短い概要、タグをJSONで出力してください。
組織名（関連企業）が複数ある場合はカンマ区切りの文字列として "customer_name": "企業A, 企業B" の形式で含めてください。
タグは資料の内容を表すキーワードを複数、カンマ区切りの文字列として "tags": "タグ1, タグ2" の形式で含めてください。

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
            
        # タグのクリーンアップ: {} や [] などの記号が混入する場合があるため除去
        raw_tags = metadata.get("tags", "資料")
        if isinstance(raw_tags, list):
            raw_tags = ", ".join(raw_tags)
        
        clean_tags = str(raw_tags).replace("{", "").replace("}", "").replace("[", "").replace("]", "").strip()
            
        return {
            "document_type": metadata.get("document_type", "未分類"),
            "customer_name": metadata.get("customer_name", "未抽出"),
            "summary": metadata.get("summary", ""),
            "content_report": full_output,
            "tags": clean_tags
        }
    except Exception as e:
        print(f"Critical error in analysis: {e}")
        # 呼び出し元（main.py/analyze_bg）で status = 'failed' に更新させるため例外を投げる
        raise Exception(f"解析プロセス中に致命的なエラーが発生しました: {e}")

def analyze_query_and_filters(message: str, history: list):
    """Analyze user intent, rewrite query, and extract metadata filters in one call."""
    model = get_model()
    h_text = "\n".join([f"{h['role']}: {h['content']}" for h in history[-5:]])
    
    prompt = f"""
あなたは超一流のプロンプトエンジニア兼検索アナリストです。
現在の会話履歴と最新の問いから、資料検索の必要性と、検索に必要なメタデータフィルタを抽出してください。

【会話履歴】
{h_text}

【最新の問い】
{message}

【出力形式】
必ず以下のJSON形式でのみ出力してください。余計な解説は不要です。
{{
  "is_search_required": boolean,  // 資料検索が必要な事実確認や情報抽出の問いか
  "standalone_query": "string",   // 履歴を考慮して単体で成立するように再構成された検索クエリ
  "filters": {{
    "file_names": ["string"],      // 関連するファイル名や資料名のキーワード（例: "見積書", "規約"）
    "customer_names": ["string"],  // 関連する顧客名や組織名のキーワード
    "tags": ["string"]             // 関連する属性タグのキーワード
  }},
  "intent": "DOCUMENT_QUERY" | "CONVERSATION"  // 文脈維持の会話か、資料への問いか
}}

【重要ルール】
- 挨拶、感謝、指示（「要約して」「続けて」等）のみの場合は、is_search_required: false とすること。
- 資料の特定につながる固有名詞やキーワードがあれば必ず抽出すること。
"""
    try:
        response = safe_generate_with_retry(model, prompt)
        # JSON部分を抽出
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"Error in query analysis: {e}")
    
    # Fallback
    return {
        "is_search_required": True,
        "standalone_query": message,
        "filters": {"file_names": [], "customer_names": [], "tags": []},
        "intent": "DOCUMENT_QUERY"
    }

def generate_standalone_query(message: str, history: list):
    # This remains for backward compatibility or simple use-cases, 
    # but the API will shift to analyze_query_and_filters.
    model = get_model()

def generate_answer(question: str, context: str, history: list = None):
    model = get_model()
    # 履歴を直近15件まで保持して判断材料にする
    h_text = "\n".join([f"{h['role']}: {h['content']}" for h in (history or [])[-15:]])
    prompt = f"""
【最優先命令】
提供された「資料」と「会話の経緯」のみに基づいて最新の問いに答えよ。
提供されていない情報は、たとえ一般的知識であっても回答に使用してはならない。
資料外の知識で補完せず、不明な点は「資料および履歴には記載がありません」と誠実に答えよ。

【資料】
{context if context else "（利用可能な資料はありません）"}

【具体的な会話の経緯】
{h_text}

【最新の問い】
{question}
"""
    try:
        response = safe_generate_with_retry(model, prompt)
        return response.text if response else "応答を生成できませんでした。"
    except:
        return "混雑中。時間を置いて再試行してください。"
