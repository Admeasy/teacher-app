"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Banknote } from "lucide-react";
import { useTeacherSession } from "../hooks/useTeacherSession";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Structure {
  id: string;
  basic: number; hra: number; da: number; other_allowances: number;
  pf_deduction: number; esi_deduction: number; tds_deduction: number; other_deductions: number;
  gross_salary: number; net_salary: number;
  effective_from: string; academic_year: string;
}
interface Payment {
  id: string; month_year: string; amount_paid: number; payment_mode: string;
  transaction_id: string | null; payment_date: string; status: string;
}

function fmtINR(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}

export default function Salary() {
  const { teacher } = useTeacherSession();
  const [structure, setStructure] = useState<Structure | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacher?.id || !teacher.workspace_id) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from("salary_structures" as any).select("*")
          .eq("workspace_id", teacher.workspace_id).eq("teacher_id", teacher.id)
          .order("effective_from", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("salary_payments" as any).select("*")
          .eq("workspace_id", teacher.workspace_id).eq("teacher_id", teacher.id)
          .order("month_year", { ascending: false }),
      ]);
      if (cancel) return;
      setStructure((s as unknown as Structure) || null);
      setPayments(((p || []) as unknown) as Payment[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [teacher?.id, teacher?.workspace_id]);

  if (!teacher) return null;

  const earnings: Array<[string, number]> = structure
    ? [["Basic", structure.basic], ["HRA", structure.hra], ["DA", structure.da], ["Other Allowances", structure.other_allowances]]
    : [];
  const deductions: Array<[string, number]> = structure
    ? [["PF", structure.pf_deduction], ["ESI", structure.esi_deduction], ["TDS", structure.tds_deduction], ["Other", structure.other_deductions]]
    : [];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto flex flex-col gap-6 pb-24">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl gradient-violet grid place-items-center glow-violet">
          <Banknote className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">My Salary</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Your salary structure and disbursement history.</p>
        </div>
      </motion.div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : !structure ? (
        <Card className="p-8 text-center border-border/60 bg-card/40">
          <p className="text-muted-foreground">Your salary structure has not been set yet. Please contact admin.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5 border-border/60 bg-card/40 md:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Earnings</div>
                <ul className="space-y-1.5 text-sm">
                  {earnings.map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{fmtINR(v)}</span></li>
                  ))}
                  <li className="flex justify-between pt-2 border-t border-border/60 font-semibold"><span>Gross</span><span>{fmtINR(structure.gross_salary)}</span></li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Deductions</div>
                <ul className="space-y-1.5 text-sm">
                  {deductions.map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="text-rose-400/80">{fmtINR(v)}</span></li>
                  ))}
                  <li className="flex justify-between pt-2 border-t border-border/60 font-semibold"><span>Total Deductions</span><span className="text-rose-400/80">{fmtINR(structure.gross_salary - structure.net_salary)}</span></li>
                </ul>
              </div>
            </div>
          </Card>
          <Card className="p-5 border-border/60 bg-card/40 flex flex-col justify-center items-center text-center gradient-violet/10">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net Salary</div>
            <div className="text-3xl font-semibold mt-1 text-primary">{fmtINR(structure.net_salary)}</div>
            <div className="text-[10px] text-muted-foreground mt-3">Effective from {structure.effective_from}</div>
            <div className="text-[10px] text-muted-foreground">AY {structure.academic_year}</div>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2 uppercase tracking-widest text-muted-foreground">Payment History</h2>
        <Card className="overflow-hidden border-border/60 bg-card/40">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead><TableHead className="text-right">Amount</TableHead>
                  <TableHead>Mode</TableHead><TableHead>Transaction ID</TableHead>
                  <TableHead>Date</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : payments.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No payments recorded yet.</TableCell></TableRow>
                ) : payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.month_year}</TableCell>
                    <TableCell className="text-right font-medium">{fmtINR(p.amount_paid)}</TableCell>
                    <TableCell className="text-xs uppercase">{p.payment_mode}</TableCell>
                    <TableCell className="font-mono text-xs">{p.transaction_id || "—"}</TableCell>
                    <TableCell className="text-xs">{p.payment_date}</TableCell>
                    <TableCell>
                      {p.status === "paid"
                        ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Paid</Badge>
                        : <Badge variant="outline">{p.status}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
