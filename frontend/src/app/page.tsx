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
  CheckCircle2,
  Loader2,
  Trash2
} from "lucide-react";
import axios from "axios";

// --- Types ---
interface Document {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
  customer_name?: string;
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
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const API_URL = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) || "http://localhost:8000";

  // --- Effects ---
  useEffect(() => {
    fetchDocs();
    const API_URL_SAFE = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_API_URL || "http://localhost:8000" : "http://localhost:8000";
    axios.post(`${API_URL_SAFE}/api/setup-demo`).catch((e: any) => console.error("Setup error", e));

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current!++;
      if (dragCounter.current! > 0) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current!--;
      if (dragCounter.current! <= 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const isProcessing = docs.some(doc => doc.status === 'processing' || doc.status === 'uploaded');
    if (isProcessing) {
      const interval = setInterval(() => {
        fetchDocs();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [docs]);

  // --- Actions ---
  const fetchDocs = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/documents`);
      setDocs(res.data as Document[]);
    } catch (e: any) {
      console.error("Fetch docs error", e);
    }
  };

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
      <aside className="w-80 flex-shrink-0 flex flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="p-6">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            TANK
          </h1>
        </div>

        <div className="px-4 mb-4">
          <label className="flex items-center justify-center gap-2 w-full p-3 glass-panel hover:bg-white/10 transition-all cursor-pointer group">
            <Upload className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">資料をアップロード</span>
            <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.docx,.xlsx,.txt,.md" />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            資料ライブラリ
          </div>
          {docs.map((doc: Document) => (
            <div
              key={doc.id}
              onClick={() => { setSelectedDoc(doc); setShowDocPanel(true); }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all hover:bg-white/5 group ${selectedDoc?.id === doc.id ? 'bg-white/10 border-l-2 border-indigo-500' : ''} cursor-pointer`}
            >
              <FileText className={`w-5 h-5 flex-shrink-0 ${doc.status === 'completed' ? 'text-green-400' : 'text-gray-500'}`} />
              <div className="flex-1 truncate">
                <div className="text-sm font-medium truncate">{doc.file_name}</div>
                <div className="text-[10px] text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2">
                {doc.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                <button 
                  onClick={(e: React.MouseEvent) => deleteDoc(doc.id, e)}
                  className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-all"
                  title="削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
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
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
              <div className="w-16 h-16 rounded-3xl glass-panel flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold">どのようなお手伝いをしましょうか？</h2>
              <p className="max-w-md text-sm">アップロードした資料の内容について質問してください。<br/>AIが根拠付きで回答します。</p>
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
            AI responses may vary in accuracy. Please verify critical information.
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
                <div>
                  <div className="font-bold">{selectedDoc.file_name}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">Status: {selectedDoc.status}</div>
                </div>
              </div>
              
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">取引先名</div>
                  <div className="text-sm font-medium">{selectedDoc.customer_name || '未抽出'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">アップロード日時</div>
                  <div className="text-sm font-medium">{new Date(selectedDoc.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 glass-panel p-6 font-mono text-[11px] leading-relaxed overflow-y-auto">
              <div className="text-indigo-400 mb-2">// Markdown Preview (MVP Simplified)</div>
              {selectedDoc.status === 'completed' ? (
                <div className="text-gray-400">
                  チャンク化済み。チャット検索可能な状態です。<br/>
                  (詳細なMarkdownプレビューは次期アップデートで対応予定)
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  解析中...
                </div>
              )}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-panel p-8 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            <div className="font-bold">ファイルを処理中...</div>
          </div>
        </div>
      )}
    </div>
  );
}
