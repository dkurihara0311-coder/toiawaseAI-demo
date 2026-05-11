import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

def register_fonts():
    # Windows用の日本語フォント (MS Gothic) を登録
    font_path = r"C:\Windows\Fonts\msgothic.ttc"
    if os.path.exists(font_path):
        try:
            # TTCの場合はフォント名を指定
            pdfmetrics.registerFont(TTFont("MS-Gothic", font_path))
            return "MS-Gothic"
        except Exception as e:
            print(f"Font registration failed: {e}")
    return "Helvetica" # フォールバック

def create_estimate(filename, date, amount, customer="〇〇商事 株式会社", status="送付済み", notes=""):
    font_name = register_fonts()
    c = canvas.Canvas(filename, pagesize=A4)
    width, height = A4
    
    # 御見積書 (日本語)
    c.setFont(font_name, 24)
    c.drawString(50, height - 80, "御 見 積 書")
    
    c.setFont(font_name, 12)
    c.drawString(50, height - 130, f"宛先: {customer} 御中")
    c.drawString(400, height - 130, f"日付: {date}")
    
    c.drawString(50, height - 170, "--------------------------------------------------------------------------------")
    c.setFont(font_name, 14)
    c.drawString(50, height - 200, "項目: 基幹システム開発 (初期構築フェーズ)")
    
    c.setFont(font_name, 16)
    c.drawString(50, height - 240, f"合計金額: ￥{amount} - (税込)")
    
    c.setFont(font_name, 12)
    c.drawString(50, height - 280, f"現在のステータス: {status}")
    c.drawString(50, height - 300, "--------------------------------------------------------------------------------")
    
    c.setFont(font_name, 12)
    c.drawString(50, height - 340, "備考:")
    c.drawString(70, height - 360, notes)
    
    # サンプルとしての詳細テキスト追加 (RAG検索用)
    c.setFont(font_name, 10)
    c.drawString(50, height - 420, "※本見積にはライセンス費用、データ移行費用、保守運用費用は含まれておりません。")
    c.drawString(50, height - 435, "※有効期限：発行日より30日間。")
    
    c.save()

if __name__ == "__main__":
    output_dir = "sample_pdfs"
    os.makedirs(output_dir, exist_ok=True)
    
    # 4月の見積
    create_estimate(
        os.path.join(output_dir, "estimate_2026_04.pdf"),
        "2026年04月10日",
        "3,520,000",
        notes="基幹システム導入の第1次提案分です。基本設計を含みます。"
    )
    
    # 5月の見積
    create_estimate(
        os.path.join(output_dir, "estimate_2026_05.pdf"),
        "2026年05月15日",
        "4,180,000",
        status="検討中",
        notes="追加要件（レポート出力機能）を反映した改訂版です。"
    )
    
    print(f"日本語対応のデモ用PDFを {output_dir} に生成しました。")
