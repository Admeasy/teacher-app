-- Make teacher_id nullable + add staff_id for non-teaching salary payments
ALTER TABLE public.salary_payments ALTER COLUMN teacher_id DROP NOT NULL;
ALTER TABLE public.salary_payments ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.non_teaching_staff(id) ON DELETE CASCADE;

-- Drop old strict unique that assumed teacher_id always present
ALTER TABLE public.salary_payments DROP CONSTRAINT IF EXISTS salary_payments_workspace_id_teacher_id_month_year_key;

-- Add expression-based unique covering both staff types
CREATE UNIQUE INDEX IF NOT EXISTS salary_payments_unique_staff_month
  ON public.salary_payments (workspace_id, month_year, COALESCE(teacher_id, staff_id));

-- Exactly one of teacher_id or staff_id must be set
ALTER TABLE public.salary_payments DROP CONSTRAINT IF EXISTS salary_payments_one_subject_chk;
ALTER TABLE public.salary_payments ADD CONSTRAINT salary_payments_one_subject_chk
  CHECK ((teacher_id IS NOT NULL) <> (staff_id IS NOT NULL));

-- Helpful index for non-teaching lookups
CREATE INDEX IF NOT EXISTS idx_salary_payments_staff_id
  ON public.salary_payments (workspace_id, staff_id, month_year)
  WHERE staff_id IS NOT NULL;