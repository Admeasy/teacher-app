"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";

import { getActiveWorkspace, setActiveRole } from "@/lib/activeWorkspace";
import { sendOtp, verifyOtp } from "@/teacher/services/auth";
import { useTeacherSession } from "@/teacher/hooks/useTeacherSession";
import AdmeasyLogo from "@/components/ui/AdmeasyLogo";
import ThemeToggle from "@/components/ui/ThemeToggle";
import PageSeo from "@/components/seo/PageSeo";
import SelectedSchoolChip from "@/components/auth/SelectedSchoolChip";

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? "/teacher/dashboard";
  console.log(searchParams);
  console.log(searchParams?.get("next"));
  const ws = getActiveWorkspace();
  const { login, isAuthed } = useTeacherSession();

  const [step, setStep] = useState<1 | 2>(1);
  const [teacherId, setTeacherId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [masked, setMasked] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveRole("teacher");
    if (!ws) {
      router.replace(`/select-school?next=${encodeURIComponent("/login")}`);
    }
  }, [ws, router]);

  useEffect(() => {
    if (isAuthed) router.replace(next);
  }, [isAuthed, next, router]);

  if (!ws) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherId.trim() || !email.trim()) {
      toast.error("Enter both Teacher ID and Work Email");
      return;
    }
    setBusy(true);
    try {
      const res = await sendOtp(teacherId.trim(), email.trim());
      setMasked(res.masked_email);
      setStep(2);
      toast.success(`OTP sent to ${res.masked_email}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send OTP";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const session = await verifyOtp(teacherId.trim(), email.trim(), code.trim());
      login(session);
      toast.success(`Welcome, ${session.teacher.name ?? "Teacher"}`);
      router.replace(next);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid or expired code";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center p-6 bg-background relative overflow-y-auto">
      <PageSeo title="Teacher sign in — Admeasy" description="Secure OTP login for teachers." path="/login" />

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle compact />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md my-auto flex flex-col py-8"
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <AdmeasyLogo size={72} state="idle" />
          <div className="text-center">
            <div className="text-xl font-semibold text-foreground">Teacher Login</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-widest">
              Secure OTP access
            </div>
          </div>
        </div>

        <SelectedSchoolChip next="/login" className="mb-4" />

        <div className="glass-strong rounded-2xl p-6 md:p-8">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.form
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleSend}
                className="flex flex-col gap-4"
              >
                <Field
                  label="Teacher ID"
                  value={teacherId}
                  onChange={setTeacherId}
                  placeholder="e.g. TCH0123"
                  autoComplete="username"
                />
                <Field
                  label="Work Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@school.com"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 gradient-violet text-white text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:glow-violet-strong transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Send OTP <ArrowRight size={16} />
                    </>
                  )}
                </button>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Don&apos;t have an account? Ask your school admin to upload your details.
                </p>
              </motion.form>
            ) : (
              <motion.form
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerify}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck size={14} className="text-violet-glow shrink-0" />
                  Code sent to <span className="text-foreground font-medium">{masked}</span>
                </div>
                <Field
                  label="6-digit code"
                  value={code}
                  onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  autoComplete="one-time-code"
                  type="tel"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="gradient-violet text-white text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:glow-violet-strong transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Verify & continue <ArrowRight size={16} />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setCode("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 justify-center py-2"
                >
                  <ArrowLeft size={12} /> Use a different ID
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Spacer to ensure scrolling room above keyboard */}
      <div className="h-20 md:hidden shrink-0" />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="glass rounded-xl px-4 py-3 text-sm bg-transparent text-foreground focus:outline-none focus:ring-1 focus:ring-violet/50 transition-all placeholder:text-muted-foreground/60"
      />
    </label>
  );
}
