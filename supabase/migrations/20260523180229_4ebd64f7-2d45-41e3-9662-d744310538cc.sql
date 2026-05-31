
-- Student account: 1 per student row, holds optional password + settings
CREATE TABLE public.student_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  password_hash TEXT,
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_accounts_workspace ON public.student_accounts(workspace_id);

ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated. Service role bypasses RLS.

CREATE TRIGGER trg_student_accounts_updated_at
  BEFORE UPDATE ON public.student_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- OTP codes
CREATE TABLE public.student_otps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_otps_student ON public.student_otps(student_id, created_at DESC);
CREATE INDEX idx_student_otps_active ON public.student_otps(student_id) WHERE consumed_at IS NULL;

ALTER TABLE public.student_otps ENABLE ROW LEVEL SECURITY;
-- No policies = service role only.
