"use client";

import * as React from "react";
import { Send, Paperclip, PanelRightOpen, PanelRightClose } from "lucide-react";
import { Message } from "../types";

interface ChatPanelProps {
  messages: Message[];
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  isProcessing: boolean;
  showDocPanel: boolean;
  setShowDocPanel: (show: boolean) => void;
  chatEndRef: any;
}

export const ChatPanel = ({
  messages,
  input,
  setInput,
  onSend,
  isProcessing,
  showDocPanel,
  setShowDocPanel,
  chatEndRef
}: ChatPanelProps) => {
  return (
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
          {showDocPanel ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
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
                アップロードされた資料の内容に基づき、<br/>AIが瞬時に関連情報を特定・回答します。
              </p>
            </div>
          </div>
        )}
        {messages.map((msg: Message, idx: number) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 ${msg.role === 'user' ? 'chat-bubble-user shadow-lg shadow-indigo-500/20' : 'chat-bubble-ai'}`}>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
              {msg.references && msg.references.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
                  {msg.references.map((ref: { document_id: string; file_name: string }, rIdx: number) => (
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
        {isProcessing && (
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
        <div className="relative max-w-4xl mx-auto group">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition-opacity"></div>
          <div className="relative flex items-center gap-4 bg-[#1a1a2e] border border-white/10 p-2 pl-6 rounded-2xl shadow-2xl focus-within:border-indigo-500/50 transition-all">
            <input
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && !e.nativeEvent.isComposing && onSend()}
              placeholder="資料について質問する..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-200 placeholder-gray-500 text-base"
              disabled={isProcessing}
            />
            <button
              onClick={onSend}
              disabled={!input.trim() || isProcessing}
              className={`p-3 rounded-xl transition-all ${!input.trim() || isProcessing ? 'bg-white/5 text-gray-600' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95'}`}
            >
              <Send className={`w-5 h-5 ${isProcessing ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
