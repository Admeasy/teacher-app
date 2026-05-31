import { useEffect, useState } from "react";
import Link from "next/link";
import { School, ChevronRight } from "lucide-react";
import { getActiveWorkspace, type ActiveWorkspace } from "@/lib/activeWorkspace";

interface Props {
  next?: string;
  className?: string;
}

export default function SelectedSchoolChip({ next, className = "" }: Props) {
  const [ws, setWs] = useState<ActiveWorkspace | null>(null);
  useEffect(() => { setWs(getActiveWorkspace()); }, []);
  if (!ws) return null;
  const changeHref = next ? `/select-school?next=${encodeURIComponent(next)}` : "/select-school";
  return (
    <div className={`glass rounded-xl px-3 py-2 flex items-center gap-2.5 text-xs ${className}`}>
      <div className="w-7 h-7 rounded-md bg-muted/60 grid place-items-center text-muted-foreground shrink-0">
        {ws.logo_url ? (
          <img src={ws.logo_url} alt="" className="w-full h-full rounded-md object-cover" />
        ) : (
          <School size={14} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Signing in to</div>
        <div className="text-foreground font-medium truncate">{ws.name}</div>
      </div>
      <Link
        href={changeHref}
        className="text-violet-glow hover:text-foreground flex items-center gap-0.5 shrink-0"
      >
        Change <ChevronRight size={12} />
      </Link>
    </div>
  );
}
