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
  onReextractTags: (id: string) => void;
  onOpenReviewModal?: (id: string) => void;
}

export const DocumentDetails = ({
  doc,
  onClose,
  onDelete,
  onDownload,
  onReextractTags,
  onOpenReviewModal
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
    <div className="w-[450px] h-full flex flex-col overflow-hidden bg-[#0A0A10]">
      {/* Header - 固定 */}
      <div className="flex-shrink-0 flex items-center justify-between p-8 pb-6">
        <h3 className="text-lg font-bold text-white">資料詳細</h3>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-6 h-6 text-gray-400 hover:text-white" />
        </button>
      </div>
      
      {/* メインスクロールエリア */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-4">
        {/* min-h-full で画面に余裕がある場合は全体に広がり、足りない場合は親がスクロールする */}
        <div className="flex flex-col gap-6 min-h-full">
          
          {/* 上部パネル（属性情報）- 画面の余りをすべて吸収し、内部スクロール */}
          <div className="glass-panel flex-1 flex flex-col min-h-[300px] overflow-hidden">
            <div className="p-6 overflow-y-auto custom-scrollbar h-full flex flex-col">
              <div className="flex items-center gap-4 mb-4 shrink-0">
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
              
              {doc.status === 'review_pending' && (
                <div className="shrink-0 mb-4 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <div className="text-orange-400 font-bold text-sm mb-1">抽出結果の確認待ちです</div>
                  <div className="text-gray-400 text-[10px] mb-3">AIによる新しい抽出結果を確認し、反映してください。</div>
                  <button
                    onClick={() => onOpenReviewModal && onOpenReviewModal(doc.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-orange-500/20 active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    抽出結果を確認・反映する
                  </button>
                </div>
              )}
              
              <div className="space-y-4 pt-4 border-t border-white/5 font-sans shrink-0">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">関連組織 / 名称</div>
                  <div className="text-sm font-medium text-gray-200">{doc.customer_name || '未抽出'}</div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-gray-500 uppercase font-bold">属性タグ</span>
                    <button
                      onClick={() => onReextractTags(doc.id)}
                      disabled={doc.status === 'processing' || doc.status === 'uploaded' || doc.status === 'review_pending'}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
                      再抽出
                    </button>
                  </div>
                  {doc.tags ? (
                    <div className="flex flex-wrap gap-1.5">
                      {doc.tags.split(',').map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-md text-[10px]">
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-gray-500 italic">なし</div>
                  )}
                </div>
                
                {doc.custom_attributes && Object.keys(doc.custom_attributes).length > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 mt-4">固有属性</div>
                    <div className="grid grid-cols-1 gap-2">
                      {Object.entries(doc.custom_attributes).map(([key, value], i) => {
                        if (!value || key === "文書種類" || key === "document_type") return null;
                        return (
                          <div key={i} className="flex flex-col bg-white/5 rounded px-3 py-1.5 border border-white/10">
                            <span className="text-[10px] text-gray-400 font-bold mb-0.5">{key}</span>
                            <span className="text-xs font-medium text-gray-200 truncate" title={String(value)}>{String(value)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">アップロード日時</div>
                  <div className="text-sm font-medium text-gray-200">{new Date(doc.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 下部パネル（概要）- コンテンツ量に合わせて縮み、最大35vhで内部スクロール */}
          <div className="glass-panel flex-none flex flex-col max-h-[35vh] overflow-hidden">
            <div className="p-6 font-mono text-[11px] leading-relaxed overflow-y-auto custom-scrollbar h-full">
              <div className="text-indigo-400 mb-2 font-bold tracking-wider">【資料の概要】</div>
              <div className="text-gray-300 leading-relaxed italic whitespace-pre-wrap">
                {getSummaryContent()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 資料の破棄セクション - 最下部に固定 */}
      <div className="flex-shrink-0 p-8 pt-4 pb-8 border-t border-white/10 bg-black/20 mt-auto">
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
