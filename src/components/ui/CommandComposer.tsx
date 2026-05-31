import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Sparkles } from "lucide-react";

interface CommandComposerProps {
  onSubmit: (command: string) => void;
  busy?: boolean;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}

export default function CommandComposer({ onSubmit, busy, suggestions = [], placeholder = "Ask anything about your school...", className = "" }: CommandComposerProps) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const showSuggestions = focused && !input.trim() && suggestions.length > 0 && !busy;

  function submit(cmd?: string) {
    const command = (cmd ?? input).trim();
    if (!command || busy) return;
    setInput("");
    onSubmit(command);
  }

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const r = new SR();
    r.lang = "en-IN"; r.interimResults = false;
    r.onresult = (e: any) => { setInput(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r; r.start(); setListening(true);
  }

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-full left-0 right-0 mb-2 flex flex-wrap gap-1.5 px-1"
          >
            {suggestions.map(s => (
              <motion.button key={s} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => submit(s)}
                className="text-[11px] text-muted-foreground hover:text-foreground 
                  glass rounded-lg px-3 py-2 transition-all duration-200
                  hover:border-violet/30 hover:glow-violet
                  flex items-center gap-1.5">
                <Sparkles size={10} className="text-violet-glow opacity-60" />
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`relative flex items-center gap-2 glass rounded-xl px-4 py-2.5 transition-all duration-300 ${
        focused ? "glow-violet border-violet/30" : ""
      }`}>
        <Sparkles size={16} className="text-violet-glow shrink-0 opacity-60" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <button onClick={toggleMic}
          className={`p-1.5 rounded-lg transition-all ${
            listening ? "bg-danger/20 text-danger" : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
          }`}>
          {listening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button onClick={() => submit()} disabled={busy || !input.trim()}
          className="p-2 rounded-lg gradient-violet text-white disabled:opacity-30 transition-all hover:glow-violet-strong active:scale-95">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
