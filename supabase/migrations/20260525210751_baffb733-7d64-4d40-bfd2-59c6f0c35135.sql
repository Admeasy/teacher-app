
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.salary_structures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  basic numeric NOT NULL DEFAULT 0,
  hra numeric NOT NULL DEFAULT 0,
  da numeric NOT NULL DEFAULT 0,
  other_allowances numeric NOT NULL DEFAULT 0,
  pf_deduction numeric NOT NULL DEFAULT 0,
  esi_deduction numeric NOT NULL DEFAULT 0,
  tds_deduction numeric NOT NULL DEFAULT 0,
  other_deductions numeric NOT NULL DEFAULT 0,
  gross_salary numeric GENERATED ALWAYS AS (basic + hra + da + other_allowances) STORED,
  net_salary numeric GENERATED ALWAYS AS (basic + hra + da + other_allowances - pf_deduction - esi_deduction - tds_deduction - other_deductions) STORED,
  effective_from date NOT NULL,
  academic_year text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_salary_structures_ws_teacher ON public.salary_structures(workspace_id, teacher_id);
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read salary_structures" ON public.salary_structures FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert salary_structures" ON public.salary_structures FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update salary_structures" ON public.salary_structures FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete salary_structures" ON public.salary_structures FOR DELETE USING (is_workspace_member(workspace_id));
CREATE TRIGGER trg_salary_structures_updated BEFORE UPDATE ON public.salary_structures FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.salary_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  salary_structure_id uuid REFERENCES public.salary_structures(id) ON DELETE SET NULL,
  month_year text NOT NULL,
  amount_paid numeric NOT NULL,
  payment_mode text NOT NULL CHECK (payment_mode IN ('bank_transfer','cash','cheque','upi','neft','rtgs')),
  transaction_id text,
  payment_date date NOT NULL,
  paid_by text,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','pending','on_hold')),
  remarks text,
  is_advance boolean DEFAULT false,
  advance_month text,
  source text DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, teacher_id, month_year)
);
CREATE INDEX idx_salary_payments_ws_month ON public.salary_payments(workspace_id, month_year);
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read salary_payments" ON public.salary_payments FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert salary_payments" ON public.salary_payments FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update salary_payments" ON public.salary_payments FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete salary_payments" ON public.salary_payments FOR DELETE USING (is_workspace_member(workspace_id));
CREATE TRIGGER trg_salary_payments_updated BEFORE UPDATE ON public.salary_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.fee_structures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  class text NOT NULL,
  section text,
  board text NOT NULL DEFAULT 'CBSE' CHECK (board IN ('CBSE','State','ICSE','IB','Other')),
  category text NOT NULL DEFAULT 'General' CHECK (category IN ('General','OBC','SC','ST','EWS')),
  fee_type text NOT NULL CHECK (fee_type IN ('annual','tuition','exam','transport','library','sports','custom')),
  fee_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'yearly' CHECK (frequency IN ('monthly','quarterly','half_yearly','yearly','one_time')),
  academic_year text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fee_structures_ws_class ON public.fee_structures(workspace_id, class);
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read fee_structures" ON public.fee_structures FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert fee_structures" ON public.fee_structures FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update fee_structures" ON public.fee_structures FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete fee_structures" ON public.fee_structures FOR DELETE USING (is_workspace_member(workspace_id));
CREATE TRIGGER trg_fee_structures_updated BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.admission_fee_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  academic_year text NOT NULL,
  month_from integer NOT NULL,
  month_to integer NOT NULL,
  percentage numeric NOT NULL DEFAULT 100,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admission_fee_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read admission_fee_rules" ON public.admission_fee_rules FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert admission_fee_rules" ON public.admission_fee_rules FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update admission_fee_rules" ON public.admission_fee_rules FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete admission_fee_rules" ON public.admission_fee_rules FOR DELETE USING (is_workspace_member(workspace_id));

CREATE TABLE public.fee_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_structure_id uuid REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  fee_type text NOT NULL,
  fee_name text NOT NULL,
  class text NOT NULL,
  month_year text,
  academic_year text NOT NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance numeric GENERATED ALWAYS AS (amount_due - discount - amount_paid) STORED,
  payment_mode text CHECK (payment_mode IN ('cash','upi','bank_transfer','cheque','dd','online')),
  transaction_id text,
  receipt_no text,
  payment_date date,
  collected_by text,
  is_manual_entry boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','partial','pending','waived')),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fee_payments_ws_student ON public.fee_payments(workspace_id, student_id);
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read fee_payments" ON public.fee_payments FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert fee_payments" ON public.fee_payments FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update fee_payments" ON public.fee_payments FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete fee_payments" ON public.fee_payments FOR DELETE USING (is_workspace_member(workspace_id));
CREATE TRIGGER trg_fee_payments_updated BEFORE UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
