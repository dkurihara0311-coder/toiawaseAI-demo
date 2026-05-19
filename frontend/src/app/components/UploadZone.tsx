"use client";

import * as React from "react";
import { Upload } from "lucide-react";

interface UploadZoneProps {
  isDragging: boolean;
}

export const UploadZone = ({ isDragging }: UploadZoneProps) => {
  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 bg-indigo-600/20 backdrop-blur-md z-[100] border-4 border-dashed border-indigo-500 m-4 rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-300">
      <div className="glass-panel p-12 flex flex-col items-center gap-6 scale-110 pointer-events-none">
        <div className="p-6 bg-indigo-500/20 rounded-full animate-bounce">
          <Upload className="w-16 h-16 text-indigo-400" />
        </div>
        <div className="text-2xl font-bold text-white tracking-tight">ここにファイルをドロップ</div>
        <div className="text-gray-400 text-sm">PDF, DOCX, XLSX, TXT, MDファイルに対応しています</div>
      </div>
    </div>
  );
};
