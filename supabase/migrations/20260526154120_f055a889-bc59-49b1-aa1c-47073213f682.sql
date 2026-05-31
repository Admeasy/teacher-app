
CREATE OR REPLACE FUNCTION public.mirror_transport_invoice_to_fee_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_fee_payment_id uuid;
  v_month text;
  v_academic_year text;
BEGIN
  SELECT id, class INTO v_student
  FROM public.students
  WHERE id = NEW.student_id
  LIMIT 1;

  IF v_student.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_month := to_char(COALESCE(NEW.period_start, CURRENT_DATE), 'YYYY-MM');
  v_academic_year := CASE
    WHEN extract(month from COALESCE(NEW.period_start, CURRENT_DATE)) >= 4
      THEN extract(year from COALESCE(NEW.period_start, CURRENT_DATE))::text
        || '-' || lpad(((extract(year from COALESCE(NEW.period_start, CURRENT_DATE))+1)::int % 100)::text, 2, '0')
    ELSE (extract(year from COALESCE(NEW.period_start, CURRENT_DATE))-1)::text
        || '-' || lpad((extract(year from COALESCE(NEW.period_start, CURRENT_DATE))::int % 100)::text, 2, '0')
  END;

  INSERT INTO public.fee_payments (
    workspace_id, student_id, fee_type, fee_name, class,
    amount_due, amount_paid, status, academic_year,
    month_year, remarks, is_manual_entry, created_at
  ) VALUES (
    NEW.workspace_id, NEW.student_id, 'Transport',
    COALESCE(NEW.period_label, 'Transport Fee'),
    COALESCE(v_student.class, ''),
    COALESCE(NEW.amount, 0),
    CASE WHEN COALESCE(NEW.status, 'pending') = 'paid' THEN COALESCE(NEW.amount, 0) ELSE 0 END,
    COALESCE(NEW.status, 'pending'),
    v_academic_year,
    v_month,
    'Auto-mirrored from transport invoice ' || NEW.id::text,
    false, now()
  )
  RETURNING id INTO v_fee_payment_id;

  UPDATE public.transport_fee_invoices
    SET fee_payment_id = v_fee_payment_id
    WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mirror_transport_invoice_to_fee_payment() FROM anon, authenticated, PUBLIC;
