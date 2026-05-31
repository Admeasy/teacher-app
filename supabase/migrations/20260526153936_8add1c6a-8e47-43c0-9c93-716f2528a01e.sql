
-- 1. Extend salary tables for non-teaching staff
ALTER TABLE public.salary_structures
  ADD COLUMN IF NOT EXISTS staff_type text NOT NULL DEFAULT 'teacher';
ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS staff_type text NOT NULL DEFAULT 'teacher';

CREATE INDEX IF NOT EXISTS idx_salary_structures_staff
  ON public.salary_structures(workspace_id, staff_type, teacher_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_staff
  ON public.salary_payments(workspace_id, staff_type, teacher_id, month_year);

-- 2. Staff attendance (teachers + non-teaching)
CREATE TABLE IF NOT EXISTS public.staff_attendance_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  staff_id uuid NOT NULL,
  staff_type text NOT NULL,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'present',
  source text DEFAULT 'manual',
  leave_request_id uuid,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance_days TO anon;
GRANT ALL ON public.staff_attendance_days TO service_role;

ALTER TABLE public.staff_attendance_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read staff_att" ON public.staff_attendance_days
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert staff_att" ON public.staff_attendance_days
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update staff_att" ON public.staff_attendance_days
  FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete staff_att" ON public.staff_attendance_days
  FOR DELETE USING (is_workspace_member(workspace_id));

CREATE INDEX IF NOT EXISTS idx_staff_att_ws_date
  ON public.staff_attendance_days(workspace_id, date);

-- 3. Backfill non_teaching_staff columns
UPDATE public.non_teaching_staff
  SET joining_date = join_date
  WHERE joining_date IS NULL AND join_date IS NOT NULL;

UPDATE public.non_teaching_staff
  SET department_tag = lower(trim(department_tag))
  WHERE department_tag IS NOT NULL
    AND department_tag <> lower(trim(department_tag));

-- 4. Auto-mirror transport_fee_invoices into fee_payments
CREATE OR REPLACE FUNCTION public.mirror_transport_invoice_to_fee_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_fee_payment_id uuid;
BEGIN
  SELECT id, class, section INTO v_student
  FROM public.students
  WHERE id = NEW.student_id
  LIMIT 1;

  IF v_student.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.fee_payments (
    workspace_id, student_id, fee_type, fee_name, class,
    amount_due, amount_paid, status, academic_year,
    month_year, remarks, is_manual_entry, created_at
  ) VALUES (
    NEW.workspace_id, NEW.student_id, 'Transport',
    COALESCE(NEW.label, 'Transport Fee'),
    COALESCE(v_student.class, ''),
    COALESCE(NEW.amount, 0), 0,
    COALESCE(NEW.status, 'pending'),
    COALESCE(NEW.academic_year, to_char(now(), 'YYYY')),
    CASE
      WHEN NEW.period_month IS NOT NULL AND NEW.period_year IS NOT NULL
        THEN to_char(make_date(NEW.period_year, NEW.period_month, 1), 'YYYY-MM')
      ELSE to_char(now(), 'YYYY-MM')
    END,
    'Auto-mirrored from transport invoice ' || NEW.id::text,
    false, now()
  )
  RETURNING id INTO v_fee_payment_id;

  BEGIN
    UPDATE public.transport_fee_invoices
      SET fee_payment_id = v_fee_payment_id
      WHERE id = NEW.id;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_transport_invoice ON public.transport_fee_invoices;
CREATE TRIGGER trg_mirror_transport_invoice
  AFTER INSERT ON public.transport_fee_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_transport_invoice_to_fee_payment();
