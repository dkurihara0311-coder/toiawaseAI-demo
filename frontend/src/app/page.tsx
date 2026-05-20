"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
// @ts-ignore
import { RefreshCcw as RefreshCw, Upload } from "lucide-react";

// Components
import { DocumentLibrary } from "./components/DocumentLibrary";
import { ChatPanel } from "./components/ChatPanel";
import { UploadZone } from "./components/UploadZone";
import { DocumentDetails } from "./components/DocumentDetails";

// Types
import { Document, Message, SortConfig, ColumnConfig } from "./types";

export default function Dashboard() {
  // --- States ---
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
  const [orgs, setOrgs] = useState<string[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [sidebarWidth, setSidebarWidth] = useState(800);
  const [isResizing, setIsResizing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [isHeaderDragging, setIsHeaderDragging] = useState(false);
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([]);

  const DEFAULT_COLUMNS: ColumnConfig[] = [
    { key: "file_name", label: "名称", width: "w-80 flex-shrink-0" },
    { key: "created_at", label: "アップロード日", width: "w-28 flex-shrink-0" },
    { key: "type", label: "種類", width: "w-16 flex-shrink-0" },
    { key: "file_size", label: "サイズ", width: "w-20 flex-shrink-0" },
    { key: "customer_name", label: "企業", width: "w-16 flex-shrink-0" },
    { key: "tags", label: "属性", width: "w-14 flex-shrink-0" }
  ];
  const [columnOrder, setColumnOrder] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const API_URL = (() => {
    const baseUrl = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) 
      ? process.env.NEXT_PUBLIC_API_URL 
      : (typeof window !== "undefined" 
          ? `${window.location.protocol}//${window.location.hostname}:${window.location.hostname === "localhost" ? "8000" : "10000"}`
          : "http://localhost:8000");
    return baseUrl ? baseUrl.replace(/\/$/, "") : "";
  })();

  // Promiseの確実なタイムアウト処理（AbortControllerが効かない環境への対策）
  const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string = "Timeout"): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(res => { clearTimeout(timer); resolve(res); })
             .catch(err => { clearTimeout(timer); reject(err); });
    });
  };

  useEffect(() => {
    let isCancelled = false;
    setIsMounted(true);
    
    let initialSort = [{ key: "created_at", label: "アップロード日", order: "desc" }] as SortConfig[];

    
    try {
      const savedWidth = localStorage.getItem("tank_sidebar_width");
      if (savedWidth) setSidebarWidth(parseInt(savedWidth, 10));

      const savedSort = localStorage.getItem("tank_sort_configs");
      if (savedSort) {
        try {
          const parsed = JSON.parse(savedSort);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSortConfigs(parsed);
            initialSort = parsed;
          }
        } catch (e) { console.error(e); }
      } else {
        setSortConfigs(initialSort);
      }
      
      const savedColumns = localStorage.getItem("tank_column_order");
      if (savedColumns) {
        try {
          const parsed = JSON.parse(savedColumns);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const savedKeys = parsed.map(col => typeof col === 'string' ? col : (col ? (col as any).key : undefined));
            let updated: ColumnConfig[] = [];
            savedKeys.forEach(key => {
              const def = DEFAULT_COLUMNS.find(d => d.key === key);
              if (def) updated.push(def);
            });
            DEFAULT_COLUMNS.forEach((defCol, index) => {
              if (!updated.find((c: ColumnConfig) => c.key === defCol.key)) {
                updated.splice(index, 0, defCol);
              }
            });
            setColumnOrder(updated);
          }
        } catch (e) { console.error(e); }
      }
      
      const savedTag = localStorage.getItem("tank_selected_tag");
      if (savedTag) setSelectedTag(savedTag);
      const savedOrg = localStorage.getItem("tank_selected_org");
      if (savedOrg) setSelectedOrg(savedOrg);
      
    } catch (error) {
      console.error("Initialization error:", error);
      if (!isCancelled) setSortConfigs(initialSort);
    } finally {
      // どのような例外が起きても、必ず初回のデータフェッチを実行する
      if (!isCancelled) {
        fetchDocs(initialSort);
        setIsRestored(true);
      }
    }

    return () => {
      isCancelled = true;
    };
  }, []);

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (sortConfigs.length > 0) {
      fetchDocs();
    }
  }, [sortConfigs]);

  useEffect(() => {
    if (isRestored) {
      localStorage.setItem("tank_sidebar_width", sidebarWidth.toString());
      localStorage.setItem("tank_sort_configs", JSON.stringify(sortConfigs));
      // カラム設定は「キーの並び順」だけを保存し、表示内容そのものはコード側を正とする
      localStorage.setItem("tank_column_order", JSON.stringify(columnOrder.map(c => c.key)));
      localStorage.setItem("tank_selected_tag", selectedTag);
      localStorage.setItem("tank_selected_org", selectedOrg);
    }
  }, [sidebarWidth, sortConfigs, columnOrder, selectedTag, selectedOrg, isRestored]);

  // --- Effects: Data & UX ---
  useEffect(() => {

    const handleDragEnter = (e: DragEvent) => {
      if (isHeaderDragging || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      dragCounter.current!++;
      if (dragCounter.current! > 0) setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isHeaderDragging || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      dragCounter.current!--;
      if (dragCounter.current! <= 0) setIsDragging(false);
    };

    const handleDragOver = (e: DragEvent) => {
      if (isHeaderDragging || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const handleDrop = (e: DragEvent) => {
      if (isHeaderDragging) return;
      e.preventDefault(); e.stopPropagation();
      setIsDragging(false); dragCounter.current = 0;
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files).forEach(file => uploadFile(file));
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
  }, [isHeaderDragging]);

  useEffect(() => {
    const isProcessing = docs.some(doc => doc.status === 'processing' || doc.status === 'uploaded');
    let intervalId: any = null;
    if (isProcessing) intervalId = setInterval(() => fetchDocs(undefined, true), 3000);
    return () => intervalId && clearInterval(intervalId);
  }, [docs]);

  useEffect(() => {
    if (selectedDoc) {
      const latest = docs.find(d => d.id === selectedDoc.id);
      if (latest && JSON.stringify(latest) !== JSON.stringify(selectedDoc)) setSelectedDoc(latest);
    }
  }, [docs, selectedDoc]);

  // --- Effect: Sidebar Resizing ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      e.preventDefault(); // ドラッグ時の不要なテキスト選択やドラッグイベントを防止
      const newWidth = Math.max(200, Math.min(1200, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const fetchDocs = async (configs?: SortConfig[], silent: boolean = false) => {
    if (!silent) {
      setIsLoadingDocs(true); 
      setFetchError(null);
    }
    
    try {
      const activeConfigs = configs || sortConfigs;
      const primary = activeConfigs.length > 0 ? activeConfigs[0] : null;
      const params = primary ? { sort_key: primary.key, sort_order: primary.order } : {};
      
      const res = await withTimeout(
        axios.get(`${API_URL}/api/documents?t=${Date.now()}`, { params }),
        12000,
        "サーバーからの応答がタイムアウトしました。"
      );
      
      setDocs(res.data);
      await fetchTags();
      
    } catch (e: any) {
      if (!silent) {
        if (e.message?.includes('タイムアウト') || e.message?.includes('timeout') || e.code === 'ECONNABORTED') {
          setFetchError("サーバーからの応答がタイムアウトしました。再読み込みしてください。");
        } else {
          setFetchError(`通信エラー: ${e.message || '詳細不明'}。バックエンドが起動しているか確認してください。`);
        }
      }
      console.error("fetchDocs error:", e);
    } finally {
      if (!silent) setIsLoadingDocs(false);
    }
  };

  const fetchTags = async () => {
    try {
      const [tagsRes, orgsRes] = await withTimeout(Promise.all([
        axios.get(`${API_URL}/api/tags?t=${Date.now()}`),
        axios.get(`${API_URL}/api/organizations?t=${Date.now()}`)
      ]), 10000, "Tags fetch timeout");
      setTags(tagsRes.data);
      setOrgs(orgsRes.data);
    } catch (e) { 
      console.error("fetchTags error:", e);
    }
  };

  const uploadFile = async (file: File) => {
    const allowed = [".pdf", ".docx", ".xlsx", ".txt", ".md"];
    if (!allowed.some(ext => file.name.toLowerCase().endsWith(ext))) {
      alert("対応していないファイル形式です。"); return;
    }
    setIsUploading(true);
    const formData = new FormData(); formData.append("file", file);
    try { await axios.post(`${API_URL}/api/upload`, formData); fetchDocs(); }
    catch (e) { alert("アップロードに失敗しました。"); }
    finally { setIsUploading(false); }
  };

  const handleSend = async () => {
    const messageContent = input.trim();
    if (!messageContent || isProcessingChat) return;
    setMessages(prev => [...prev, { role: "user", content: messageContent } as Message]);
    setInput(""); setIsProcessingChat(true);
    try {
      const res = await axios.post(`${API_URL}/api/chat`, { 
        message: messageContent, history: messages.map(m => ({ role: m.role, content: m.content }))
      });
      setMessages(prev => [...prev, { role: "assistant", content: res.data.answer, references: res.data.references }]);
    } catch (e: any) {
      const msg = e.response?.status === 429 ? "AI利用制限を超えました。1分お待ちください。" : "エラーが発生しました。";
      setMessages(prev => [...prev, { role: "assistant", content: msg }]);
    } finally { setIsProcessingChat(false); }
  };

  const deleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("削除してもよろしいですか？")) return;
    try {
      await axios.delete(`${API_URL}/api/documents/${id}`);
      setDocs(prev => prev.filter(d => d.id !== id));
      if (selectedDoc?.id === id) { setSelectedDoc(null); setShowDocPanel(false); }
    } catch (e) { alert("削除に失敗しました。"); }
  };

  const downloadAction = async (id: string, type: 'original' | 'md') => {
    const endpoint = type === 'original' ? `/api/documents/${id}/download` : `/api/documents/${id}/export-md`;
    try {
      const res = await axios.get(`${API_URL}${endpoint}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      let name = selectedDoc?.file_name || 'download';
      if (type === 'md' && selectedDoc) name = `${selectedDoc.file_name.replace(/\.[^/.]+$/, "")}_要約.md`;
      link.setAttribute('download', name);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (e) { alert("ダウンロードに失敗きました。"); }
  };

  const handleReextractTags = async (id: string) => {
    try {
      await axios.post(`${API_URL}/api/documents/${id}/reextract-tags`);
      
      // Update local state status to 'processing' to trigger loading/spinner UI
      setDocs(prev => prev.map(d => d.id === id ? { ...d, status: 'processing' } : d));
      if (selectedDoc?.id === id) {
        setSelectedDoc(prev => prev ? { ...prev, status: 'processing' } : null);
      }
    } catch (e) {
      alert("タグの再抽出要求に失敗しました。");
    }
  };

  const handleSort = (key: SortConfig["key"], label: string) => {
    setSortConfigs(prev => {
      const isFirst = prev.length > 0 && prev[0].key === key;
      if (isFirst) return [{ ...prev[0], order: prev[0].order === "asc" ? "desc" : "asc" }, ...prev.slice(1)];
      return [{ key, label, order: (key === "created_at" ? "desc" : "asc") }, ...prev.filter(c => c.key !== key)];
    });
  };

  return (
    <div className={`flex h-screen overflow-hidden bg-[#050510] text-gray-100 font-sans relative ${isResizing ? 'select-none' : ''}`}>
      <UploadZone isDragging={isDragging} />
      
      {/* Sidebar Area */}
      <aside 
        className="flex-shrink-0 flex flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl relative"
        style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '1200px' }}
      >
        <div onMouseDown={() => setIsResizing(true)} className="absolute -right-1 top-0 w-2 h-full cursor-col-resize hover:bg-indigo-500/30 z-50" />
        
        <div className="p-8 flex justify-center">
          <img src="/logo.png" alt="TANK" className="w-48 h-auto mix-blend-screen brightness-110" />
        </div>

        <div className="px-4 mb-4">
          <label className="flex items-center justify-center gap-2 w-full p-3 glass-panel hover:bg-white/10 cursor-pointer group">
            <Upload className="w-5 h-5 text-indigo-400 group-hover:scale-110" />
            <span className="text-sm font-medium">資料をアップロード</span>
            <input type="file" className="hidden" onChange={(e: any) => e.target.files?.[0] && uploadFile(e.target.files[0])} accept=".pdf,.docx,.xlsx,.txt,.md" />
          </label>
        </div>

        <DocumentLibrary 
          docs={docs} isLoading={isLoadingDocs} isMounted={isMounted} fetchError={fetchError}
          onRefresh={() => { fetchDocs(); fetchTags(); }}
          selectedDoc={selectedDoc} onSelectDoc={(d: Document) => { setSelectedDoc(d); setShowDocPanel(true); }}
          tags={tags} selectedTag={selectedTag} onSelectTag={(t: string) => setSelectedTag(t)}
          orgs={orgs} selectedOrg={selectedOrg} onSelectOrg={(o: string) => setSelectedOrg(o)}
          sortConfigs={sortConfigs} onSort={handleSort}
          columnOrder={columnOrder} setColumnOrder={setColumnOrder}
          setIsHeaderDragging={setIsHeaderDragging}
        />

        <div className="p-8 flex justify-start border-t border-white/5 mt-auto">
          <img src="/footlogo.png" alt="Foot Logo" className="w-full max-w-xs h-auto opacity-60 mix-blend-screen" />
        </div>
      </aside>

      <ChatPanel 
        messages={messages} input={input} setInput={setInput} onSend={handleSend}
        isProcessing={isProcessingChat} showDocPanel={showDocPanel} setShowDocPanel={setShowDocPanel}
        chatEndRef={chatEndRef}
      />

      {/* Right Panel: Doc Details (Drawer) */}
      <div className={`transition-all duration-300 ease-in-out border-l border-white/10 bg-black/40 backdrop-blur-xl ${showDocPanel ? 'w-[450px]' : 'w-0 overflow-hidden border-none'}`}>
        {selectedDoc ? (
          <DocumentDetails 
            doc={selectedDoc} onClose={() => setShowDocPanel(false)}
            onDelete={deleteDoc} onDownload={downloadAction}
            onReextractTags={handleReextractTags}
          />
        ) : (
          <div className="w-[450px] h-full flex items-center justify-center text-gray-600 text-sm italic">
            資料を選択すると詳細が表示されます
          </div>
        )}
      </div>

      {isUploading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="glass-panel p-8 flex flex-col items-center gap-4">
            <RefreshCw className="w-10 h-10 animate-spin text-gray-400" />
            <div className="font-bold text-white">ファイルをアップロード中...</div>
          </div>
        </div>
      )}
    </div>
  );
}
