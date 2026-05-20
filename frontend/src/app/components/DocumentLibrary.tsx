"use client";

import * as React from "react";
import { useRef, useState, useMemo } from "react";
import axios from "axios";
// @ts-ignore
import { FileText, Search, ChevronUp, ChevronDown, ChevronRight, X, RefreshCcw, Folder, Send, Loader2 } from "lucide-react";
// @ts-ignore
const RefreshCw = RefreshCcw;
import { Document, SortConfig, ColumnConfig } from "../types";

interface TreeConfig {
  target_column: string;
  grouping_type: "date" | "extension" | "exact_match" | "comma_separated" | "ai_extracted";
  extracted_tree?: Record<string, string[]>;
}

interface DocumentLibraryProps {
  docs: Document[];
  isLoading: boolean;
  isMounted: boolean;
  fetchError: string | null;
  onRefresh: () => void;
  selectedDoc: Document | null;
  onSelectDoc: (doc: Document) => void;
  tags: string[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  orgs: string[];
  selectedOrg: string;
  onSelectOrg: (org: string) => void;
  sortConfigs: SortConfig[];
  onSort: (key: SortConfig["key"], label: string) => void;
  columnOrder: ColumnConfig[];
  setColumnOrder: (order: ColumnConfig[]) => void;
  setIsHeaderDragging: (isDragging: boolean) => void;
}

export const DocumentLibrary = ({
  docs,
  isLoading,
  isMounted,
  fetchError,
  onRefresh,
  selectedDoc,
  onSelectDoc,
  tags,
  selectedTag,
  onSelectTag,
  orgs,
  selectedOrg,
  onSelectOrg,
  sortConfigs,
  onSort,
  columnOrder,
  setColumnOrder,
  setIsHeaderDragging
}: DocumentLibraryProps) => {
  const draggedColRef = useRef<number | null>(null);

  const [themeInput, setThemeInput] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);
  
