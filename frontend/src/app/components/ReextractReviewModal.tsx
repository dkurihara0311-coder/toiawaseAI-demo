"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
// @ts-ignore
import { X, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Document } from "../types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ReextractReviewModalProps {
  doc: Document;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReextractReviewModal = ({ doc, isOpen, onClose, onSuccess }: ReextractReviewModalProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proposedData, setProposedData] = useState<any>(null);
  
  // State for selections
  // For custom attributes: true means use proposed (new), false means use original (old)
  const [attrSelections, setAttrSelections] = useState<Record<string, boolean>>({});
  
  // For tags: 
  // addedTags: tags in new but not old. true means add them.
  // removedTags: tags in old but not new. true means keep them.
  const [addedTagSelections, setAddedTagSelections] = useState<Record<string, boolean>>({});
  const [removedTagSelections, setRemovedTagSelections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      fetchProposedData();
    }
  }, [isOpen]);

  const fetchProposedData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/documents/${doc.id}/proposed-metadata`);
      const proposed = res.data;
      setProposedData(proposed);
      
      // Initialize selections
      const oldAttrs = doc.custom_attributes || {};
      const newAttrs = proposed.custom_attributes || {};
      const allKeys = Array.from(new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]));
      
      const initialAttrSelections: Record<string, boolean> = {};
      allKeys.forEach(key => {
        if (key === "文書種類" || key === "document_type") return;
        const oldStr = String(oldAttrs[key] || "").trim();
        const newStr = String(newAttrs[key] || "").trim();
        if (oldStr === newStr) return; // 変更なし（またはどちらも未抽出）は除外
        initialAttrSelections[key] = oldStr === "" && newStr !== ""; // 既存が空なら新規をデフォルトで選択
      });
      setAttrSelections(initialAttrSelections);

      const oldTags = (doc.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      const newTags = (proposed.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      
      const added = newTags.filter((t: string) => !oldTags.includes(t));
      const removed = oldTags.filter((t: string) => !newTags.includes(t));
      
      const initialAdded: Record<string, boolean> = {};
      added.forEach((t: string) => initialAdded[t] = true); 
      setAddedTagSelections(initialAdded);
      
      const initialRemoved: Record<string, boolean> = {};
      removed.forEach((t: string) => initialRemoved[t] = true); 
      setRemovedTagSelections(initialRemoved);
      
    } catch (e: any) {
      setError(e.response?.data?.detail || "提案データの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const oldAttrs = doc.custom_attributes || {};
      const newAttrs = proposedData.custom_attributes || {};
      const allKeys = Array.from(new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]));
      
      const finalAttrs: Record<string, any> = {};
      allKeys.forEach(key => {
        if (key === "文書種類" || key === "document_type") return;
        const oldStr = String(oldAttrs[key] || "").trim();
        const newStr = String(newAttrs[key] || "").trim();
        if (oldStr === newStr) {
          finalAttrs[key] = oldAttrs[key];
          return;
        }
        const useNew = attrSelections[key];
        const val = useNew ? newAttrs[key] : oldAttrs[key];
        if (val !== undefined && val !== null && val !== "") {
          finalAttrs[key] = val;
        }
      });
      
      if (proposedData.document_type) finalAttrs["文書種類"] = proposedData.document_type;
      
      const oldTags = (doc.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      const newTags = (proposedData.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
      
      const commonTags = oldTags.filter((t: string) => newTags.includes(t));
      const addedTags = newTags.filter((t: string) => !oldTags.includes(t));
      const removedTags = oldTags.filter((t: string) => !newTags.includes(t));
      
      const finalTagsSet = new Set(commonTags);
      addedTags.forEach((t: string) => {
        if (addedTagSelections[t]) finalTagsSet.add(t);
      });
      removedTags.forEach((t: string) => {
        if (removedTagSelections[t]) finalTagsSet.add(t);
      });
      
      const finalTags = Array.from(finalTagsSet).join(",");

      await axios.post(`${API_URL}/api/documents/${doc.id}/commit-reextract`, {
        tags: finalTags,
        custom_attributes: finalAttrs
      });
      
      onSuccess();
      onClose();
    } catch (e: any) {
      alert("保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[#0f1019] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">再抽出結果の確認</h2>
              <p className="text-xs text-gray-400 mt-0.5">AIが抽出した新しいデータと既存データを比較し、反映する内容を選択してください。</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-4">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              <div className="text-sm text-gray-400">データを読み込み中...</div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          ) : proposedData && (
            <div className="space-y-8">
              
              {/* Custom Attributes Section */}
              <section>
                <h3 className="text-sm font-bold text-indigo-300 mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                  固有属性の比較
                  <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-400 font-normal">
                    変更があった項目のみ表示しています
                  </span>
                </h3>
                
                <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-3 w-1/4 font-medium border-b border-white/10">属性名</th>
                        <th className="p-3 w-3/8 font-medium border-b border-white/10">再抽出前 (既存)</th>
                        <th className="p-3 w-3/8 font-medium border-b border-white/10 text-emerald-400">AI提案 (新規)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {Object.keys(attrSelections).length === 0 ? (
                        <tr><td colSpan={3} className="p-4 text-center text-gray-500 text-xs italic">差分のある固有属性はありません</td></tr>
                      ) : Object.keys(attrSelections).map(key => {
                        const oldVal = doc.custom_attributes?.[key];
                        const newVal = proposedData.custom_attributes?.[key];
                        const useNew = attrSelections[key];
                        
                        return (
                          <tr key={key} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-3 font-medium text-gray-300 text-xs">{key}</td>
                            
                            <td 
                              className={`p-3 cursor-pointer transition-colors ${!useNew ? 'bg-indigo-500/10' : ''}`}
                              onClick={() => setAttrSelections(prev => ({...prev, [key]: false}))}
                            >
                              <div className="flex items-start gap-3">
                                <input 
                                  type="radio" 
                                  checked={!useNew} 
                                  onChange={() => setAttrSelections(prev => ({...prev, [key]: false}))}
                                  className="mt-0.5"
                                />
                                <span className={`text-xs ${!oldVal ? 'text-gray-500 italic' : !useNew ? 'text-indigo-200 font-bold' : 'text-gray-400'}`}>
                                  {oldVal || '(なし)'}
                                </span>
                              </div>
                            </td>
                            
                            <td 
                              className={`p-3 cursor-pointer transition-colors ${useNew ? 'bg-emerald-500/10' : ''}`}
                              onClick={() => setAttrSelections(prev => ({...prev, [key]: true}))}
                            >
                              <div className="flex items-start gap-3">
                                <input 
                                  type="radio" 
                                  checked={useNew} 
                                  onChange={() => setAttrSelections(prev => ({...prev, [key]: true}))}
                                  className="mt-0.5"
                                />
                                <span className={`text-xs ${!newVal ? 'text-gray-500 italic' : useNew ? 'text-emerald-200 font-bold' : 'text-gray-400'}`}>
                                  {newVal || '(なし)'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Tags Section */}
              <section>
                <h3 className="text-sm font-bold text-indigo-300 mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                  属性タグの差分
                  <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-400 font-normal">
                    変更がないタグは自動的に保持されます
                  </span>
                </h3>
                
                <div className="grid grid-cols-2 gap-6">
                  
                  {/* Removed Tags (既存) -> 左側 */}
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                    <div className="text-xs font-bold text-red-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      AIが今回抽出しなかった既存タグ
                    </div>
                    {Object.keys(removedTagSelections).length === 0 ? (
                      <div className="text-xs text-gray-500 italic pl-4">抽出から漏れた既存タグはありません</div>
                    ) : (
                      <div className="space-y-2">
                        {Object.keys(removedTagSelections).map(tag => (
                          <label key={tag} className="flex items-center gap-2 cursor-pointer hover:bg-red-500/10 p-1.5 rounded transition-colors">
                            <input 
                              type="checkbox" 
                              checked={removedTagSelections[tag]}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemovedTagSelections(prev => ({...prev, [tag]: e.target.checked}))}
                            />
                            <span className={`text-xs flex items-center gap-1.5 ${removedTagSelections[tag] ? 'text-gray-200 font-bold' : 'text-gray-400'}`}>
                              <span className={removedTagSelections[tag] ? "" : "line-through"}>
                                #{tag}
                              </span>
                              <span>
                                {removedTagSelections[tag] ? '(残す)' : '(削除する)'}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Added Tags (新規) -> 右側 */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                    <div className="text-xs font-bold text-emerald-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      AIが新しく提案したタグ
                    </div>
                    {Object.keys(addedTagSelections).length === 0 ? (
                      <div className="text-xs text-gray-500 italic pl-4">新しいタグの提案はありません</div>
                    ) : (
                      <div className="space-y-2">
                        {Object.keys(addedTagSelections).map(tag => (
                          <label key={tag} className="flex items-center gap-2 cursor-pointer hover:bg-emerald-500/10 p-1.5 rounded transition-colors">
                            <input 
                              type="checkbox" 
                              checked={addedTagSelections[tag]}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddedTagSelections(prev => ({...prev, [tag]: e.target.checked}))}
                            />
                            <span className={`text-xs flex items-center gap-1.5 ${addedTagSelections[tag] ? 'text-emerald-200 font-bold' : 'text-gray-400'}`}>
                              <span className={addedTagSelections[tag] ? "" : "line-through"}>
                                #{tag}
                              </span>
                              <span>
                                {addedTagSelections[tag] ? '(追加する)' : '(追加しない)'}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </section>
              
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-black/40 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
          >
            キャンセル
          </button>
          <button 
            onClick={handleSave}
            disabled={isLoading || !!error || isSaving}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            選択内容で確定する
          </button>
        </div>
        
      </div>
    </div>
  );
};
