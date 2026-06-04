"use client";

import * as React from "react";
// @ts-ignore
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal = ({ isOpen, fileName, onClose, onConfirm }: DeleteConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] animate-in fade-in duration-200">
      <div className="bg-[#101018] border border-white/10 rounded-2xl w-[500px] flex flex-col shadow-2xl shadow-black animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-2 p-6 border-b border-white/10 shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-bold text-red-400/90">この操作は取り消せません。</h2>
        </div>
        
        {/* Content */}
        <div className="p-6 text-sm text-gray-300">
          <p className="mb-2">以下の資料を完全に削除しますか？</p>
          <div className="bg-white/5 border border-white/5 rounded-lg p-3 text-white font-medium truncate mb-4" title={fileName}>
            {fileName}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-white/10 shrink-0 bg-black/20 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-red-500/20"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
};
