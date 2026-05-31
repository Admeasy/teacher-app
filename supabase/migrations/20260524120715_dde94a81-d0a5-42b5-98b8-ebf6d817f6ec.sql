
CREATE TABLE public.login_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('student','teacher')),
  user_id uuid,
  user_label text,
  login_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  device_hash text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed')),
  is_first_of_day boolean NOT NULL DEFAULT false,
  is_new_device boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lal_workspace_login_at ON public.login_activity_logs (workspace_id, login_at DESC);
CREATE INDEX idx_lal_user ON public.login_activity_logs (user_id, login_at DESC);
CREATE INDEX idx_lal_device ON public.login_activity_logs (user_id, device_hash, login_at DESC);

ALTER TABLE public.login_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read login activity"
  ON public.login_activity_logs FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "deny direct writes login activity"
  ON public.login_activity_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);
