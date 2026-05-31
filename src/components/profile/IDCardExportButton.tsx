import { useState } from "react";
import { Download, ChevronDown, IdCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { exportIdCardPdf, exportIdCardPng, type IDCardSubject } from "@/lib/idCard";

export default function IDCardExportButton({ subject }: { subject: IDCardSubject }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);

  async function go(fmt: "pdf" | "png") {
    setBusy(fmt);
    setOpen(false);
    try {
      if (fmt === "pdf") await exportIdCardPdf(subject);
      else await exportIdCardPng(subject);
      toast.success(`ID card exported as ${fmt.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!busy}
        className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-1.5 hover:text-foreground text-muted-foreground disabled:opacity-50"
      >
        <IdCard size={12} /> {busy ? `Exporting ${busy.toUpperCase()}…` : "Export ID card"}
        <ChevronDown size={12} className="opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-full mt-1 glass-strong rounded-lg overflow-hidden z-50 min-w-[160px]"
          >
            <button onClick={() => go("pdf")} className="w-full text-left px-3 py-2 text-xs hover:bg-violet/10 flex items-center gap-2">
              <Download size={12} /> PDF (print)
            </button>
            <button onClick={() => go("png")} className="w-full text-left px-3 py-2 text-xs hover:bg-violet/10 flex items-center gap-2">
              <Download size={12} /> PNG (front + back)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
