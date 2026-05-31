CREATE TABLE IF NOT EXISTS public.teacher_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  teacher_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_otps_teacher_idx ON public.teacher_otps(teacher_id, created_at DESC);
ALTER TABLE public.teacher_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all to" ON public.teacher_otps FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.teacher_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL UNIQUE,
  workspace_id text NOT NULL,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all ta" ON public.teacher_accounts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);