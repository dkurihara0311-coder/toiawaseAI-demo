# 企業資料ナレッジAIチャットシステム (Corporate Doc AI MVP)

業務資料（PDF）をアップロードし、Gemini AIを使って内容に基づいたチャットができるMVPシステムです。

## 1. 準備

### 1.1 プロジェクトディレクトリへの移動

コマンドプロンプトを開き、以下のコマンドでプロジェクトのルートフォルダへ移動してください。

```cmd
j:
cd "j:\Users\Administrator\Documents\toiawaseAI"
```

### 1.2 APIキーの取得
1. [Google AI Studio](https://aistudio.google.com/) にアクセスします。
2. `Get API key` をクリックして、新しいAPIキーを発行します。

### 1.3 環境設定
1. プロジェクトのルートディレクトリで以下を実行します。
```cmd
copy .env.example .env
```
2. `.env` をメモ帳などで開き、`GOOGLE_API_KEY` に発行したキーを貼り付けて保存します。

## 2. 起動手順

Docker Desktop等が起動していることを確認し、コマンドプロンプトで以下を実行します。

```cmd
docker compose up --build
```

起動後、ブラウザで以下のURLにアクセスします。
- フロントエンド: [http://localhost:3000](http://localhost:3000)
- バックエンド（API）: [http://localhost:8000](http://localhost:8000)

## 3. 使い方

1. 画面左側の「PDFをアップロード」ボタンから資料を選択します。
2. 解析が完了（ステータスが緑色）するまで数秒待ちます。
3. チャット入力欄から質問を投げます（例：「〇〇商事の見積金額は？」）。
4. 参照元資料と共にAIの回答が表示されます。

## 4. デモデータ

テスト用の見積書PDFを生成するスクリプトを用意しています。

```cmd
# ローカルにPythonとreportlabがある場合
python backend\scripts\generate_samples.py
```

## 5. 技術構成

- **Frontend**: Next.js 14, Tailwind CSS, Lucide React
- **Backend**: FastAPI, SQLAlchemy, pypdf
- **Database**: PostgreSQL 16 + pgvector (ベクトル検索)
- **AI**: Gemini 1.5 Flash (Google AI Studio)

## 6. トラブルシューティング

システムが正常に動作しない（以前のコードが残っている、データベースエラーが出る）場合は、以下の手順で環境をリセットしてください。

### 6.1 データベースとコンテナのリセット
データベースの定義変更（次元数の変更など）があった場合は、中身を一旦消去して再構築する必要があります。
```cmd
# ボリューム（データ保持）を含めて削除し、再起動
docker compose down -v
docker compose up --build
```

### 6.2 バックエンドのみ再度ビルド
バックエンドのコードを変更したのに反映されない場合は、以下を試してください。
```cmd
docker compose up -d --build backend
```

---
Developed by Antigravity
