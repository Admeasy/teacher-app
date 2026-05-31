
-- Transport registrations (onboarding) + transport fee invoices (linked to fee_payments)

CREATE TABLE public.transport_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.transport_routes(id) ON DELETE SET NULL,
  stop_id uuid REFERENCES public.transport_route_stops(id) ON DELETE SET NULL,
  pickup_type text NOT NULL DEFAULT 'both' CHECK (pickup_type IN ('pickup','drop','both')),
  fee_plan text NOT NULL DEFAULT 'monthly' CHECK (fee_plan IN ('monthly','quarterly','yearly')),
  fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  admission_fee numeric(10,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_treg_ws_student ON public.transport_registrations(workspace_id, student_id);
CREATE INDEX idx_treg_status ON public.transport_registrations(workspace_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_registrations TO authenticated;
GRANT ALL ON public.transport_registrations TO service_role;

ALTER TABLE public.transport_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read treg" ON public.transport_registrations FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws members write treg" ON public.transport_registrations FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws members update treg" ON public.transport_registrations FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws members delete treg" ON public.transport_registrations FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE TRIGGER trg_treg_updated BEFORE UPDATE ON public.transport_registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE public.transport_fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  registration_id uuid NOT NULL REFERENCES public.transport_registrations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'recurring' CHECK (kind IN ('recurring','admission')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','waived','cancelled')),
  fee_payment_id uuid REFERENCES public.fee_payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tfi_ws_student ON public.transport_fee_invoices(workspace_id, student_id);
CREATE INDEX idx_tfi_reg ON public.transport_fee_invoices(registration_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_fee_invoices TO authenticated;
GRANT ALL ON public.transport_fee_invoices TO service_role;

ALTER TABLE public.transport_fee_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read tfi" ON public.transport_fee_invoices FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws members write tfi" ON public.transport_fee_invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws members update tfi" ON public.transport_fee_invoices FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws members delete tfi" ON public.transport_fee_invoices FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE TRIGGER trg_tfi_updated BEFORE UPDATE ON public.transport_fee_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
