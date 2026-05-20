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
表記ゆれを防ぐため、可能な限り以下の標準的なタグ名を使用してください：見積書, 要件定義書, 契約書, 提案書, 議事録, 請求書, マニュアル, 設計書, 報告書。もしこれらに該当しない場合は、内容に最も適した分かりやすいタグを独自に生成してかまいません。

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

def classify_tags_by_theme(theme: str, all_tags: list) -> list:
    """AIを使用して、入力されたテーマに合致するタグを既存タグリストから推論・抽出する"""
    if not all_tags:
        return []
        
    model = get_model()
    
    tags_str = ", ".join(all_tags)
    
    prompt = f"""
あなたは超一流のデータ分類スペシャリストです。
以下の「すべての属性タグ」のリストの中から、ユーザーが指定した「テーマ」に属する、あるいは関連性が高いと思われるタグを推論し、すべて抽出してください。

【テーマ】
{theme}

【すべての属性タグ】
{tags_str}

【出力形式】
抽出したタグの文字列のみを含むJSONの配列（リスト）形式でのみ出力してください。
例: ["タグA", "タグB"]
該当するタグが1つもない場合は空の配列 [] を出力してください。
余計な解説、バッククォート、マークダウン表記は一切含めないでください。
"""
    try:
        response = safe_generate_with_retry(model, prompt)
        
        # 応答からJSON配列部分を抽出
        json_match = re.search(r'\[.*\]', response.text, re.DOTALL)
        if json_match:
            extracted_tags = json.loads(json_match.group())
            if isinstance(extracted_tags, list):
                return [str(t).strip() for t in extracted_tags if t]
                
        # JSON抽出に失敗した場合は、フォールバック処理
        text_content = response.text.replace('[', '').replace(']', '').replace('"', '').replace("'", "")
        return [t.strip() for t in text_content.split(',') if t.strip()]
    except Exception as e:
        print(f"Error in classify_tags_by_theme: {e}")
        return []

def classify_dynamic_tree_by_theme(theme: str, available_columns: list, all_tags: list) -> dict:
    """AIを使用して、入力されたテーマに合致する分類軸（カラム）と処理方法を推論する"""
    model = get_model()
    
    columns_str = ", ".join(available_columns) if available_columns else "なし"
    tags_str = ", ".join(all_tags) if all_tags else "なし"
    
    prompt = f"""
あなたは超一流のデータアーキテクト兼データ分類スペシャリストです。
ユーザーが指定した「テーマ」に基づいて、ドキュメントのリストを階層ツリーで分類するための最適な【ターゲットカラム】と【グループ化の手法】を推論してください。

【ユーザー入力テーマ】
{theme}

【現在利用可能なカラム（メタデータフィールド）一覧】
{columns_str}

【既存の属性タグの一部（参考）】
{tags_str}

以下のJSONフォーマットでのみ出力してください。
{{
  "target_column": "選ばれたカラム名 (例: created_at, tags, customer_name, file_name など)",
  "grouping_type": "date" または "extension" または "exact_match" または "comma_separated" または "ai_extracted",
  "extracted_tree": {{
    "大分類（親カテゴリ）1": ["テーマに合致するタグ1", "テーマに合致するタグ2"],
    "大分類（親カテゴリ）2": ["テーマに合致するタグ3"]
  }}
}}

【各項目について】
- target_column: 利用可能なカラム一覧の中から、テーマに最も適した1つのカラム名を正確に選んでください。
- grouping_type: 以下のいずれかを選んでください。
  - "date": target_columnが日付（created_atなど）の場合
  - "extension": target_columnがファイル名（file_nameなど）で、そこから拡張子を抽出して分類すべき場合
  - "exact_match": カラムの値そのもので単純にグループ化する場合
  - "comma_separated": target_columnがカンマ区切りの文字列（customer_nameなど）の場合
  - "ai_extracted": target_columnがtags等で、既存の属性タグリストの中からテーマに関連するタグを抽出して分類する場合
- extracted_tree: grouping_type が "ai_extracted" の場合のみ出力してください。既存のタグリストから【テーマに厳密に関連するタグのみ】を抽出し、それらをあなたが考えた適切な「親カテゴリ名」でグループ化してJSONオブジェクト（辞書）として出力してください。テーマに少しでも無関係なタグは絶対に含めないでください。ai_extracted 以外の場合は空のオブジェクト {{}} にしてください。

余計な解説やマークダウン表記は一切含めず、純粋なJSON文字列のみを出力してください。
"""
    try:
        response = safe_generate_with_retry(model, prompt)
        
        # 応答からJSON部分を抽出
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            return {
                "target_column": result.get("target_column", "tags"),
                "grouping_type": result.get("grouping_type", "ai_extracted"),
                "extracted_tree": result.get("extracted_tree", {})
            }
            
        return {
            "target_column": "tags",
            "grouping_type": "ai_extracted",
            "extracted_tree": {}
        }
    except Exception as e:
        print(f"Error in classify_dynamic_tree_by_theme: {e}")
        return {
            "target_column": "tags",
            "grouping_type": "ai_extracted",
            "extracted_tree": {}
        }
