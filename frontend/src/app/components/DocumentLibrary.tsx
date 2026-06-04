"use client";

import * as React from "react";
import { useRef, useState, useMemo } from "react";
import axios from "axios";
// @ts-ignore
import { FileText, Search, ChevronUp, ChevronDown, ChevronRight, X, RefreshCcw, Folder, Send, Loader2, FileBox } from "lucide-react";
// @ts-ignore
const RefreshCw = RefreshCcw;
import { Document, SortConfig, ColumnConfig } from "../types";

interface TreeConfig {
  target_column: string;
  grouping_type: "date" | "extension" | "exact_match" | "comma_separated" | "ai_extracted" | "custom_attributes";
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
  userId?: string;
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
  setIsHeaderDragging,
  userId
}: DocumentLibraryProps) => {
  const draggedColRef = useRef<number | null>(null);

  const [presetType, setPresetType] = useState<string>("none");
  const [themeInput, setThemeInput] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);
  
  // 動的ツリーステート
  const [treeConfig, setTreeConfig] = useState<TreeConfig | null>(null);
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedAIGroups, setExpandedAIGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [hasInputValue, setHasInputValue] = useState(false);
  const isComposing = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const toggleAIGroup = (g: string) => setExpandedAIGroups(prev => ({...prev, [g]: !prev[g]}));

  const [isRestored, setIsRestored] = useState(false);

  // 初回マウント時（isMounted が true になった時）に localStorage から復元
  React.useEffect(() => {
    if (!isMounted) return;
    
    const storageKey = userId ? `tank_tree_state_${userId}` : "tank_tree_state_default";
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.presetType !== undefined) setPresetType(parsed.presetType);
        if (parsed.themeInput !== undefined) setThemeInput(parsed.themeInput);
        if (parsed.treeConfig !== undefined) setTreeConfig(parsed.treeConfig);
        if (parsed.selectedTreeNodeId !== undefined) setSelectedTreeNodeId(parsed.selectedTreeNodeId);
        if (parsed.expandedAIGroups !== undefined) setExpandedAIGroups(parsed.expandedAIGroups);
        if (parsed.showArchived !== undefined) setShowArchived(parsed.showArchived);
      } catch (e) {
        console.error("Failed to parse saved tree state:", e);
      }
    }
    setIsRestored(true);
  }, [isMounted, userId]);

  // 状態変更時に localStorage へ自動保存
  React.useEffect(() => {
    if (!isMounted || !isRestored) return;
    
    const storageKey = userId ? `tank_tree_state_${userId}` : "tank_tree_state_default";
    const stateToSave = {
      presetType,
      themeInput,
      treeConfig,
      selectedTreeNodeId,
      expandedAIGroups,
      showArchived
    };
    localStorage.setItem(storageKey, JSON.stringify(stateToSave));
  }, [presetType, themeInput, treeConfig, selectedTreeNodeId, expandedAIGroups, showArchived, isMounted, isRestored, userId]);

  const API_URL = (() => {
    const baseUrl = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) 
      ? process.env.NEXT_PUBLIC_API_URL 
      : (typeof window !== "undefined" 
          ? `${window.location.protocol}//${window.location.hostname}:${window.location.hostname === "localhost" ? "8000" : "10000"}`
          : "http://localhost:8000");
    return baseUrl.replace(/\/$/, "");
  })();

  const handlePresetChange = (val: string) => {
    setPresetType(val);
    setThemeInput("");
    setTreeConfig(null);
    setSelectedTreeNodeId(null);

    if (val === "date") {
      setTreeConfig({ target_column: "created_at", grouping_type: "date", extracted_tree: {} });
    } else if (val === "type") {
      setTreeConfig({ target_column: "custom_attributes", grouping_type: "custom_attributes", extracted_tree: {} });
    } else if (val === "ext") {
      setTreeConfig({ target_column: "file_name", grouping_type: "extension", extracted_tree: {} });
    } else if (val === "org") {
      setTreeConfig({ target_column: "customer_name", grouping_type: "comma_separated", extracted_tree: {} });
    }
  };

  const handleClassify = async () => {
    if (presetType !== "custom") return;
    
    const input = themeInput.trim();
    if (!input) return;
    setIsClassifying(true);
    setTreeConfig(null);
    setSelectedTreeNodeId(null);

    try {
      const res = await axios.get(`${API_URL}/api/tree/classify`, { params: { theme: input } });
      setTreeConfig(res.data);
    } catch (e) {
      alert("AI分類に失敗しました。");
    } finally {
      setIsClassifying(false);
    }
  };

  // 表示用ドキュメントの算出（showArchivedがOFFならアーカイブされたものは除外）
  const displayedDocs = useMemo(() => {
    return docs.filter(doc => {
      if (!showArchived && doc.is_archived) return false;
      return true;
    });
  }, [docs, showArchived]);

  interface TreeNode {
    id: string;
    label: string;
    payload: any;
    children?: TreeNode[];
  }

  // 一般的なツリーノードの抽出
  const buildGeneralTree = (docsList: Document[]): TreeNode[] => {
    if (!treeConfig || treeConfig.grouping_type === "date" || treeConfig.grouping_type === "ai_extracted") return [];
    
    const nodes = new Set<string>();
    docsList.forEach(doc => {
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
    return Array.from(nodes).sort().map(node => ({
      id: node,
      label: node,
      payload: { value: node }
    }));
  };

  // 日付ツリーノードの抽出（3階層：年 > 月 > 日）
  const buildDateTree = (docsList: Document[]): TreeNode[] => {
    if (treeConfig?.grouping_type !== "date") return [];
    
    const tree: Record<string, Record<string, Set<string>>> = {};
    
    docsList.forEach(doc => {
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
    
    const result: TreeNode[] = [];
    Object.keys(tree).sort().reverse().forEach(y => {
      const yearNode: TreeNode = {
        id: y,
        label: y,
        payload: { year: y },
        children: []
      };
      Object.keys(tree[y]).sort((a, b) => parseInt(b) - parseInt(a)).forEach(m => {
        const monthNode: TreeNode = {
          id: `${y}-${m}`,
          label: m,
          payload: { year: y, month: m },
          children: []
        };
        Array.from(tree[y][m]).sort((a, b) => parseInt(b) - parseInt(a)).forEach(d => {
          monthNode.children?.push({
            id: `${y}-${m}-${d}`,
            label: d,
            payload: { year: y, month: m, day: d }
          });
        });
        yearNode.children?.push(monthNode);
      });
      result.push(yearNode);
    });
    return result;
  };

  const strToNum = (s: string) => s.replace(/[^0-9.-]/g, '');

  const normalizeText = (text: string): string => {
    if (!text) return "";
    let normalized = text.normalize("NFKC");
    normalized = normalized.toLowerCase();
    normalized = normalized.replace(/[\u3041-\u3096]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) + 0x60);
    });
    return normalized;
  };

  const isDocMatchedSearch = (doc: Document): boolean => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.trim();
    const keywords = q.split(/[\s　]+/).filter(Boolean).map(k => normalizeText(k));
    if (keywords.length === 0) return false;
    
    return keywords.every(k => {
      const matchFileName = normalizeText(doc.file_name).includes(k);
      const matchCustomer = normalizeText(doc.customer_name || "").includes(k);
      const matchTags = normalizeText(doc.tags || "").includes(k);
      const matchCustomAttrs = doc.custom_attributes
        ? Object.values(doc.custom_attributes).some(v => normalizeText(String(v)).includes(k))
        : false;
      return matchFileName || matchCustomer || matchTags || matchCustomAttrs;
    });
  };

  const buildCustomAttrsTree = (docsList: Document[]): TreeNode[] => {
    if (treeConfig?.grouping_type !== "custom_attributes") return [];
    
    const amountValues: Record<string, number[]> = {};
    
    docsList.forEach(doc => {
      const attrs = doc.custom_attributes || {};
      Object.entries(attrs).forEach(([k, v]) => {
        if (!v || k === "文書種類" || k === "document_type") return;
        const isAmountKey = /(金額|税|単価|価格|小計|合計|総額|料金|費用|代金|残高|額)/.test(k);
        if (isAmountKey) {
          const numStr = String(v).replace(/[,¥円\s]/g, '');
          const num = parseFloat(numStr);
          if (!isNaN(num)) {
            if (!amountValues[k]) amountValues[k] = [];
            amountValues[k].push(num);
          }
        }
      });
    });
    
    const amountBinsConfig: Record<string, { step: number, min: number, max: number }> = {};
    Object.entries(amountValues).forEach(([k, vals]) => {
      if (vals.length < 2) return;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const range = max - min;
      if (range > 0) {
        const roughStep = range / 4;
        const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
        const step = Math.max(10000, Math.ceil(roughStep / magnitude) * magnitude);
        amountBinsConfig[k] = { step, min, max };
      }
    });

    const formatAmount = (num: number) => {
      if (num >= 10000) return `${num / 10000}万円`;
      return `${num}円`;
    };

    const getAmountBinLabel = (num: number, config: any) => {
      if (!config) return String(num);
      const binStart = Math.floor(num / config.step) * config.step;
      const binEnd = binStart + config.step;
      return `${formatAmount(binStart)}〜${formatAmount(binEnd)}`;
    };

    const tree: any = {};
    
    docsList.forEach(doc => {
      const attrs = doc.custom_attributes || {};
      const docType = attrs["文書種類"] || doc.document_type || "未分類";
      
      if (!tree[docType]) tree[docType] = {};
      
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "文書種類" || k === "document_type" || !v) return;
        
        if (!tree[docType][k]) {
          tree[docType][k] = { type: "value", values: new Set(), dateTree: {}, amountBins: {} };
        }
        
        const valStr = String(v).trim();
        let isDate = false;
        
        if (k.includes("期限") || k.includes("日") || valStr.match(/^\d{4}[-/年]\d{1,2}([-/月]\d{1,2}日?)?$/)) {
          const dateMatch = valStr.match(/^(\d{4})[-/年]?(\d{1,2})?[-/月]?(\d{1,2})?[日]?$/);
          if (dateMatch) {
            isDate = true;
            const y = dateMatch[1] + "年";
            const m = dateMatch[2] ? dateMatch[2].padStart(2, '0') + "月" : "";
            const d = dateMatch[3] ? dateMatch[3].padStart(2, '0') + "日" : "";
            
            tree[docType][k].type = "date";
            if (!tree[docType][k].dateTree[y]) tree[docType][k].dateTree[y] = {};
            if (m) {
              if (!tree[docType][k].dateTree[y][m]) tree[docType][k].dateTree[y][m] = new Set();
              if (d) tree[docType][k].dateTree[y][m].add(d);
            }
          }
        }
        
        const isAmountKey = /(金額|税|単価|価格|小計|合計|総額|料金|費用|代金|残高|額)/.test(k);
        if (!isDate && isAmountKey) {
          const numStr = valStr.replace(/[,¥円\s]/g, '');
          const num = parseFloat(numStr);
          if (!isNaN(num)) {
            tree[docType][k].type = "amount";
            const binLabel = getAmountBinLabel(num, amountBinsConfig[k]);
            if (!tree[docType][k].amountBins[binLabel]) tree[docType][k].amountBins[binLabel] = new Set();
            tree[docType][k].amountBins[binLabel].add(valStr);
          } else {
            tree[docType][k].values.add(valStr);
          }
        } else if (!isDate) {
          tree[docType][k].values.add(valStr);
        }
      });
    });
    
    const genericTree: TreeNode[] = [];
    Object.keys(tree).sort().forEach(docType => {
      const docTypeNode: TreeNode = {
         id: docType,
         label: docType,
         payload: { docType },
         children: []
      };
      
      Object.keys(tree[docType]).sort().forEach(attrKey => {
         const node = tree[docType][attrKey];
         const attrNode: TreeNode = {
            id: `${docType}-${attrKey}`,
            label: attrKey,
            payload: { docType, attrKey },
            children: []
         };
         
         if (node.type === "value") {
            Array.from(node.values as Set<string>).sort().forEach((val: string) => {
               attrNode.children?.push({
                  id: `${docType}-${attrKey}-${val}`,
                  label: val,
                  payload: { docType, attrKey, attrValue: val }
               });
            });
         } else if (node.type === "amount") {
            Object.keys(node.amountBins).sort((a, b) => {
              const numA = parseFloat(a.replace(/[^0-9.]/g, '')) || 0;
              const numB = parseFloat(b.replace(/[^0-9.]/g, '')) || 0;
              return numA - numB;
            }).forEach((bin: string) => {
               const binNode: TreeNode = {
                  id: `${docType}-${attrKey}-${bin}`,
                  label: bin,
                  payload: { docType, attrKey, binLabel: bin, binValues: Array.from(node.amountBins[bin]) },
                  children: []
               };
               Array.from(node.amountBins[bin] as Set<string>).sort((a, b) => {
                  const vA = parseFloat(strToNum(a as string)) || 0;
                  const vB = parseFloat(strToNum(b as string)) || 0;
                  return vA - vB;
               }).forEach((val: string) => {
                  binNode.children?.push({
                     id: `${docType}-${attrKey}-${bin}-${val}`,
                     label: val,
                     payload: { docType, attrKey, binLabel: bin, attrValue: val, binValues: Array.from(node.amountBins[bin]) }
                  });
               });
               attrNode.children?.push(binNode);
            });
         } else if (node.type === "date") {
            Object.keys(node.dateTree).sort().reverse().forEach((year: string) => {
               const yearNode: TreeNode = {
                  id: `${docType}-${attrKey}-${year}`,
                  label: year,
                  payload: { docType, attrKey, year },
                  children: []
               };
               Object.keys(node.dateTree[year]).sort((a, b) => parseInt(b) - parseInt(a)).forEach((month: string) => {
                  const monthNode: TreeNode = {
                     id: `${docType}-${attrKey}-${year}-${month}`,
                     label: month,
                     payload: { docType, attrKey, year, month },
                     children: []
                  };
                  Array.from(node.dateTree[year][month] as Set<string>).sort((a, b) => parseInt(b) - parseInt(a)).forEach((day: string) => {
                     monthNode.children?.push({
                        id: `${docType}-${attrKey}-${year}-${month}-${day}`,
                        label: day,
                        payload: { docType, attrKey, year, month, day }
                     });
                  });
                  yearNode.children?.push(monthNode);
               });
               attrNode.children?.push(yearNode);
            });
         }
         
         const hasMissing = docsList.some(doc => {
            const attrs = doc.custom_attributes || {};
            const dt = attrs["文書種類"] || doc.document_type || "未分類";
            if (dt !== docType) return false;
            return !String(attrs[attrKey] || "").trim();
         });
         
         if (hasMissing) {
            attrNode.children?.push({
               id: `${docType}-${attrKey}-none`,
               label: '（指定なし）',
               payload: { docType, attrKey, isNone: true }
            });
         }
         
         docTypeNode.children?.push(attrNode);
      });
      genericTree.push(docTypeNode);
    });
    return genericTree;
  };

  const buildAIExtractedTree = (docsList: Document[]): TreeNode[] => {
    if (treeConfig?.grouping_type !== "ai_extracted" || !treeConfig.extracted_tree) return [];
    
    const buildRecursiveAITree = (
      docsSubList: Document[],
      treeNodeDef: any,
      currentFilters: Record<string, string>
    ): TreeNode[] => {
      if (!treeNodeDef || typeof treeNodeDef !== "object" || Array.isArray(treeNodeDef)) {
        return [];
      }
      
      const nodes: TreeNode[] = [];
      
      Object.keys(treeNodeDef).forEach(attrKey => {
         const attrNodeId = `ai-${attrKey}-${Object.keys(currentFilters).map(k => `${k}_${currentFilters[k]}`).join('-')}`;
         const valsSet: Set<string> = new Set();
         let hasMissing = false;
         
         const docsFilteredByAncestors = docsSubList.filter(doc => {
            const attrs = doc.custom_attributes || {};
            return Object.entries(currentFilters).every(([fk, fv]) => {
               return String(attrs[fk] || "").trim() === String(fv).trim();
            });
         });
         
         docsFilteredByAncestors.forEach(doc => {
            let valStr = "";
            if (treeConfig.target_column === "custom_attributes") {
                const attrs = doc.custom_attributes || {};
                valStr = String(attrs[attrKey] || "").trim();
            } else {
                const list = (String((doc as any)[treeConfig.target_column] || "")).split(',').map(v => v.trim());
                if (list.includes(attrKey)) {
                    valStr = attrKey;
                }
            }
            
            if (valStr) {
                valsSet.add(valStr);
            } else if (treeConfig.target_column === "custom_attributes") {
                hasMissing = true;
            }
         });
         
         const vals = Array.from(valsSet);
         
         const attrNode: TreeNode = {
            id: attrNodeId,
            label: attrKey,
            payload: { 
               parentGroup: attrKey, 
               isAttrNode: true,
               accumulatedFilters: { ...currentFilters },
               documentIds: docsFilteredByAncestors.map(d => d.id)
            },
            children: []
         };
         
         const subDef = treeNodeDef[attrKey];
         const hasSubDef = subDef && typeof subDef === "object" && !Array.isArray(subDef) && Object.keys(subDef).length > 0;
         
         if (hasSubDef) {
            // subDefのキーがすべて属性キー名である場合、値の階層が省略されたとみなす
            const knownAttrKeys = ["金額", "期限", "日付", "文書種類", "顧客名", "取引先", "作成日", "ファイル名", "顧客", "拡張子", "容量", "サイズ", "会社", "会社名", "取引先名"];
            const isMissingValueLayer = Object.keys(subDef).every(k => {
               const kl = k.toLowerCase();
               return knownAttrKeys.includes(k) || 
                      kl.includes("date") || 
                      kl.includes("amount") || 
                      kl.includes("type") || 
                      kl.includes("ext") || 
                      kl.includes("size") || 
                      kl.includes("customer") ||
                      kl.includes("limit");
            });

            if (isMissingValueLayer) {
               // 値の階層が省略されている場合、直接子属性を展開する
               const childNodes = buildRecursiveAITree(docsFilteredByAncestors, subDef, currentFilters);
               attrNode.children = childNodes;
            } else {
               const specificKeys = Object.keys(subDef).filter(k => k !== "*");
               const hasSpecificKeys = specificKeys.length > 0;
               
               if (hasSpecificKeys) {
                  // 1. 具体的なキー（例: "見積書"）にマッチするフォルダの作成
                  specificKeys.forEach(specKey => {
                     const matchedDocs = docsFilteredByAncestors.filter(doc => {
                        let valStr = "";
                        if (treeConfig.target_column === "custom_attributes") {
                            const attrs = doc.custom_attributes || {};
                            valStr = String(attrs[attrKey] || "").trim();
                        } else {
                            const list = (String((doc as any)[treeConfig.target_column] || "")).split(',').map(v => v.trim());
                            if (list.includes(attrKey)) {
                                valStr = attrKey;
                            }
                        }
                        return valStr === specKey || valStr.includes(specKey) || specKey.includes(valStr);
                     });
                     
                     const valNodeId = `${attrNodeId}-${specKey}`;
                     const nextFilters = { ...currentFilters, [attrKey]: specKey };
                     const valSubDef = subDef[specKey];
                     
                     const childNodes = valSubDef !== undefined 
                        ? buildRecursiveAITree(matchedDocs, valSubDef, nextFilters)
                        : [];
                        
                     attrNode.children?.push({
                        id: valNodeId,
                        label: specKey,
                        payload: {
                           parentGroup: attrKey,
                           tag: specKey,
                           accumulatedFilters: nextFilters,
                           documentIds: matchedDocs.map(d => d.id)
                        },
                        children: childNodes
                     });
                  });
                  
                  // 2. マッチしなかったドキュメントを「○○以外」フォルダにまとめる
                  const otherDocs = docsFilteredByAncestors.filter(doc => {
                     let valStr = "";
                     if (treeConfig.target_column === "custom_attributes") {
                         const attrs = doc.custom_attributes || {};
                         valStr = String(attrs[attrKey] || "").trim();
                     } else {
                         const list = (String((doc as any)[treeConfig.target_column] || "")).split(',').map(v => v.trim());
                         if (list.includes(attrKey)) {
                             valStr = attrKey;
                         }
                     }
                     return !specificKeys.some(specKey => 
                        valStr === specKey || valStr.includes(specKey) || specKey.includes(valStr)
                     );
                  });
                  
                  if (otherDocs.length > 0) {
                     const otherLabel = `${specificKeys[0]}以外`;
                     const valNodeId = `${attrNodeId}-others`;
                     
                     attrNode.children?.push({
                        id: valNodeId,
                        label: otherLabel,
                        payload: {
                           parentGroup: attrKey,
                           isOthersNode: true,
                           otherGroupKeys: specificKeys,
                           accumulatedFilters: { ...currentFilters },
                           documentIds: otherDocs.map(d => d.id)
                        },
                        children: []
                     });
                  }
               } else {
                  // 具体的な定義がない場合は、すべての属性値を個別に展開する
                  vals.forEach(val => {
                     const matchedDocs = docsFilteredByAncestors.filter(doc => {
                        let valStr = "";
                        if (treeConfig.target_column === "custom_attributes") {
                            const attrs = doc.custom_attributes || {};
                            valStr = String(attrs[attrKey] || "").trim();
                        } else {
                            const list = (String((doc as any)[treeConfig.target_column] || "")).split(',').map(v => v.trim());
                            if (list.includes(attrKey)) {
                                valStr = attrKey;
                            }
                        }
                        return valStr === val;
                     });

                     const valNodeId = `${attrNodeId}-${val}`;
                     const nextFilters = { ...currentFilters, [attrKey]: val };
                     const valSubDef = subDef["*"];
                     
                     const childNodes = valSubDef !== undefined 
                        ? buildRecursiveAITree(matchedDocs, valSubDef, nextFilters)
                        : [];
                     
                     const valNode: TreeNode = {
                        id: valNodeId,
                        label: val,
                        payload: {
                           parentGroup: attrKey,
                           tag: val,
                           accumulatedFilters: nextFilters,
                           documentIds: matchedDocs.map(d => d.id)
                        },
                        children: childNodes
                     };
                     attrNode.children?.push(valNode);
                  });
               }
            }
         } else {
            const isAmountKey = /(金額|税|単価|価格|小計|合計|総額|料金|費用|代金|残高|額)/.test(attrKey);
            let isDateKey = false;
            
            if (attrKey.includes("期限") || attrKey.includes("日")) {
               isDateKey = true;
            } else {
               isDateKey = vals.some(v => /^\d{4}[-/年]\d{1,2}([-/月]\d{1,2}日?)?$/.test(v));
            }
            
            if (isDateKey) {
               const dateTree: Record<string, Record<string, Set<string>>> = {};
               vals.forEach(v => {
                  const dateMatch = v.match(/^(\d{4})[-/年]?(\d{1,2})?[-/月]?(\d{1,2})?[日]?$/);
                  if (dateMatch) {
                     const y = dateMatch[1] + "年";
                     const m = dateMatch[2] ? dateMatch[2].padStart(2, '0') + "月" : "";
                     const d = dateMatch[3] ? dateMatch[3].padStart(2, '0') + "日" : "";
                     
                     if (!dateTree[y]) dateTree[y] = {};
                     if (m) {
                        if (!dateTree[y][m]) dateTree[y][m] = new Set();
                        if (d) dateTree[y][m].add(d);
                     }
                  } else {
                     attrNode.children?.push({
                        id: `${attrNodeId}-${v}`,
                        label: v,
                        payload: { 
                           parentGroup: attrKey, 
                           tag: v,
                           accumulatedFilters: { ...currentFilters, [attrKey]: v },
                           documentIds: docsFilteredByAncestors.filter(doc => String((doc.custom_attributes || {})[attrKey] || "").trim() === v).map(d => d.id)
                        }
                     });
                  }
               });
               
               Object.keys(dateTree).sort().reverse().forEach(year => {
                  const yearDocs = docsFilteredByAncestors.filter(doc => {
                     const v = String((doc.custom_attributes || {})[attrKey] || "").trim();
                     const m = v.match(/^(\d{4})/);
                     return m && (m[1] + "年") === year;
                  });
                  
                  const yearNode: TreeNode = {
                     id: `${attrNodeId}-${year}`,
                     label: year,
                     payload: { 
                        parentGroup: attrKey, 
                        year,
                        accumulatedFilters: { ...currentFilters, [attrKey]: year },
                        documentIds: yearDocs.map(d => d.id)
                     },
                     children: []
                  };
                  Object.keys(dateTree[year]).sort((a, b) => parseInt(b) - parseInt(a)).forEach(month => {
                     const monthDocs = yearDocs.filter(doc => {
                        const v = String((doc.custom_attributes || {})[attrKey] || "").trim();
                        const m = v.match(/^\d{4}[-/年]?(\d{1,2})/);
                        return m && (m[1].padStart(2, '0') + "月") === month;
                     });
                     
                     const monthNode: TreeNode = {
                        id: `${attrNodeId}-${year}-${month}`,
                        label: month,
                        payload: { 
                           parentGroup: attrKey, 
                           year, 
                           month,
                           accumulatedFilters: { ...currentFilters },
                           documentIds: monthDocs.map(d => d.id)
                        },
                        children: []
                     };
                     Array.from(dateTree[year][month]).sort((a, b) => parseInt(b) - parseInt(a)).forEach(day => {
                        const dayDocs = monthDocs.filter(doc => {
                           const v = String((doc.custom_attributes || {})[attrKey] || "").trim();
                           const m = v.match(/^\d{4}[-/年]?\d{1,2}[-/月]?(\d{1,2})/);
                           return m && (m[1].padStart(2, '0') + "日") === day;
                        });
                        
                        monthNode.children?.push({
                           id: `${attrNodeId}-${year}-${month}-${day}`,
                           label: day,
                           payload: { 
                              parentGroup: attrKey, 
                              year, 
                              month, 
                              day,
                              accumulatedFilters: { ...currentFilters },
                               documentIds: dayDocs.map(d => d.id)
                           }
                        });
                     });
                     yearNode.children?.push(monthNode);
                  });
                  attrNode.children?.push(yearNode);
               });
            } else if (isAmountKey) {
              const nums: number[] = [];
              vals.forEach(v => {
                 const numStr = String(v).replace(/[,¥円\s]/g, '');
                 const num = parseFloat(numStr);
                 if (!isNaN(num)) nums.push(num);
              });
              
              let config: any = null;
              if (nums.length >= 2) {
                const min = Math.min(...nums);
                const max = Math.max(...nums);
                const range = max - min;
                if (range > 0) {
                  const roughStep = range / 4;
                  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
                  const step = Math.max(10000, Math.ceil(roughStep / magnitude) * magnitude);
                  config = { step, min, max };
                }
              }

              const formatAmount = (num: number) => {
                if (num >= 10000) return `${num / 10000}万円`;
                return `${num}円`;
              };

              const getAmountBinLabel = (num: number, config: any) => {
                if (!config) return String(num);
                const binStart = Math.floor(num / config.step) * config.step;
                const binEnd = binStart + config.step;
                return `${formatAmount(binStart)}〜${formatAmount(binEnd)}`;
              };

              const amountBins: Record<string, Set<string>> = {};
              const nonAmounts: Set<string> = new Set();
              
              vals.forEach(v => {
                 const numStr = strToNum(v);
                 const num = parseFloat(numStr);
                 if (!isNaN(num)) {
                    const binLabel = getAmountBinLabel(num, config);
                    if (!amountBins[binLabel]) amountBins[binLabel] = new Set();
                    amountBins[binLabel].add(v);
                 } else {
                    nonAmounts.add(v);
                 }
              });

              Object.keys(amountBins).sort((a, b) => {
                  const numA = parseFloat(a.replace(/[^0-9.]/g, '')) || 0;
                  const numB = parseFloat(b.replace(/[^0-9.]/g, '')) || 0;
                  return numA - numB;
               }).forEach(bin => {
                  const binVals = Array.from(amountBins[bin]);
                  const binDocs = docsFilteredByAncestors.filter(doc => {
                     const v = String((doc.custom_attributes || {})[attrKey] || "").trim();
                     return binVals.includes(v);
                  });
                  
                  const binNode: TreeNode = {
                     id: `${attrNodeId}-${bin}`,
                     label: bin,
                     payload: { 
                        parentGroup: attrKey, 
                        binLabel: bin, 
                        binValues: binVals,
                        accumulatedFilters: { ...currentFilters },
                        documentIds: binDocs.map(d => d.id)
                     },
                     children: []
                  };
                  binVals.sort((a, b) => {
                     const vA = parseFloat(strToNum(a as string)) || 0;
                     const vB = parseFloat(strToNum(b as string)) || 0;
                     return vA - vB;
                  }).forEach(val => {
                     const valDocs = binDocs.filter(doc => {
                        const v = String((doc.custom_attributes || {})[attrKey] || "").trim();
                        return v === val;
                     });
                     binNode.children?.push({
                        id: `${attrNodeId}-${bin}-${val}`,
                        label: val,
                        payload: { 
                           parentGroup: attrKey, 
                           tag: val, 
                           binLabel: bin, 
                           binValues: binVals,
                           accumulatedFilters: { ...currentFilters, [attrKey]: val },
                           documentIds: valDocs.map(d => d.id)
                        }
                     });
                  });
                  attrNode.children?.push(binNode);
               });
               
               if (nonAmounts.size > 0) {
                  Array.from(nonAmounts).sort().forEach(val => {
                     const valDocs = docsFilteredByAncestors.filter(doc => {
                        const v = String((doc.custom_attributes || {})[attrKey] || "").trim();
                        return v === val;
                     });
                     attrNode.children?.push({
                        id: `${attrNodeId}-non-${val}`,
                        label: val,
                        payload: { 
                           parentGroup: attrKey, 
                           tag: val,
                           accumulatedFilters: { ...currentFilters, [attrKey]: val },
                           documentIds: valDocs.map(d => d.id)
                        }
                     });
                  });
               }
            } else {
               vals.sort().forEach(val => {
                  const valDocs = docsFilteredByAncestors.filter(doc => {
                     const v = String((doc.custom_attributes || {})[attrKey] || "").trim();
                     return v === val;
                  });
                  attrNode.children?.push({
                     id: `${attrNodeId}-${val}`,
                     label: val,
                     payload: { 
                        parentGroup: attrKey, 
                        tag: val,
                        accumulatedFilters: { ...currentFilters, [attrKey]: val }
                     }
                  });
               });
            }
            
            if (hasMissing) {
               attrNode.children?.push({
                  id: `${attrNodeId}-none`,
                  label: '（指定なし）',
                  payload: { 
                     parentGroup: attrKey, 
                     isNone: true,
                     accumulatedFilters: { ...currentFilters }
                  }
               });
            }
         }
         
         nodes.push(attrNode);
      });
      
      return nodes;
    };
    
    return buildRecursiveAITree(docsList, treeConfig.extracted_tree, {});
  };

  const finalTree = useMemo<TreeNode[]>(() => {
    if (!treeConfig) return [];
    
    const getSubTree = (docsList: Document[], prefix: string, isArchivedVal: boolean): TreeNode[] => {
      let rawTree: TreeNode[] = [];
      if (treeConfig.grouping_type === "date") {
        rawTree = buildDateTree(docsList);
      } else if (treeConfig.grouping_type === "custom_attributes") {
        rawTree = buildCustomAttrsTree(docsList);
      } else if (treeConfig.grouping_type === "ai_extracted") {
        rawTree = buildAIExtractedTree(docsList);
      } else {
        rawTree = buildGeneralTree(docsList);
      }
      
      const addPrefixAndFilter = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map(node => {
          let payloadObj = node.payload;
          if (typeof payloadObj !== "object" || payloadObj === null) {
            payloadObj = { value: node.payload };
          }
          return {
            ...node,
            id: `${prefix}-${node.id}`,
            payload: {
              ...payloadObj,
              isArchivedFilter: isArchivedVal
            },
            children: node.children ? addPrefixAndFilter(node.children) : undefined
          };
        });
      };
      return addPrefixAndFilter(rawTree);
    };

    const activeDocs = displayedDocs.filter(d => !d.is_archived);
    const archivedDocs = displayedDocs.filter(d => !!d.is_archived);

    if (showArchived) {
      const activeSubTree = getSubTree(activeDocs, "active", false);
      const archivedSubTree = getSubTree(archivedDocs, "archived", true);

      const result: TreeNode[] = [];
      if (activeSubTree.length > 0) {
        result.push({
          id: "root-active",
          label: "アクティブ",
          payload: { isArchivedFilter: false },
          children: activeSubTree
        });
      }
      if (archivedSubTree.length > 0) {
        result.push({
          id: "root-archived",
          label: "アーカイブ",
          payload: { isArchivedFilter: true },
          children: archivedSubTree
        });
      }
      return result;
    } else {
      return getSubTree(activeDocs, "active", false);
    }
  }, [treeConfig, displayedDocs, showArchived]);

  // 選択されたノードのpayloadを逆引きして取得
  const selectedTreeNode = useMemo(() => {
    if (!selectedTreeNodeId) return null;
    
    const findNode = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.id === selectedTreeNodeId) return n;
        if (n.children) {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    const node = findNode(finalTree);
    return node ? node.payload : null;
  }, [selectedTreeNodeId, finalTree]);

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

  const filteredDocs = displayedDocs.filter(doc => {
    // ツリーフィルター
    if (!treeConfig || !selectedTreeNode) return true;

    // isArchivedFilter が定義されている場合は、アーカイブステータスが一致するか確認
    if (selectedTreeNode.isArchivedFilter !== undefined) {
      const docArchived = !!doc.is_archived;
      if (docArchived !== selectedTreeNode.isArchivedFilter) return false;
    }

    // 最上位の「アクティブ」または「アーカイブ」のルートフォルダ自体が選択された場合は、すべての配下ドキュメントを表示
    if (selectedTreeNode.isArchivedFilter !== undefined && Object.keys(selectedTreeNode).filter(k => k !== "isArchivedFilter").length === 0) {
      return true;
    }

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

    if (treeConfig.grouping_type === "custom_attributes") {
      const attrs = doc.custom_attributes || {};
      const docType = attrs["文書種類"] || doc.document_type || "未分類";
      
      if (selectedTreeNode.docType && selectedTreeNode.docType !== docType) return false;
      if (selectedTreeNode.attrKey) {
         const valStr = String(attrs[selectedTreeNode.attrKey] || "").trim();
         
         if (selectedTreeNode.isNone) {
            return valStr === "";
         }

         if (!selectedTreeNode.attrValue && !selectedTreeNode.binLabel && !selectedTreeNode.year) {
            return true;
         }

         if (!valStr) return false;
         
         // value matching
         if (selectedTreeNode.attrValue && valStr !== selectedTreeNode.attrValue) return false;
         
         // amount matching
         if (selectedTreeNode.binLabel && selectedTreeNode.binLabel !== selectedTreeNode.attrValue) {
             if (selectedTreeNode.binValues && !selectedTreeNode.binValues.includes(valStr)) return false;
         }
         
         // date matching
         if (selectedTreeNode.year) {
             const dateMatch = valStr.match(/^(\d{4})[-/年]?(\d{1,2})?[-/月]?(\d{1,2})?[日]?$/);
             if (!dateMatch) return false;
             const y = dateMatch[1] + "年";
             const m = dateMatch[2] ? dateMatch[2].padStart(2, '0') + "月" : "";
             const d = dateMatch[3] ? dateMatch[3].padStart(2, '0') + "日" : "";
             
             if (selectedTreeNode.year !== y) return false;
             if (selectedTreeNode.month && selectedTreeNode.month !== m) return false;
             if (selectedTreeNode.day && selectedTreeNode.day !== d) return false;
         }
      }
      return true;
    }

    if (treeConfig.grouping_type === "extension") {
      const ext = "." + (val.split('.').pop()?.toLowerCase() || "");
      return ext === selectedTreeNode.value;
    }

    if (treeConfig.grouping_type === "ai_extracted") {
       /* console.log("AI Extracted Filter Root Call:", {
          selectedNodeId: selectedTreeNode?.id,
          selectedNodeLabel: selectedTreeNode?.label,
          selectedNodePayload: selectedTreeNode?.payload,
          docId: doc.id,
          docName: doc.file_name
       });
       */ if (selectedTreeNode && typeof selectedTreeNode === 'object') {
          const documentIds = (selectedTreeNode as any).documentIds;
           if (documentIds) {
             const stringifiedIds = documentIds.map((id: any) => String(id));
             const docIdStr = String(doc.id);
             const isMatch = stringifiedIds.includes(docIdStr);
             /* console.log("AI Extracted Filter Match Detail:", {
                docName: doc.file_name,
                stringifiedIds,
                docIdStr,
                isMatch
             }); */
             return isMatch;
          }
       }
       return false;
    }

    if (treeConfig.grouping_type === "comma_separated") {
      const list = (val as any || "").toString().split(',').map((v: string) => v.trim());
      return list.includes(selectedTreeNode.value);
    }

    if (treeConfig.grouping_type === "exact_match") {
      return val === selectedTreeNode.value;
    }

    return true;
  });

  const sortedDocs = [...filteredDocs].sort((a, b) => {
    if (searchQuery.trim()) {
      const matchA = isDocMatchedSearch(a) ? 1 : 0;
      const matchB = isDocMatchedSearch(b) ? 1 : 0;
      if (matchA !== matchB) {
        return matchB - matchA;
      }
    }

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

  const handleTreeNodeClick = (node: TreeNode) => {
    const hasChildren = node.children && node.children.length > 0;
    if (hasChildren) {
      setExpandedAIGroups(prev => {
        const isRoot = node.id === "root-active" || node.id === "root-archived";
        const currentVal = prev[node.id];
        return {
          ...prev,
          [node.id]: isRoot ? (currentVal === undefined ? false : !currentVal) : !currentVal
        };
      });
    }
    setSelectedTreeNodeId(node.id);
  };

  const renderTreeNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = (node.id === "root-active" || node.id === "root-archived")
      ? (expandedAIGroups[node.id] !== false) // デフォルト true
      : !!expandedAIGroups[node.id];
      
    const isSelected = selectedTreeNodeId === node.id;
    const isRootFolder = node.id === "root-active" || node.id === "root-archived";
    const labelClass = isRootFolder ? "text-indigo-400 font-bold" : "text-gray-300";
    
    let chevron = <div className="w-3 h-3 shrink-0" />;
    if (hasChildren) {
      chevron = isExpanded 
        ? <ChevronDown className="w-3 h-3 shrink-0" /> 
        : <ChevronRight className="w-3 h-3 shrink-0" />;
    }

    return (
      <div key={node.id} className="space-y-0.5">
        <div
          onClick={() => handleTreeNodeClick(node)}
          className={`flex items-center gap-1.5 pr-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${isSelected ? 'bg-indigo-500/20 text-indigo-300 font-bold' : 'text-gray-400 hover:bg-white/5'}`}
          style={{ paddingLeft: `${0.5 + level * 1.0}rem` }}
        >
          {chevron}
          <Folder className={`w-3.5 h-3.5 shrink-0 ${isRootFolder ? 'text-indigo-500' : 'opacity-80'}`} />
          <span className={`truncate ${labelClass}`}>{node.label}</span>
        </div>
        {isExpanded && hasChildren && (
          <div className="space-y-0.5">
            {node.children?.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="w-56 border-r border-white/5 flex flex-col min-h-0 bg-black/20 shrink-0">
        <div className="p-4 border-b border-white/5">
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">AI動的分類ツリー</div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none mb-1">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setShowArchived(e.target.checked);
                  setSelectedTreeNodeId(null);
                }}
                className="rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
              />
              <span>アーカイブを含む</span>
            </label>
            <select
              value={presetType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePresetChange(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
            >
              <option value="none" className="bg-[#0a0a20]">▼ 分類軸を選択</option>
              <option value="type" className="bg-[#0a0a20]">文書種類別 (種類 ＞ 固有属性)</option>
              <option value="date" className="bg-[#0a0a20]">アップロード日</option>
              <option value="ext" className="bg-[#0a0a20]">ファイル形式</option>
              <option value="org" className="bg-[#0a0a20]">関連企業</option>
              <option value="custom" className="bg-[#0a0a20]">その他 (AI動的分類)</option>
            </select>
            
            <div className="flex gap-2">
              <input 
                type="text" 
                value={themeInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setThemeInput(e.target.value)}
                placeholder="任意のテーマを入力..."
                disabled={presetType !== "custom"}
                className={`flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 ${presetType !== "custom" ? "opacity-30 cursor-not-allowed" : ""}`}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && presetType === "custom" && handleClassify()}
              />
              <button 
                onClick={handleClassify}
                disabled={presetType !== "custom" || isClassifying || !themeInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded px-2 py-1 flex items-center justify-center transition-colors shrink-0"
              >
                {isClassifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
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
            onClick={() => setSelectedTreeNodeId(null)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${!selectedTreeNodeId ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span className="truncate">すべての資料</span>
          </div>
          
          {finalTree.map(node => renderTreeNode(node))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center gap-2">
          <span>資料ライブラリ</span>
          <div className="relative flex-1 max-w-[200px] flex items-center">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="キーワード検索..."
              defaultValue=""
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const val = e.target.value;
                setHasInputValue(!!val.trim());
                if (!isComposing.current) {
                  setSearchQuery(val);
                }
              }}
              onCompositionStart={() => {
                isComposing.current = true;
              }}
              onCompositionEnd={(e: any) => {
                isComposing.current = false;
                const val = e.currentTarget.value;
                setSearchQuery(val);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-2 pl-6 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Search className="w-3 h-3 absolute left-2 text-gray-500" />
            {hasInputValue && (
              <button 
                onClick={() => {
                  if (searchInputRef.current) {
                    searchInputRef.current.value = "";
                  }
                  setHasInputValue(false);
                  setSearchQuery("");
                }} 
                className="absolute right-2 text-gray-500 hover:text-white"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        <div className="px-4 mb-4 flex gap-2">
          <select
            value={selectedTag}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectTag(e.target.value)}
            className="w-1/2 p-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#0a0a20]">マークする属性を選択</option>
            {tags.map((tag) => (
              <option key={tag} value={tag} className="bg-[#0a0a20]">#{tag}</option>
            ))}
          </select>
          <select
            value={selectedOrg}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelectOrg(e.target.value)}
            className="w-1/2 p-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#0a0a20]">マークする企業を選択</option>
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
              sortedDocs.map((doc: Document) => {
                const isArchived = !!doc.is_archived;
                const isMatched = isDocMatchedSearch(doc);
                
                const hasSearch = searchQuery.trim() !== "";
                let bgClass = "hover:bg-white/5";
                if (selectedDoc?.id === doc.id) {
                  if (hasSearch) {
                    if (isMatched) {
                      bgClass = "bg-white/10 border-l-2 border-indigo-400 border border-indigo-500/80";
                    } else {
                      bgClass = "bg-white/10 border-l-2 border-gray-600";
                    }
                  } else {
                    bgClass = "bg-white/10 border-l-2 border-indigo-500";
                  }
                } else if (hasSearch) {
                  if (isMatched) {
                    bgClass = isArchived 
                      ? "bg-indigo-950/20 border border-indigo-500/60 opacity-70 hover:bg-indigo-950/40 hover:opacity-85"
                      : "bg-indigo-950/40 border border-indigo-500/40 hover:bg-indigo-950/60";
                  } else {
                    bgClass = isArchived
                      ? "opacity-35 hover:opacity-55 bg-white/5"
                      : "opacity-25 hover:opacity-45";
                  }
                } else if (isArchived) {
                  bgClass = "opacity-45 hover:opacity-75 bg-white/5";
                }

                return (
                  <div
                    key={doc.id}
                    onClick={() => onSelectDoc(doc)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all group cursor-pointer ${bgClass}`}
                  >
                  <div className="shrink-0 w-5 flex items-center justify-center">
                    {isArchived ? (
                      <FileBox className="w-4 h-4 text-indigo-400/70" title="アーカイブ済" />
                    ) : doc.status === 'completed' ? (
                      <FileText className="w-5 h-5 text-green-500" />
                    ) : doc.status === 'failed' ? (
                      <X className="w-5 h-5 text-red-500" strokeWidth={3} />
                    ) : doc.status === 'review_pending' ? (
                      <span className="text-orange-500 font-black text-2xl drop-shadow-[0_0_2px_rgba(249,115,22,0.8)] select-none" title="タグ確認待ち">!</span>
                    ) : (
                      <RefreshCw className="w-4 h-4 text-gray-500" />
                    )}
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
                            <div className={`text-sm font-medium truncate leading-tight ${isArchived ? 'text-gray-400' : 'text-white'}`}>{doc.file_name}</div>
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
              );
            })
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
