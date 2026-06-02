"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Search, School, Loader2, ArrowRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import AdmeasyLogo from "@/components/ui/AdmeasyLogo";
import ThemeToggle from "@/components/ui/ThemeToggle";
import PageSeo from "@/components/seo/PageSeo";
import {
  getActiveWorkspace,
  setActiveWorkspace,
  setActiveRole,
  type ActiveWorkspace,
} from "@/lib/activeWorkspace";

export default function SelectSchool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") || "/login";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ActiveWorkspace[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const current = useMemo(() => getActiveWorkspace(), []);

  useEffect(() => {
    setActiveRole("teacher");
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancel = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("school-search", {
          body: { q },
        });
        if (cancel) return;
        if (error) throw error;
        setResults(Array.isArray(data?.results) ? data.results : []);
      } catch {
        if (!cancel) setResults([]);
      } finally {
        if (!cancel) {
          setBusy(false);
          setTouched(true);
        }
      }
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [query]);

  function pick(ws: ActiveWorkspace) {
    setActiveWorkspace(ws);
    setActiveRole("teacher");
    const target = next.startsWith("/") ? next : "/login";
    router.replace(target);
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background relative overflow-y-auto">
      <PageSeo
        title="Find Your School — Admeasy"
        description="Pick your school to log into Admeasy Teacher."
        path="/select-school"
      />
      <div className="absolute top-4 right-4 z-20 pb-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)]">
        <ThemeToggle compact />
      </div>

      <div className="max-w-xl mx-auto px-6 pt-16 pb-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center gap-3"
        >
          <AdmeasyLogo size={72} state="idle" />
          <h1 className="text-2xl font-semibold mt-2">Find your school</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            Search by school name or code. We&apos;ll remember your choice so you only do this once.
          </p>
        </motion.div>

        <div className="mt-6 glass-strong rounded-2xl p-2 flex items-center gap-2">
          <Search size={16} className="ml-3 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. ADM001 or Delhi Public School"
            className="flex-1 bg-transparent px-2 py-3 text-sm focus:outline-none placeholder:text-muted-foreground/60"
          />
          {busy && <Loader2 size={16} className="mr-3 animate-spin text-muted-foreground shrink-0" />}
        </div>

        <div className="mt-4 space-y-2">
          {results.map((ws) => (
            <motion.button
              key={ws.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => pick(ws)}
              className="w-full glass hover:glass-strong rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all hover:glow-violet group"
            >
              <div className="w-10 h-10 rounded-lg gradient-violet grid place-items-center flex-shrink-0 overflow-hidden">
                {ws.logo_url ? (
                  <img src={ws.logo_url} alt="" className="w-full h-full rounded-lg object-cover" />
                ) : (
                  <School size={18} className="text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{ws.name}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider truncate">
                  {ws.code || ws.slug || ws.id}
                </div>
              </div>
              <ArrowRight
                size={16}
                className="text-muted-foreground group-hover:text-violet-glow transition-colors shrink-0"
              />
            </motion.button>
          ))}

          {touched && !busy && query.trim().length >= 2 && results.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">
              No schools matched. Try a different name or code.
            </div>
          )}

          {!query && current && (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 mb-2">
                Recently used
              </div>
              <button
                type="button"
                onClick={() => pick(current)}
                className="w-full glass hover:glass-strong rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all"
              >
                <div className="w-10 h-10 rounded-lg gradient-violet grid place-items-center">
                  <School size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{current.name}</div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                    {current.code || current.slug || current.id}
                  </div>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-10">
          School not listed? Ask your school admin to onboard with Admeasy.
        </p>
      </div>
    </div>
  );
}