  // 動的ツリーステート
  const [treeConfig, setTreeConfig] = useState<TreeConfig | null>(null);
  const [selectedTreeNode, setSelectedTreeNode] = useState<any>(null);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedAIGroups, setExpandedAIGroups] = useState<Record<string, boolean>>({});

  const toggleYear = (y: string) => setExpandedYears(prev => ({...prev, [y]: !prev[y]}));
  const toggleMonth = (ym: string) => setExpandedMonths(prev => ({...prev, [ym]: !prev[ym]}));
  const toggleAIGroup = (g: string) => setExpandedAIGroups(prev => ({...prev, [g]: !prev[g]}));

  const API_URL = (() => {
    const baseUrl = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) 
      ? process.env.NEXT_PUBLIC_API_URL 
      : (typeof window !== "undefined" 
          ? `${window.location.protocol}//${window.location.hostname}:${window.location.hostname === "localhost" ? "8000" : "10000"}`
          : "http://localhost:8000");
    return baseUrl.replace(/\/$/, "");
  })();

  const handleClassify = async () => {
    const input = themeInput.trim();
    if (!input) return;
    setIsClassifying(true);
    setTreeConfig(null);
    setSelectedTreeNode(null);

    const lowerInput = input.toLowerCase();
    const isDate = ["アップロード", "更新日", "アップロード日", "日付", "登録日", "作成日", "年月", "日時"].some(k => lowerInput.includes(k));
    const isExt = ["拡張子", "形式", "ファイル形式", "種類"].some(k => lowerInput.includes(k) && !lowerInput.includes("書類"));
    const isOrg = ["企業", "顧客", "会社", "取引先"].some(k => lowerInput.includes(k));

    if (isDate) {
      setTreeConfig({ target_column: "created_at", grouping_type: "date", extracted_tree: {} });
      setIsClassifying(false);
      return;
    }
    if (isExt) {
      setTreeConfig({ target_column: "file_name", grouping_type: "extension", extracted_tree: {} });
      setIsClassifying(false);
      return;
    }
    if (isOrg) {
      setTreeConfig({ target_column: "customer_name", grouping_type: "comma_separated", extracted_tree: {} });
      setIsClassifying(false);
      return;
    }

    try {
      const res = await axios.get(`${API_URL}/api/tree/classify`, { params: { theme: input } });
      setTreeConfig(res.data);
    } catch (e) {
      alert("AI分類に失敗しました。");
    } finally {
      setIsClassifying(false);
    }
  };

  // 一般的なツリーノードの抽出
  const treeNodes = useMemo(() => {
    if (!treeConfig || treeConfig.grouping_type === "date" || treeConfig.grouping_type === "ai_extracted") return [];
    
    const nodes = new Set<string>();
    docs.forEach(doc => {
      const val = (doc as any)[treeConfig.target_column] as string;
      if (!val) return;
      
      if (treeConfig.grouping_type === "comma_separated") {
        val.split(',').forEach(v => {
          if (v.trim()) nodes.add(v.trim());
        });
      } else if (treeConfig.grouping_type === "extension") {
        const ext = "." + (val.split('.').pop()?.toLowerCase() || "");
        if (ext !== ".") nodes.add(ext);
      } else if (treeConfig.grouping_type === "exact_match") {
        nodes.add(val.trim());
      }
    });
    return Array.from(nodes).sort();
  }, [treeConfig, docs]);

  // 日付ツリーノードの抽出（3階層：年 > 月 > 日）
  const dateTree = useMemo(() => {
    if (treeConfig?.grouping_type !== "date") return {};
    
    const tree: Record<string, Record<string, Set<string>>> = {};
    
    docs.forEach(doc => {
      const val = (doc as any)[treeConfig.target_column] as string;
      if (!val) return;
      const date = new Date(val);
      if (isNaN(date.getTime())) return;
      const y = date.getFullYear().toString() + "年";
      const m = (date.getMonth() + 1).toString() + "月";
      const d = date.getDate().toString() + "日";
      
      if (!tree[y]) tree[y] = {};
      if (!tree[y][m]) tree[y][m] = new Set<string>();
      tree[y][m].add(d);
    });
    
    const sortedTree: Record<string, Record<string, string[]>> = {};
    Object.keys(tree).sort().reverse().forEach(y => {
      sortedTree[y] = {};
      Object.keys(tree[y]).sort((a, b) => parseInt(b) - parseInt(a)).forEach(m => {
        sortedTree[y][m] = Array.from(tree[y][m]).sort((a, b) => parseInt(b) - parseInt(a));
      });
    });
    return sortedTree;
  }, [treeConfig, docs]);

  const formatFileSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null || bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleColumnDragStart = (index: number) => {
    setIsHeaderDragging(true);
    draggedColRef.current = index;
  };

  const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedColRef.current === null || draggedColRef.current === index) return;

    const targetElement = (e as any).currentTarget as HTMLDivElement;
    const rect = targetElement.getBoundingClientRect();
    const mouseX = (e as any).clientX;
    const threshold = rect.left + rect.width / 2;

    const isMovingForward = draggedColRef.current < index;
    const isMovingBackward = draggedColRef.current > index;

    if (isMovingForward && mouseX < threshold) return;
    if (isMovingBackward && mouseX > threshold) return;

    const newOrder = [...columnOrder];
    const draggedItem = newOrder[draggedColRef.current];
    newOrder.splice(draggedColRef.current, 1);
    newOrder.splice(index, 0, draggedItem);
    
    setColumnOrder(newOrder);
    draggedColRef.current = index;
  };

  const handleColumnDrop = () => {
    setIsHeaderDragging(false);
    draggedColRef.current = null;
  };

  const filteredDocs = docs.filter(doc => {
    // ツリーフィルター
    if (!treeConfig || !selectedTreeNode) return true;

    const val = (doc as any)[treeConfig.target_column] as string || "";

    if (treeConfig.grouping_type === "date") {
      const date = new Date(val);
      if (isNaN(date.getTime())) return false;
      const y = date.getFullYear().toString() + "年";
      const m = (date.getMonth() + 1).toString() + "月";
      const d = date.getDate().toString() + "日";
      
      if (selectedTreeNode.year && selectedTreeNode.year !== y) return false;
      if (selectedTreeNode.month && selectedTreeNode.month !== m) return false;
      if (selectedTreeNode.day && selectedTreeNode.day !== d) return false;
      return true;
    }

    if (treeConfig.grouping_type === "extension") {
      const ext = "." + (val.split('.').pop()?.toLowerCase() || "");
      return ext === selectedTreeNode;
    }

    if (treeConfig.grouping_type === "comma_separated" || treeConfig.grouping_type === "ai_extracted") {
      const list = val.split(',').map(v => v.trim());
      return list.includes(selectedTreeNode);
    }

    if (treeConfig.grouping_type === "exact_match") {
      return val === selectedTreeNode;
    }

    return true;
  });

  const sortedDocs = [...filteredDocs].sort((a, b) => {
    for (const config of sortConfigs) {
      let comparison = 0;
      const { key, order } = config;

      if (key === "file_name") {
        comparison = a.file_name.localeCompare(b.file_name, 'ja');
      } else if (key === "created_at") {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (key === "type") {
        const extA = a.file_name.split('.').pop() || "";
        const extB = b.file_name.split('.').pop() || "";
        comparison = extA.localeCompare(extB, 'ja');
      } else if (key === "tags") {
        if (!selectedTag) comparison = 0;
        else {
          const hasA = (a.tags || "").split(',').map(t => t.trim()).includes(selectedTag) ? 1 : 0;
          const hasB = (b.tags || "").split(',').map(t => t.trim()).includes(selectedTag) ? 1 : 0;
          comparison = hasB - hasA;
        }
      } else if (key === "customer_name") {
        if (!selectedOrg) comparison = 0;
        else {
          const hasA = (a.customer_name || "").split(',').map(t => t.trim()).includes(selectedOrg) ? 1 : 0;
          const hasB = (b.customer_name || "").split(',').map(t => t.trim()).includes(selectedOrg) ? 1 : 0;
          comparison = hasB - hasA;
        }
      } else if (key === "file_size") {
        comparison = (a.file_size || 0) - (b.file_size || 0);
      }

      if (comparison !== 0) {
        return order === "asc" ? comparison : -comparison;
      }
    }
    return 0;
  });

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="w-56 border-r border-white/5 flex flex-col min-h-0 bg-black/20 shrink-0">
        <div className="p-4 border-b border-white/5">
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">AI動的分類ツリー</div>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={themeInput}
              onChange={e => setThemeInput(e.target.value)}
              placeholder="例: 書類種類, アップロード日, 関連企業..."
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              onKeyDown={e => e.key === 'Enter' && handleClassify()}
            />
            <button 
              onClick={handleClassify}
              disabled={isClassifying || !themeInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded px-2 py-1 flex items-center justify-center transition-colors shrink-0"
            >
              {isClassifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </button>
          </div>
          {treeConfig && (
            <div className="mt-2 text-[10px] text-gray-500 font-mono flex items-center justify-between bg-black/30 p-1.5 rounded border border-white/5">
              <span>col: {treeConfig.target_column}</span>
              <span className="text-indigo-400">{treeConfig.grouping_type}</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          <div 
            onClick={() => setSelectedTreeNode(null)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${!selectedTreeNode ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span className="truncate">すべての資料</span>
          </div>
          
          {treeConfig?.grouping_type === "date" ? (
             Object.entries(dateTree).map(([year, months]) => (
                <div key={year} className="space-y-0.5">
                   <div 
                      onClick={() => { toggleYear(year); setSelectedTreeNode({ year }); }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${selectedTreeNode?.year === year && !selectedTreeNode?.month ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5'}`}
                   >
                     {expandedYears[year] ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                     <Folder className="w-3.5 h-3.5 shrink-0" />
                     <span className="truncate">{year}</span>
                   </div>
                   {expandedYears[year] && Object.entries(months).map(([month, days]) => {
                      const ymKey = `${year}-${month}`;
                      return (
                        <div key={ymKey} className="space-y-0.5">
                          <div 
                             onClick={() => { toggleMonth(ymKey); setSelectedTreeNode({ year, month }); }}
                             className={`flex items-center gap-1.5 pl-6 pr-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${selectedTreeNode?.year === year && selectedTreeNode?.month === month && !selectedTreeNode?.day ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5'}`}
                          >
                            {expandedMonths[ymKey] ? <ChevronDown className="w-3 h-3 shrink-0 opacity-70" /> : <ChevronRight className="w-3 h-3 shrink-0 opacity-70" />}
                            <Folder className="w-3.5 h-3.5 shrink-0 opacity-80" />
                            <span className="truncate opacity-80">{month}</span>
                          </div>
                          {expandedMonths[ymKey] && days.map(day => (
                            <div 
                               key={`${ymKey}-${day}`}
                               onClick={() => setSelectedTreeNode({ year, month, day })}
                               className={`flex items-center gap-2 pl-11 pr-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${selectedTreeNode?.year === year && selectedTreeNode?.month === month && selectedTreeNode?.day === day ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5'}`}
                            >
                              <Folder className="w-3.5 h-3.5 shrink-0 opacity-60" />
                              <span className="truncate opacity-60">{day}</span>
                            </div>
                          ))}
                        </div>
                      );
                   })}
                </div>
             ))
          ) : treeConfig?.grouping_type === "ai_extracted" && treeConfig.extracted_tree ? (
             Object.entries(treeConfig.extracted_tree).map(([parentGroup, tagsArray]) => (
                <div key={parentGroup} className="space-y-0.5">
                   <div 
                      onClick={() => toggleAIGroup(parentGroup)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors text-gray-400 hover:bg-white/5`}
                   >
                     {expandedAIGroups[parentGroup] ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                     <Folder className="w-3.5 h-3.5 shrink-0" />
                     <span className="truncate font-bold text-indigo-300">{parentGroup}</span>
                   </div>
                   {expandedAIGroups[parentGroup] && tagsArray.map(tag => (
                      <div 
                         key={`${parentGroup}-${tag}`}
                         onClick={() => setSelectedTreeNode(tag)}
                         className={`flex items-center gap-2 pl-7 pr-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${selectedTreeNode === tag ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5'}`}
                      >
                        <Folder className="w-3.5 h-3.5 shrink-0 opacity-80" />
                        <span className="truncate opacity-80">{tag}</span>
                      </div>
                   ))}
                </div>
             ))
          ) : (
             treeNodes.map(node => (
                <div 
                  key={node}
                  onClick={() => setSelectedTreeNode(node)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${selectedTreeNode === node ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5'}`}
                >
                  <Folder className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{node}</span>
                </div>
             ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
          <span>資料ライブラリ</span>
          <Search className="w-3 h-3" />
        </div>

        <div className="px-4 mb-4 flex gap-2">
          <select
            value={selectedTag}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectTag(e.target.value)}
            className="w-1/2 p-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#0a0a20]">すべての属性を表示</option>
            {tags.map((tag) => (
              <option key={tag} value={tag} className="bg-[#0a0a20]">#{tag}</option>
            ))}
          </select>
          <select
            value={selectedOrg}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectOrg(e.target.value)}
            className="w-1/2 p-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#0a0a20]">すべての企業を表示</option>
            {orgs.map((org) => (
              <option key={org} value={org} className="bg-[#0a0a20]">{org}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto px-2 space-y-1 custom-scrollbar">
          <div className="min-w-max pb-4">
            <div className="w-full flex items-center gap-3 px-4 py-2 border-b border-white/5 mb-1 select-none">
              <div className="shrink-0 w-5 flex items-center justify-center opacity-0 uppercase font-black text-[10px]">ICON</div>
              <div className="flex items-center gap-3 px-1 min-w-0">
                {columnOrder.map((item: ColumnConfig, idx: number) => {
                  const configIndex = sortConfigs.findIndex((c: SortConfig) => c.key === item.key);
                  const config = sortConfigs[configIndex];
                  const isFirst = configIndex === 0;

                  const widthMap: Record<string, string> = {
                    "w-80": "320px", "w-48": "192px", "w-36": "144px", "w-32": "128px",
                    "w-28": "112px", "w-24": "96px", "w-20": "80px", "w-16": "64px",
                    "w-14": "56px", "w-12": "48px"
                  };
                  const physicalWidth = widthMap[item.width.split(' ')[0]] || "auto";

                  return (
                    <div
                      key={item.key}
                      draggable
                      onDragStart={() => handleColumnDragStart(idx)}
                      onDragOver={(e: React.DragEvent<HTMLDivElement>) => handleColumnDragOver(e, idx)}
                      onDrop={handleColumnDrop}
                      onDragEnd={handleColumnDrop}
                      onClick={() => onSort(item.key as any, item.label)}
                      className={`min-w-0 flex-shrink-0 px-2 flex flex-col items-start cursor-pointer group box-border overflow-hidden ${item.width} transition-colors ${draggedColRef.current === idx ? 'opacity-30' : ''}`}
                      style={{ width: physicalWidth, minWidth: physicalWidth, flex: '0 0 auto' }}
                    >
                      <div className="flex items-center gap-1 w-full overflow-hidden">
                        <span className={`text-[10px] font-bold uppercase tracking-wider truncate shrink ${isFirst ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
                          {item.label}
                        </span>
                        {config && (
                          <div className="shrink-0">
                            {config.order === "asc" ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                          </div>
                        )}
                      </div>
                      {configIndex !== -1 && (
                        <div className="flex items-center mt-0.5">
                          <span className={`text-[8px] leading-none py-0.5 px-1 rounded-sm ${isFirst ? 'bg-indigo-600/50 text-white' : 'bg-gray-800 text-gray-500'}`}>
                            {configIndex + 1}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!isMounted || isLoading ? (
              <div className="px-2 space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 w-[600px]">
                    <div className="w-5 h-5 rounded bg-white/10"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-white/10 rounded w-3/4"></div>
                      <div className="h-2 bg-white/10 rounded w-1/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : fetchError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <X className="w-8 h-8 text-red-500 mb-4" />
                <div className="text-xs font-medium text-red-400">{fetchError}</div>
                <button onClick={onRefresh} className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs flex items-center gap-2 mx-auto">
                  <RefreshCw className="w-3 h-3" /> 再試行
                </button>
              </div>
            ) : sortedDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <FileText className="w-8 h-8 text-gray-600 mb-4" />
                <div className="text-xs font-medium text-gray-500">資料がありません</div>
              </div>
            ) : (
              sortedDocs.map((doc: Document) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDoc(doc)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:bg-white/5 group 
                    ${selectedDoc?.id === doc.id ? 'bg-white/10 border-l-2 border-indigo-500' : ''} 
                    cursor-pointer`}
                >
                  <div className="shrink-0 w-5 flex items-center justify-center">
                    {doc.status === 'completed' ? <FileText className="w-5 h-5 text-green-500" /> : <RefreshCw className="w-4 h-4 text-gray-500" />}
                  </div>

                  <div className="flex items-center gap-3 px-1 min-w-0">
                    {columnOrder.map((col: ColumnConfig) => {
                      const date = new Date(doc.created_at);
                      const ymd = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
                      const hms = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
                      const cellClass = `${col.width} min-w-0 flex-shrink-0 px-2`;

                      switch(col.key) {
                        case "file_name": return (
                          <div key={col.key} className={`${cellClass} flex items-center`}>
                            <div className="text-sm font-medium truncate text-white leading-tight">{doc.file_name}</div>
                          </div>
                        );
                        case "created_at": return (
                          <div key={col.key} className={`${cellClass} text-[10px] text-gray-500 text-left`}>{ymd} {hms}</div>
                        );
                        case "tags": {
                          const hasMatch = selectedTag && (doc.tags || "").split(',').map((t: string) => t.trim()).includes(selectedTag);
                          return (
                            <div key={col.key} className={`flex items-center justify-start px-2 ${col.width}`}>
                              <span className={`text-[12px] font-black ${hasMatch ? 'text-indigo-400' : 'text-transparent'}`}>○</span>
                            </div>
                          );
                        }
                        case "file_size": return (
                          <div key={col.key} className={`${cellClass} text-[10px] text-gray-400 text-left font-mono`}>{formatFileSize(doc.file_size)}</div>
                        );
                        case "customer_name": {
                          const hasMatchOrg = selectedOrg && (doc.customer_name || "").split(',').map((o: string) => o.trim()).includes(selectedOrg);
                          return (
                            <div key={col.key} className={`flex items-center justify-start px-2 ${col.width}`}>
                              <span className={`text-[12px] font-black ${hasMatchOrg ? 'text-indigo-400' : 'text-transparent'}`}>○</span>
                            </div>
                          );
                        }
                        case "type": return (
                          <div key={col.key} className={`${cellClass} text-[10px] text-gray-500 uppercase text-left`}>{doc.file_name.split('.').pop()}</div>
                        );
                        default: return null;
                      }
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
