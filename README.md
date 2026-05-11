# 企業資料ナレッジAIチャットシステム (Corporate Doc AI)

社内に蓄積された多様なドキュメント（PDF, Word, Excel, テキスト）を統合的に解析し、Gemini 2.5 Flashを用いて高精度なRAG（検索拡張生成）チャットを提供するシステムです。

## 🚀 主な特徴

- **マルチフォーマット解析**: PDF、Microsoft Word (.docx)、Microsoft Excel (.xlsx)、プレーンテキスト (.txt, .md) を自動判別して構造化解析。
- **最新AIエンジンの採用**: Google の最新モデル `gemini-2.5-flash` を搭載。高速かつ長文の文脈理解（Context Window）を実現。
- **高精度ベクトル検索**: 資料を意味ベースで検索し、回答の根拠となった資料をチャット上で提示。
- **モダンなUI/UX**: ダークモードを基調とした、直感的で美しいユーザーインターフェース。
- **クラウドネイティブ構成**: Supabase (Database/Storage) と Render を活用した、堅牢でスケーラブルな構成。

---

## 🛠 技術スタック

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Design Policy**: モダン・プレミアムデザイン（Glassmorphism）

### Backend
- **API**: FastAPI (Python 3.12+)
- **ORM**: SQLAlchemy
- **Document Parsers**: PyPDF, python-docx, openpyxl
- **AI Integration**: Google Generative AI (Gemini SDK)

### Infrastructure (Cloud)
- **Database**: Supabase (PostgreSQL 16 + pgvector)
- **Object Storage**: Supabase Storage
- **Deployment**: Render (Backend), Vercel (Frontend)

---

## 📖 使い方 (デモ手順)

1. **資料の準備**:
   お手持ちの Word、Excel、PDF資料（もしくはメモ帳などのテキスト）を準備します。
2. **アップロード**:
   画面左側の「資料をアップロード」ボタン、または画面へのドラッグ＆ドロップで資料を登録します。
3. **AIによる解析**:
   資料がクラウドに保存され、AIが内容を理解・ベクトル化します（ステータスが「完了」になるまで数秒お待ちください）。
4. **チャット対話**:
   「〇〇についての資料をまとめて」「この見積書の内容を要約して」など、自然言語で自由に質問してください。
   AIが過去の文脈を最大限に保持したまま、最適な回答を生成します。

---

## ⚙️ セットアップ手順 (開発者向け)

### 環境変数の設定
`backend/.env` および `frontend/.env.local` に以下の情報を設定してください。

- `GEMINI_API_KEY`: Google AI Studio より取得
- `DATABASE_URL`: Supabase の PostgreSQL 接続URI
- `SUPABASE_URL` / `SUPABASE_KEY`: Supabase プロジェクト設定より取得
- `NEXT_PUBLIC_API_URL`: デプロイされたバックエンドAPIのURL

### ローカル起動 (Docker)
```bash
docker compose up --build
```
- フロントエンド: [http://localhost:3000](http://localhost:3000)
- バックエンド: [http://localhost:8000](http://localhost:8000)

---
Developed by Antigravity
