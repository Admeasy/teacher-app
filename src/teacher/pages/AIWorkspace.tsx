"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Sparkles,
  Loader2,
  Trash2,
  BookOpen,
  Brain,
  Activity,
  MessageCircle,
} from "lucide-react";

import { useSearchParams } from "next/navigation";

import { toast } from "sonner";

import { useTeacherStore } from "../store/teacherStore";
import { useTeacherSession } from "../hooks/useTeacherSession";
import { chat } from "../services/ai";

import type { TeacherAiMode } from "../types";

const MODES: { id: TeacherAiMode; label: string; icon: any; suggest: string[] }[] = [
  { id: "lesson",    label: "Lesson Planner",    icon: Brain,         suggest: ["Weekly plan for Class 10 Physics", "Chapter breakdown: Photosynthesis", "30-day revision calendar"] },
  { id: "questions", label: "Questions",         icon: BookOpen,      suggest: ["10 MCQs on trigonometry, mixed difficulty", "Subjective worksheet on French Revolution", "PYQs: Class 12 Chemistry 2022-2024"] },
  { id: "insights",  label: "Insights",          icon: Activity,      suggest: ["Identify weak students in Class 9-A", "Attendance trends last 30 days", "Average score by chapter"] },
  { id: "chat",      label: "Assistant",         icon: MessageCircle, suggest: ["Draft a parent meeting note", "How to handle a disruptive student?", "Suggest classroom activities for algebra"] },
];

export default function AIWorkspace() {

  const { teacher } = useTeacherSession();
  const { messages, mode, setMode, pushMessage, appendToLast, clearChat } = useTeacherStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const params = useSearchParams();

  useEffect(() => {
    const m = params.get("mode") as TeacherAiMode | null;
    if (m && MODES.some((x) => x.id === m)) setMode(m);
  }, [params, setMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function submit(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    pushMessage({ id: Date.now().toString() + Math.random().toString(36), role: "user", content: text, mode, createdAt: Date.now() });
    pushMessage({ id: Date.now().toString() + Math.random().toString(36), role: "assistant", content: "", mode, createdAt: Date.now() });

    try {
      const reply = await chat(mode, text, teacher);
      const chunks = reply.match(/.{1,40}/g) || [reply];
      for (const c of chunks) {
        appendToLast(c);
        await new Promise((r) => setTimeout(r, 14));
      }
    } catch (e: any) {
      appendToLast(`\n\n_Error: ${e.message}_`);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const current = MODES.find((m) => m.id === mode)!;

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
      <div className="p-3 md:p-4 border-b border-border/40 flex items-center gap-2 overflow-x-auto">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              mode === m.id ? "gradient-violet text-white glow-violet" : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            <m.icon size={13} /> {m.label}
          </button>
        ))}
        <button onClick={clearChat} title="Clear chat" className="ml-auto p-2 rounded-lg text-muted-foreground hover:text-danger transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        {messages.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-12">
            <div className="w-14 h-14 rounded-2xl gradient-violet grid place-items-center glow-violet">
              <Sparkles size={24} className="text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold">{current.label}</div>
              <div className="text-sm text-muted-foreground mt-1">Pick a prompt or write your own.</div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-xl mt-2">
              {current.suggest.map((s) => (
                <button key={s} onClick={() => submit(s)} className="glass rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:glow-violet transition-all">
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "gradient-violet text-white" : "glass text-foreground"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-surface-2 prose-pre:text-foreground">
                      <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="p-3 md:p-4 border-t border-border/40">
        <div className="glass rounded-2xl flex items-center gap-2 px-3 py-2">
          <Sparkles size={16} className="text-violet-glow shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder={`Ask in ${current.label}…`}
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
          />
          <button onClick={() => submit()} disabled={busy || !input.trim()} className="p-2 rounded-lg gradient-violet text-white disabled:opacity-30 transition-all hover:glow-violet-strong">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
