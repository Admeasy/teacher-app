-- Async leave review email outbox (audit + idempotency)
CREATE TABLE IF NOT EXISTS public.leave_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id uuid NOT NULL,
  workspace_id text NOT NULL,
  recipient_email text NOT NULL,
  recipient_role text NOT NULL CHECK (recipient_role IN ('student', 'parent')),
  notification_status text NOT NULL CHECK (notification_status IN ('approved', 'rejected')),
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'queued', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  idempotency_key text NOT NULL UNIQUE,
  provider text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_leave_email_leave_id
  ON public.leave_email_notifications (leave_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_email_pending
  ON public.leave_email_notifications (delivery_status, created_at)
  WHERE delivery_status IN ('pending', 'queued', 'failed');

ALTER TABLE public.leave_email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny direct access leave_email_notifications"
  ON public.leave_email_notifications FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);
