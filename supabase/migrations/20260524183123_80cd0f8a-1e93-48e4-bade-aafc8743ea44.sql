-- ── Drop legacy rule-based modules ─────────────────────────
DROP TABLE IF EXISTS public.mentor_matches CASCADE;
DROP TABLE IF EXISTS public.mentors CASCADE;
DROP TABLE IF EXISTS public.fee_reminders CASCADE;
DROP TABLE IF EXISTS public.attendance_alerts CASCADE;

-- ── Enrich command_history for AI observability ────────────
ALTER TABLE public.command_history
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS command_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rag_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS response text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_suggestion text,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success';

-- Allow super_admin to read all command_history rows (cross-workspace observability)
DROP POLICY IF EXISTS "super admins read all command_history" ON public.command_history;
CREATE POLICY "super admins read all command_history"
ON public.command_history
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Same for execution_logs
DROP POLICY IF EXISTS "super admins read all execution_logs" ON public.execution_logs;
CREATE POLICY "super admins read all execution_logs"
ON public.execution_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_command_history_created_at ON public.command_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_history_workspace ON public.command_history (workspace_id, created_at DESC);
