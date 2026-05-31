import { Sparkles } from "lucide-react";

export default function RoutePlaceholder({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="max-w-md w-full text-center flex flex-col gap-4 p-8 rounded-2xl border border-border/40 glass">
        <div className="mx-auto w-12 h-12 rounded-full bg-violet/10 grid place-items-center text-violet-glow">
          <Sparkles size={20} />
        </div>
        <div className="text-xl font-semibold text-foreground tracking-tight">{title}</div>
        <div className="text-sm text-muted-foreground">
          {hint ?? "This module is on the roadmap. The navigation is in place — the experience ships soon."}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Coming soon</div>
      </div>
    </div>
  );
}
