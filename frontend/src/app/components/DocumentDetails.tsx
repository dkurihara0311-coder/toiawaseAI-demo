"use client";

import * as React from "react";
// @ts-ignore
import { X, Trash2, FileText, MoreVertical, RefreshCcw as RefreshCw } from "lucide-react";
import { Document } from "../types";

interface DocumentDetailsProps {
  doc: Document;
  onClose: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDownload: (id: string, type: 'original' | 'md') => void;
}

export const DocumentDetails = ({
  doc,
  onClose,
  onDelete,
  onDownload
}: DocumentDetailsProps) => {
  // 要約のパースロジックを完全復元
  const getSummaryContent = () => {
    if (doc.status === 'failed') {
      return <div className="text-red-400 italic">解析に失敗しました。ファイル形式を確認して再度アップロードしてください。</div>;
    }
    if (doc.status !== 'completed') {
      return <div className="flex items-center gap-2 text-gray-500 italic text-[11px]"><RefreshCw className="w-3 h-3 animate-spin"/>解析中...</div>;
    }

    try {
      const summaryText = (doc.summary || "").trim();
      // JSON形式かどうかをより確実に判定
      if (summaryText.includes('{') && summaryText.includes('}')) {
        try {
          const data = JSON.parse(summaryText);
          return data.brief || data.summary || summaryText;
        } catch (innerE) {
          return summaryText;
        }
      }
      return summaryText || "概要は生成されませんでした。";
    } catch (e) {
      return doc.summary || "概要は生成されませんでした。";
    }
  };

  return (
    <div className="w-[450px] p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-bold text-white">資料詳細</h3>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-6 h-6 text-gray-400 hover:text-white" />
        </button>
      </div>
      
      <div className="glass-panel p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-indigo-500/20 rounded-2xl">
            <FileText className="w-8 h-8 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate text-lg text-white" title={doc.file_name}>{doc.file_name}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1 font-bold">Status: {doc.status}</div>
            
            <div className="flex flex-wrap gap-2 mt-4">
              <button 
                onClick={() => onDownload(doc.id, 'original')}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
              >
                <FileText className="w-4 h-4" />
                ダウンロード
              </button>
              <button 
                onClick={() => onDownload(doc.id, 'md')}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg shadow-purple-500/20"
              >
                <FileText className="w-4 h-4" />
                要約ダウンロード
              </button>
            </div>
          </div>
        </div>
        
        <div className="space-y-4 pt-4 border-t border-white/5 font-sans">
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">関連組織 / 名称</div>
            <div className="text-sm font-medium text-gray-200">{doc.customer_name || '未抽出'}</div>
          </div>
          {doc.tags && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">属性タグ</div>
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.split(',').map((tag: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-md text-[10px]">
                    #{tag.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">アップロード日時</div>
            <div className="text-sm font-medium text-gray-200">{new Date(doc.created_at).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 glass-panel p-6 font-mono text-[11px] leading-relaxed overflow-y-auto mb-6 custom-scrollbar">
        <div className="text-indigo-400 mb-2 font-bold tracking-wider">【資料の概要】</div>
        <div className="text-gray-300 leading-relaxed italic whitespace-pre-wrap">
          {getSummaryContent()}
        </div>
      </div>

      {/* 資料の破棄セクション */}
      <div className="pt-6 border-t border-red-500/20">
        <button 
          onClick={(e: React.MouseEvent) => onDelete(doc.id, e)}
          className="w-full flex items-center justify-center gap-2 p-3 bg-red-600/5 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-bold transition-all group"
        >
          <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
          この資料を完全に削除する
        </button>
      </div>
    </div>
  );
};
