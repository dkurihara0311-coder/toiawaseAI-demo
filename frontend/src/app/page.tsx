"use client";



import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Send, 
  Upload, 
  Plus, 
  Search, 
  PanelRightOpen, 
  PanelRightClose,
  MoreVertical,
  Paperclip,
  RefreshCcw as RefreshCw,
  X,
  Trash2,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import axios from "axios";

// --- Types ---
interface Document {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
  customer_name?: string;
  summary?: string;
  tags?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  references?: { document_id: string; file_name: string }[];
}

export default function Dashboard() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingChat, setIsProcessingChat] = useState(false);

  const [showDocPanel, setShowDocPanel] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");

  const [sidebarWidth, setSidebarWidth] = useState(800);
  const [isResizing, setIsResizing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [isHeaderDragging, setIsHeaderDragging] = useState(false); // D&D競合対策フラグ

  interface SortConfig {
    key: "file_name" | "created_at" | "type" | "tags";
    label: string;
    order: "asc" | "desc";
  }
  
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([]);

  // --- カラム設定定数 ---
  interface ColumnConfig {
    key: "file_name" | "created_at" | "type" | "tags";
    label: string;
    width: string; // カラムごとの比率
  }

  const DEFAULT_COLUMNS: ColumnConfig[] = [
    { key: "file_name", label: "名称", width: "w-80 flex-shrink-0" },
    { key: "created_at", label: "アップロード日", width: "w-28 flex-shrink-0" },
    { key: "type", label: "種類", width: "w-16 flex-shrink-0" },
    { key: "tags", label: "属性", width: "w-14 flex-shrink-0" }
  ];

  const [columnOrder, setColumnOrder] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const draggedColRef = useRef<number | null>(null);

  const handleColumnDragStart = (index: number) => {
    setIsHeaderDragging(true);
    draggedColRef.current = index;
  };

  const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedColRef.current === null || draggedColRef.current === index) return;

    // マウス位置の判定（左右中央を超えた時だけ入れ替えることでチラつきを防止）
    const targetElement = (e as any).currentTarget as HTMLDivElement;
    const rect = targetElement.getBoundingClientRect();
    const mouseX = (e as any).clientX; // DragEvent は MouseEvent を継承しているが React の型定義上キャストが必要な場合がある
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
  // ------------------------------------

  // 設定の復元とマウント検知
  useEffect(() => {
    setIsMounted(true);
    const savedWidth = localStorage.getItem("tank_sidebar_width");
    if (savedWidth) setSidebarWidth(parseInt(savedWidth, 10));

    const savedSort = localStorage.getItem("tank_sort_configs");
    let initialSort = undefined;
    if (savedSort) {
      try {
        initialSort = JSON.parse(savedSort);
        if (Array.isArray(initialSort) && initialSort.length > 0) {
          setSortConfigs(initialSort);
        }
      } catch (e) {
        console.error("Failed to load sort configs", e);
      }
    } else {
      // 初回アクセス時のデフォルト
      const defaultSort: SortConfig[] = [{ key: "created_at", label: "アップロード日", order: "desc" }];
      initialSort = defaultSort;
      setSortConfigs(defaultSort);
    }

    // 記憶情報の復元
    const savedTag = localStorage.getItem("tank_selected_tag");
    if (savedTag) setSelectedTag(savedTag);

    const savedColumns = localStorage.getItem("tank_column_order");
    if (savedColumns) {
      try {
        const parsed = JSON.parse(savedColumns);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 幅設定だけは最新の DEFAULT_COLUMNS 定数から強制的に上書きし、順序だけを復元する
          const updatedColumns = parsed.map(col => {
            const def = DEFAULT_COLUMNS.find(d => d.key === col.key);
            return def ? { ...col, width: def.width } : col;
          });
          setColumnOrder(updatedColumns);
        }
      } catch (e) {
        console.error("Failed to load column order", e);
      }
    }
    
    // フェッチを開始（復元完了前に行うことでロード画面を速やかに解除）
    fetchDocs(initialSort);
    fetchTags();

    // 最後に復元完了をマーク（これにより保存用 useEffect が古い値で上書きするのを防ぐ）
    setTimeout(() => {
      setIsRestored(true);
    }, 500);
  }, []);

  // 設定の保存（復元が完了してからのみ実行）
  useEffect(() => {
    if (isRestored) {
      localStorage.setItem("tank_sidebar_width", sidebarWidth.toString());
    }
  }, [sidebarWidth, isRestored]);

  useEffect(() => {
    if (isRestored) {
      localStorage.setItem("tank_sort_configs", JSON.stringify(sortConfigs));
    }
  }, [sortConfigs, isRestored]);

  // 設定の自動保存
  useEffect(() => {
    if (isRestored) {
      localStorage.setItem("tank_column_order", JSON.stringify(columnOrder));
    }
  }, [columnOrder, isRestored]);

  useEffect(() => {
    if (isRestored) {
      localStorage.setItem("tank_selected_tag", selectedTag);
    }
  }, [selectedTag, isRestored]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const getApiUrl = () => {
    const baseUrl = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) 
      ? process.env.NEXT_PUBLIC_API_URL 
      : (typeof window !== "undefined" 
          ? `${window.location.protocol}//${window.location.hostname}:${window.location.hostname === "localhost" ? "8000" : "10000"}`
          : "http://localhost:8000");
    return baseUrl.replace(/\/$/, ""); // 末尾のスラッシュを確実に除去
  };

  const API_URL = getApiUrl();

  // --- Effects ---
  useEffect(() => {
    // マウント時のデモセットアップのみを実行
    axios.post(`${API_URL}/api/setup-demo`).catch((e: any) => console.error("Setup error", e));

    const handleDragEnter = (e: DragEvent) => {
      if (isHeaderDragging) return;
      // 外部ファイル（Files）のドラッグでない場合は即座に無視
      if (!e.dataTransfer?.types.includes("Files")) return;

      e.preventDefault();
      e.stopPropagation();
      dragCounter.current!++;
      if (dragCounter.current! > 0) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isHeaderDragging) return;
      // 外部ファイル（Files）のドラッグでない場合は即座に無視
      if (!e.dataTransfer?.types.includes("Files")) return;

      e.preventDefault();
      e.stopPropagation();
      dragCounter.current!--;
      if (dragCounter.current! <= 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (isHeaderDragging) return;
      // 外部ファイル（Files）のドラッグでない場合は即座に無視
      if (!e.dataTransfer?.types.includes("Files")) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files).forEach(file => {
          uploadFile(file);
        });
      }
    };

    window.addEventListener("dragenter", handleDragEnter, true);
    window.addEventListener("dragleave", handleDragLeave, true);
    window.addEventListener("dragover", handleDragOver, true);
    window.addEventListener("drop", handleDrop, true);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter, true);
      window.removeEventListener("dragleave", handleDragLeave, true);
      window.removeEventListener("dragover", handleDragOver, true);
      window.removeEventListener("drop", handleDrop, true);
    };
  }, []);

  useEffect(() => {
    fetchTags();
  }, [docs]); // ドキュメント一覧が更新されたらタグ一覧も更新する

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ポーリング管理（処理中の資料がある場合のみ）
  useEffect(() => {
    const checkProcessing = () => docs.some(doc => doc.status === 'processing' || doc.status === 'uploaded');
    const isProcessing = checkProcessing();
    
    let intervalId: any = null;
    
    if (isProcessing) {
      intervalId = setInterval(() => {
        fetchDocs();
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [docs.some(doc => doc.status === 'processing' || doc.status === 'uploaded')]);

  // selectedDoc の同期ロジックのみ維持

  // 現在選択中の資料がある場合、最新のリスト (docs) から同期する
  useEffect(() => {
    if (selectedDoc) {
      const latestDoc = docs.find(d => d.id === selectedDoc.id);
      if (latestDoc && JSON.stringify(latestDoc) !== JSON.stringify(selectedDoc)) {
        setSelectedDoc(latestDoc);
      }
    }
  }, [docs, selectedDoc]);

  // --- Actions ---
  const fetchDocs = async (currentConfigs?: SortConfig[]) => {
    setIsLoadingDocs(true);
    setFetchError(null);
    try {
      // サーバーサイド・ソートのパラメータ構築 (第一優先キーを送信)
      const primary = currentConfigs && currentConfigs.length > 0 ? currentConfigs[0] : (sortConfigs[0] || null);
      const params = primary ? { sort_key: primary.key, sort_order: primary.order } : {};
      
      console.log(`DEBUG: Attempting to fetch documents from ${API_URL}/api/documents with params:`, params);
      const res = await axios.get(`${API_URL}/api/documents?t=${Date.now()}`, { params, timeout: 10000 });
      setDocs(res.data as Document[]);
      console.log(`DEBUG: Successfully fetched ${res.data.length} documents.`);
    } catch (e: any) {
      console.error("Fetch docs error:", e);
      setFetchError("サーバーに接続できません。バックエンドが起動しているか確認してください。");
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/tags?t=${Date.now()}`);
      setTags(res.data as string[]);
    } catch (e: any) {
      console.error("Fetch tags error", e);
    }
  };

  const handleSort = (key: SortConfig["key"], label: string) => {
    setSortConfigs(prev => {
      const isFirst = prev.length > 0 && prev[0].key === key;
      if (isFirst) {
        // 現在の第一キーなら、順序を反転させるのみ
        const newOrder = prev[0].order === "asc" ? "desc" : "asc";
        return [{ ...prev[0], order: newOrder }, ...prev.slice(1)];
      } else {
        // 第一キーでないなら、既存の履歴から削除して先頭に（デフォルト順で）追加
        const filtered = prev.filter(c => c.key !== key);
        const defaultOrder = (key === "created_at" ? "desc" : "asc");
        return [{ key, label, order: defaultOrder }, ...filtered];
      }
    });
  };

  // ソート・フィルタ適用後のドキュメントリスト
  const sortedDocs = [...docs]
    .sort((a, b) => {
      // 保存されているソート設定の優先順位（configsのインデックス順）に従って比較
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
          // ユーザーの指摘通り、表示状態（○か否か）に基づいてソートする。
          // フィルタが未選択（すべての属性を表示）の場合は、属性によるソートは行わず常に 0 を返す。
          if (!selectedTag) {
            comparison = 0;
          } else {
            const hasA = a.tags?.split(',').map(t => t.trim()).includes(selectedTag) ? 1 : 0;
            const hasB = b.tags?.split(',').map(t => t.trim()).includes(selectedTag) ? 1 : 0;
            comparison = hasB - hasA; // 「○」がある方を上位に（降順をデフォルト的に扱うなら B - A）
          }
        }

        if (comparison !== 0) {
          return order === "asc" ? comparison : -comparison;
        }
      }
      return 0; // すべての項目が同じなら現状維持
    });

  const startResizing = React.useCallback((mouseDownEvent: React.MouseEvent) => {
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth > 300 && newWidth < 1200) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const uploadFile = async (file: File) => {
    const allowedExtensions = [".pdf", ".docx", ".xlsx", ".txt", ".md"];
    const fileName = file.name.toLowerCase();
    const isAllowed = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!isAllowed) {
      alert("対応していないファイル形式です（PDF, Word, Excel, テキストのみ可能です）。");
      return;
    }
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post(`${API_URL}/api/upload`, formData);
      fetchDocs();
    } catch (e: any) {
      alert("アップロードに失敗しました。");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    uploadFile(e.target.files[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => {
        uploadFile(file);
      });
    }
  };

  const deleteDoc = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger the select/panel logic
    if (!confirm("この資料を削除してもよろしいですか？関連するチャット解析データもすべて消去されます。")) return;

    try {
      await axios.delete(`${API_URL}/api/documents/${docId}`);
      setDocs((prev: Document[]) => prev.filter((d: Document) => d.id !== docId));
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
        setShowDocPanel(false);
      }
    } catch (err: any) {
      console.error(err);
      alert("削除に失敗しました。");
    }
  };

  const downloadAction = async (docId: string, type: 'original' | 'md') => {
    const endpoint = type === 'original' ? `/api/documents/${docId}/download` : `/api/documents/${docId}/export-md`;
    try {
      const response = await axios.get(`${API_URL}${endpoint}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] }));
      const link = document.createElement('a');
      link.href = url;
      
      // 生成するファイル名の決定 (原紙名 + "_要約")
      let fileName = selectedDoc?.file_name || 'download';
      if (type === 'md' && selectedDoc) {
        const baseName = selectedDoc.file_name.replace(/\.[^/.]+$/, "");
        fileName = `${baseName}_要約.md`;
      }
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (e: any) {
      console.error(e);
      alert("ダウンロードに失敗しました。");
    }
  };

  const handleSend = async () => {
    const messageContent = input.trim();
    if (!messageContent || isProcessingChat) return;
    
    setMessages((prev: Message[]) => [...prev, { role: "user", content: messageContent } as Message]);
    setInput("");
    setIsProcessingChat(true);

    try {
      const res = await axios.post(`${API_URL}/api/chat`, { 
        message: messageContent,
        history: messages.map((m: Message) => ({ role: m.role, content: m.content }))
      });
      const aiMsg: Message = { 
        role: "assistant", 
        content: res.data.answer,
        references: res.data.references
      };
      setMessages((prev: Message[]) => [...prev, aiMsg]);
    } catch (e: any) {
      console.error(e);
      let errorMsg = "エラーが発生しました。";
      if (e.response?.status === 429) {
        errorMsg = "AIの利用制限（クォータ）を超えました。1分ほど待ってから再度お試しください。";
      }
      setMessages((prev: Message[]) => [...prev, { role: "assistant", content: errorMsg } as Message]);
    } finally {
      setIsProcessingChat(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#050510] text-gray-100 font-sans relative">
      {/* 全画面ドラッグオーバーレイ */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-indigo-600/20 backdrop-blur-sm border-4 border-indigo-500 border-dashed m-4 rounded-3xl flex flex-col items-center justify-center transition-all animate-in fade-in duration-200 pointer-events-none">
          <div className="bg-[#0a0a20] p-8 rounded-full shadow-2xl shadow-indigo-500/20 mb-4 flex flex-col items-center">
            <Upload className="w-16 h-16 text-indigo-400 animate-bounce" />
            <h2 className="text-3xl font-bold text-white mt-6">資料をドロップしてアップロード</h2>
            <p className="text-indigo-300 mt-2">PDF, Word, Excel, テキストに対応しています</p>
          </div>
        </div>
      )}
      
      {/* Sidebar: Document List */}
      <aside 
        className="flex-shrink-0 flex flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl relative"
        style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '1200px' }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={startResizing}
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-50"
        />
        <div className="p-8 flex justify-center">
          <img 
            src="/logo.png" 
            alt="TANK Logo" 
            className="w-48 h-auto object-contain brightness-110 contrast-125"
            style={{ mixBlendMode: 'screen' }} 
          />
        </div>

        <div className="px-4 mb-4">
          <label className="flex items-center justify-center gap-2 w-full p-3 glass-panel hover:bg-white/10 transition-all cursor-pointer group">
            <Upload className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">資料をアップロード</span>
            <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.docx,.xlsx,.txt,.md" />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
            <span>資料ライブラリ</span>
            <Search className="w-3 h-3" />
          </div>

          <div className="px-4 mb-4">
            <select
              value={selectedTag}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTag(e.target.value)}
              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236366f1\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'org.lucide.ChevronDown\' /%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
            >
              <option value="" className="bg-[#0a0a20]">すべての属性を表示</option>
              {tags.map((tag) => (
                <option key={tag} value={tag} className="bg-[#0a0a20]">
                  #{tag}
                </option>
              ))}
            </select>
          </div>

        {/* Scrollable Document Area (Header + List Integrated) */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-auto px-2 space-y-1 custom-scrollbar">
            <div className="min-w-max pb-4">
              {/* Sort Headers - Forced Width to prevent displacement */}
              <div className="w-full flex items-center gap-3 px-4 py-2 border-b border-white/5 mb-1 select-none">
                <div className="shrink-0 w-5 flex items-center justify-center opacity-0 uppercase font-black text-[10px]">
                  ICON
                </div>

                <div className="flex items-center gap-3 px-1 min-w-0">
                  {columnOrder.map((item, idx) => {
                    const configIndex = sortConfigs.findIndex(c => c.key === item.key);
                    const config = sortConfigs[configIndex];
                    const isFirst = configIndex === 0;

                    // クラス名から物理ピクセルをマッピング
                    const widthMap: Record<string, string> = {
                      "w-80": "320px",
                      "w-48": "192px",
                      "w-36": "144px",
                      "w-32": "128px",
                      "w-28": "112px",
                      "w-24": "96px",
                      "w-20": "80px",
                      "w-16": "64px",
                      "w-14": "56px",
                      "w-12": "48px"
                    };
                    const physicalWidth = widthMap[item.width.split(' ')[0]] || "auto";
                    const isDraggingThis = draggedColRef.current === idx;

                    return (
                      <div
                        key={item.key}
                        draggable
                        onDragStart={() => handleColumnDragStart(idx)}
                        onDragOver={(e) => handleColumnDragOver(e, idx)}
                        onDrop={handleColumnDrop}
                        onDragEnd={handleColumnDrop}
                        onClick={() => handleSort(item.key as any, item.label)}
                        className={`min-w-0 flex-shrink-0 px-2 flex flex-col items-start cursor-pointer group box-border overflow-hidden ${item.width} transition-colors ${isDraggingThis ? 'opacity-30' : ''}`}
                        style={{ width: physicalWidth, minWidth: physicalWidth, flex: '0 0 auto' }}
                      >
                        <div className="flex items-center gap-1 w-full overflow-hidden">
                          <span className={`text-[10px] font-bold uppercase tracking-wider truncate shrink ${isFirst ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
                            {item.label}
                          </span>
                          {config && (
                            <div className="shrink-0">
                              {config.order === "asc" ? 
                                <ChevronUp className={`w-2.5 h-2.5 ${isFirst ? 'text-indigo-500' : 'text-gray-600'}`} /> : 
                                <ChevronDown className={`w-2.5 h-2.5 ${isFirst ? 'text-indigo-500' : 'text-gray-600'}`} />
                              }
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

              {!isMounted || isLoadingDocs ? (
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
                  <button onClick={() => { fetchDocs(); fetchTags(); }} className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs flex items-center gap-2 mx-auto">
                    <RefreshCw className="w-3 h-3" />
                    再試行
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
                    onClick={() => { setSelectedDoc(doc); setShowDocPanel(true); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:bg-white/5 group 
                      ${selectedDoc?.id === doc.id ? 'bg-white/10 border-l-2 border-indigo-500' : ''} 
                      cursor-pointer`}
                  >
                    <div className="shrink-0 w-5 flex items-center justify-center">
                      {doc.status === 'completed' ? (
                        <FileText className="w-5 h-5 text-green-500" />
                      ) : doc.status === 'failed' ? (
                        <X className="w-5 h-5 text-red-500 stroke-[3]" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                      )}
                    </div>

                    <div className="flex items-center gap-3 px-1 min-w-0">
                      {columnOrder.map((col) => {
                        const date = new Date(doc.created_at);
                        const ymd = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
                        const hms = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
                        const cellClass = `${col.width} min-w-0 flex-shrink-0 px-2`;

                        if (col.key === "file_name") {
                          return (
                            <div key={col.key} className={`${cellClass} flex items-center`}>
                              <div className="text-sm font-medium truncate text-white leading-tight">
                                {doc.file_name}
                              </div>
                            </div>
                          );
                        }
                        if (col.key === "created_at") {
                          return (
                            <div key={col.key} className={`${cellClass} text-[10px] text-gray-500 text-left`}>
                              {ymd} {hms}
                            </div>
                          );
                        }
                        if (col.key === "tags") {
                          const hasMatch = selectedTag && doc.tags?.split(',').map(t => t.trim()).includes(selectedTag);
                          return (
                            <div key={col.key} className={`flex items-center justify-start px-2 ${col.width}`}>
                              <span className={`text-[12px] font-black ${hasMatch ? 'text-indigo-400' : 'text-transparent'}`}>
                                {hasMatch ? "○" : ""}
                              </span>
                            </div>
                          );
                        }
                        if (col.key === "type") {
                          return (
                            <div key={col.key} className={`${cellClass} text-[10px] text-gray-500 uppercase text-left`}>
                              {doc.file_name.split('.').pop()}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        </div>

        {/* Foot Logo */}
        <div className="p-8 flex justify-center border-t border-white/5 mt-auto">
          <img 
            src="/footlogo.png" 
            alt="Foot Logo" 
            className="w-full max-w-xs h-auto object-contain opacity-60 brightness-110 contrast-125" // w-full と max-w-xs (20rem / 320px) を指定
            style={{ mixBlendMode: 'screen' }} 
          />
        </div>
      </aside>

      {/* Main Area: Chat */}
      <main className="flex-1 flex flex-col relative bg-gradient-to-b from-[#0a0a20] to-black">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Gemini LLM Connected</span>
          </div>
          <button 
            onClick={() => setShowDocPanel(!showDocPanel)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            {showDocPanel ? <PanelRightClose /> : <PanelRightOpen />}
          </button>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-12 animate-in fade-in zoom-in duration-1000">
              <div className="relative group">
                <div className="absolute -inset-10 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>
                <img 
                  src="/logo.png" 
                  alt="TANK" 
                  className="relative w-96 h-auto object-contain opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                  style={{ mixBlendMode: 'screen' }}
                />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-b from-white via-white to-gray-500 bg-clip-text text-transparent italic">
                  どのようなお手伝いをしましょうか？
                </h2>
                <p className="max-w-md text-gray-400 text-base leading-relaxed mx-auto font-light">
                  アップロードされた資料の内容に基づき、<br/>
                  AIが瞬時に関連情報を特定・回答します。
                </p>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 ${msg.role === 'user' ? 'chat-bubble-user shadow-lg shadow-indigo-500/20' : 'chat-bubble-ai'}`}>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                {msg.references && msg.references.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
                    {msg.references.map((ref, rIdx) => (
                      <span key={rIdx} className="px-2 py-1 bg-white/5 rounded text-[10px] flex items-center gap-1 border border-white/10">
                        <Paperclip className="w-3 h-3 text-indigo-400" />
                        {ref.file_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isProcessingChat && (
            <div className="flex justify-start">
              <div className="chat-bubble-ai p-4 flex items-center gap-3">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-8">
          <div className="max-w-4xl mx-auto glass-panel p-2 flex items-end gap-2 focus-within:border-indigo-500/50 transition-colors">
            <textarea
              rows={1}
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="質問を入力してください..."
              className="flex-1 bg-transparent border-none focus:ring-0 resize-none p-2 text-sm max-h-40"
            />
            <button 
              onClick={handleSend}
              disabled={isProcessingChat}
              className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-indigo-600"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 text-center text-[10px] text-gray-500 uppercase tracking-tighter">
            YOKOTA ENTERPRISE Co.,Ltd. All Rights Reserved.
          </div>
        </div>
      </main>

      {/* Right Panel: Doc Details (Drawer) */}
      <div className={`transition-all duration-300 ease-in-out border-l border-white/10 bg-black/40 backdrop-blur-xl ${showDocPanel ? 'w-[450px]' : 'w-0 overflow-hidden border-none'}`}>
        {selectedDoc ? (
          <div className="w-[450px] p-8 h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold">資料詳細</h3>
              <button 
                onClick={() => setShowDocPanel(false)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <MoreVertical className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="glass-panel p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-indigo-500/20 rounded-2xl">
                  <FileText className="w-8 h-8 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate text-lg" title={selectedDoc.file_name}>{selectedDoc.file_name}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1 font-bold">Status: {selectedDoc.status}</div>
                  
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button 
                      onClick={() => downloadAction(selectedDoc.id, 'original')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                    >
                      <FileText className="w-4 h-4" />
                      ダウンロード
                    </button>
                    <button 
                      onClick={() => downloadAction(selectedDoc.id, 'md')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg shadow-purple-500/20"
                    >
                      <FileText className="w-4 h-4" />
                      要約ダウンロード
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">関連組織 / 名称</div>
                  <div className="text-sm font-medium">{selectedDoc.customer_name || '未抽出'}</div>
                </div>
                {selectedDoc.tags && (
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">属性タグ</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDoc.tags.split(',').map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-md text-[10px]">
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">アップロード日時</div>
                  <div className="text-sm font-medium">{new Date(selectedDoc.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 glass-panel p-6 font-mono text-[11px] leading-relaxed overflow-y-auto mb-6">
              <div className="text-indigo-400 mb-2">【資料の概要】</div>
              {selectedDoc.status === 'completed' ? (
                <div className="text-gray-300 leading-relaxed italic whitespace-pre-wrap">
                  {(() => {
                    try {
                      const summaryText = selectedDoc.summary || "";
                      if (summaryText.startsWith('{') || summaryText.startsWith('[')) {
                        const data = JSON.parse(summaryText);
                        return data.brief || summaryText;
                      }
                      return summaryText || "概要は生成されませんでした。";
                    } catch (e) {
                      return selectedDoc.summary || "概要は生成されませんでした。";
                    }
                  })()}
                </div>
              ) : selectedDoc.status === 'failed' ? (
                <div className="text-red-400 italic">解析に失敗しました。ファイル形式を確認して再度アップロードしてください。</div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  解析中...
                </div>
              )}
            </div>

            {/* 資料の破棄セクション */}
            <div className="pt-6 border-t border-red-500/20">
              <button 
                onClick={(e: any) => deleteDoc(selectedDoc.id, e)}
                className="w-full flex items-center justify-center gap-2 p-3 bg-red-600/5 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-bold transition-all group"
              >
                <Trash2 className="w-4 h-4" />
                この資料を完全に削除する
              </button>
            </div>
          </div>
        ) : (
          <div className="w-[450px] h-full flex items-center justify-center text-gray-600 text-sm italic">
            資料を選択すると詳細が表示されます
          </div>
        )}
      </div>

      {/* Global Processing Loader */}
      {isUploading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="glass-panel p-8 flex flex-col items-center gap-4">
            <RefreshCw className="w-10 h-10 animate-spin text-gray-400" />
            <div className="font-bold">ファイルをアップロード中...</div>
          </div>
        </div>
      )}
    </div>
  );
}
