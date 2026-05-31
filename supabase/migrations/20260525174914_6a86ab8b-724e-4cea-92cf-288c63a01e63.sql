
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  requester_type text NOT NULL CHECK (requester_type IN ('student','teacher')),
  requester_id uuid NOT NULL,
  requester_name_snapshot text,
  class_snapshot text,
  roll_snapshot text,
  approver_type text NOT NULL CHECK (approver_type IN ('teacher','admin')),
  approver_id uuid,
  approver_name_snapshot text,
  leave_type text NOT NULL CHECK (leave_type IN ('sick','personal','emergency','family','other')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  total_days integer GENERATED ALWAYS AS ((to_date - from_date) + 1) STORED,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  response_message text,
  responded_at timestamptz,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_workspace_status_created ON public.leave_requests (workspace_id, status, created_at DESC);
CREATE INDEX idx_leave_requester ON public.leave_requests (requester_id, status);
CREATE INDEX idx_leave_approver ON public.leave_requests (approver_id, status);
CREATE INDEX idx_leave_workspace_type_status ON public.leave_requests (workspace_id, requester_type, status);

-- Date validation trigger (not CHECK constraint — must be immutable rules only)
CREATE OR REPLACE FUNCTION public.validate_leave_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.to_date < NEW.from_date THEN
    RAISE EXCEPTION 'to_date must be on or after from_date';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leave_validate
BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_leave_dates();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Deny direct anon/auth writes — student/teacher flows go through service-role edge functions
CREATE POLICY "ws read leaves"
  ON public.leave_requests FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "ws insert leaves"
  ON public.leave_requests FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "ws update leaves"
  ON public.leave_requests FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "ws delete leaves"
  ON public.leave_requests FOR DELETE
  USING (public.is_workspace_member(workspace_id));

-- Realtime
ALTER TABLE public.leave_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
