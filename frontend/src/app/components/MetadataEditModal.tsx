"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import axios from "axios";
// @ts-ignore
import { X, Plus, Trash2, Save } from "lucide-react";
import { Document } from "../types";

interface MetadataEditModalProps {
  isOpen: boolean;
  doc: Document;
  onClose: () => void;
  onSuccess: () => void;
}

export const MetadataEditModal = ({ isOpen, doc, onClose, onSuccess }: MetadataEditModalProps) => {
  const [tags, setTags] = useState<string[]>([]);
  const [customAttrs, setCustomAttrs] = useState<{ key: string; value: string }[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Initializing API base URL
  const API_URL = (() => {
    const baseUrl = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) 
      ? process.env.NEXT_PUBLIC_API_URL 
      : (typeof window !== "undefined" 
          ? `${window.location.protocol}//${window.location.hostname}:${window.location.hostname === "localhost" ? "8000" : "10000"}`
          : "http://localhost:8000");
    return baseUrl ? baseUrl.replace(/\/$/, "") : "";
  })();

  useEffect(() => {
    if (isOpen) {
      setTags(doc.tags ? doc.tags.split(",").map(t => t.trim()).filter(t => t) : []);
      const attrsArray = [];
      if (doc.custom_attributes) {
        for (const [k, v] of Object.entries(doc.custom_attributes)) {
          attrsArray.push({ key: k, value: String(v) });
        }
      }
      setCustomAttrs(attrsArray);
      setCustomerName(doc.customer_name || "");
    }
  }, [isOpen, doc]);

  if (!isOpen) return null;

  const formatDateStr = (val: string): string => {
    const match1 = val.match(/^(\d{4})[-\/年\.・\s]+(\d{1,2})[-\/月\.・\s]+(\d{1,2})[日\s]*$/);
    if (match1) {
      return `${match1[1]}-${match1[2].padStart(2, '0')}-${match1[3].padStart(2, '0')}`;
    }
    const match2 = val.match(/^(\d{4})[-\/年\.・\s]+(\d{1,2})[-\/月\.・\s]*(月末|末日)[日\s]*$/);
    if (match2) {
      const y = parseInt(match2[1], 10);
      const m = parseInt(match2[2], 10);
      if (m >= 1 && m <= 12) {
        const lastDay = new Date(y, m, 0).getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }
    }
    return val;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleanTags = tags.map(t => formatDateStr(t.trim())).filter(t => t);
      const tagsString = cleanTags.join(", ");
      
      const attributesObj: Record<string, string> = {};
      customAttrs.forEach(attr => {
        if (attr.key.trim()) {
          attributesObj[attr.key.trim()] = formatDateStr(attr.value.trim());
        }
      });

      await axios.patch(`${API_URL}/api/documents/${doc.id}/metadata`, {
        tags: tagsString,
        custom_attributes: attributesObj,
        customer_name: customerName.trim()
      });
      onSuccess();
    } catch (e) {
      alert("保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = () => setTags([...tags, ""]);
  const updateTag = (index: number, val: string) => {
    const newTags = [...tags];
    newTags[index] = val;
    setTags(newTags);
  };
  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const addAttr = () => setCustomAttrs([...customAttrs, { key: "", value: "" }]);
  const updateAttrKey = (index: number, key: string) => {
    const newAttrs = [...customAttrs];
    newAttrs[index].key = key;
    setCustomAttrs(newAttrs);
  };
  const updateAttrValue = (index: number, val: string) => {
    const newAttrs = [...customAttrs];
    newAttrs[index].value = val;
    setCustomAttrs(newAttrs);
  };
  const removeAttr = (index: number) => {
    setCustomAttrs(customAttrs.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]">
      <div className="bg-[#101018] border border-white/10 rounded-2xl w-[600px] max-h-[90vh] flex flex-col shadow-2xl shadow-black">
        <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <h2 className="text-xl font-bold text-white">属性の編集</h2>
          <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-white transition-colors disabled:opacity-50">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
          
          {/* 関連企業 */}
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">関連組織 / 名称</div>
            <input
              type="text"
              value={customerName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="関連企業名を入力..."
            />
          </div>

          {/* 属性タグ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-400 uppercase">属性タグ</div>
              <button onClick={addTag} className="flex items-center gap-1 px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded text-xs transition-colors">
                <Plus className="w-3 h-3" />
                タグを追加
              </button>
            </div>
            <div className="space-y-2">
              {tags.map((tag, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-1 bg-white/5 border border-white/10 rounded flex items-center px-2">
                    <span className="text-indigo-400 font-bold mr-1">#</span>
                    <input
                      type="text"
                      value={tag}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTag(index, e.target.value)}
                      className="flex-1 bg-transparent py-1.5 text-sm text-white focus:outline-none"
                      placeholder="タグ名"
                    />
                  </div>
                  <button onClick={() => removeTag(index)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {tags.length === 0 && (
                <div className="text-sm text-gray-500 italic">タグはありません</div>
              )}
            </div>
          </div>

          {/* 固有属性 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-400 uppercase">固有属性</div>
              <button onClick={addAttr} className="flex items-center gap-1 px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded text-xs transition-colors">
                <Plus className="w-3 h-3" />
                属性を追加
              </button>
            </div>
            <div className="space-y-2">
              {customAttrs.map((attr, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={attr.key}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAttrKey(index, e.target.value)}
                    className="w-1/3 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="キー (例: 文書種類)"
                  />
                  <input
                    type="text"
                    value={attr.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAttrValue(index, e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="値"
                  />
                  <button onClick={() => removeAttr(index)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {customAttrs.length === 0 && (
                <div className="text-sm text-gray-500 italic">固有属性はありません</div>
              )}
            </div>
          </div>

        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-white/10 shrink-0 bg-black/20">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {isSaving ? "保存中..." : <><Save className="w-4 h-4" />反映</>}
          </button>
        </div>
      </div>
    </div>
  );
};
