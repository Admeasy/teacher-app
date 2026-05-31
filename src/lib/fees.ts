// Shared fee-module helpers (frontend-only). Workspace_id is always passed in.
export const CLASS_OPTIONS = ["Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
export const BOARD_OPTIONS = ["CBSE", "State", "ICSE", "IB", "Other"];
export const CATEGORY_OPTIONS = ["General", "OBC", "SC", "ST", "EWS"];
export const FEE_TYPE_OPTIONS = ["annual", "tuition", "exam", "transport", "library", "sports", "custom"];
export const FREQUENCY_OPTIONS = ["monthly", "quarterly", "half_yearly", "yearly", "one_time"];
export const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "cheque", "dd", "online"];
export const PAYMENT_STATUSES = ["paid", "partial", "pending", "waived"];
export function paymentModeLabel(m: string) {
  const map: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer", cheque: "Cheque", dd: "DD", online: "Online" };
  return map[m] || m;
}
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function currentAcademicYear(): string {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 3
    ? `${y}-${String((y + 1) % 100).padStart(2, "0")}`
    : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

export function academicYearOptions(): string[] {
  const cur = currentAcademicYear();
  const [start] = cur.split("-").map(Number);
  return [0, -1, -2, 1].map((d) => {
    const s = start + d;
    return `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
  });
}

export function fmtINR(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}

export function generateReceiptNo(seq: number): string {
  const y = new Date().getFullYear();
  return `REC-${y}-${String(seq).padStart(4, "0")}`;
}

export function feeStatusBadgeClass(status: string) {
  switch ((status || "").toLowerCase()) {
    case "paid": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "partial": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "waived": return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    case "unpaid":
    case "pending":
    default: return "bg-rose-500/15 text-rose-400 border-rose-500/30";
  }
}
