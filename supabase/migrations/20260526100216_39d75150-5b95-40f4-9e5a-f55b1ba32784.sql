
-- Extend transport_attendance to support drivers/teachers/non-students
ALTER TABLE public.transport_attendance
  ALTER COLUMN student_id DROP NOT NULL,
  ALTER COLUMN assignment_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS person_type text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS teacher_id uuid,
  ADD COLUMN IF NOT EXISTS staff_id uuid,
  ADD COLUMN IF NOT EXISTS person_name text,
  ADD COLUMN IF NOT EXISTS route_id uuid,
  ADD COLUMN IF NOT EXISTS stop_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'board',
  ADD COLUMN IF NOT EXISTS logged_by uuid,
  ADD COLUMN IF NOT EXISTS logged_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_tat_person ON public.transport_attendance(workspace_id, person_type, date);
CREATE INDEX IF NOT EXISTS idx_tat_vehicle_date ON public.transport_attendance(vehicle_id, date);

-- Route clone function: duplicates route + stops, returns new route id
CREATE OR REPLACE FUNCTION public.clone_transport_route(_route_id uuid, _new_name text, _new_code text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
  v_ws text;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.transport_routes WHERE id = _route_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'route not found'; END IF;
  IF NOT public.is_workspace_member(v_ws) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.transport_routes
    (workspace_id, route_name, route_code, start_location, end_location,
     estimated_duration_min, vehicle_id, transport_manager_id, monthly_fee, active)
  SELECT workspace_id, _new_name, COALESCE(_new_code, route_code || '-COPY'),
         start_location, end_location, estimated_duration_min,
         NULL, transport_manager_id, monthly_fee, active
  FROM public.transport_routes WHERE id = _route_id
  RETURNING id INTO v_new_id;

  INSERT INTO public.transport_route_stops
    (workspace_id, route_id, stop_name, stop_time, drop_time, latitude, longitude, stop_order)
  SELECT workspace_id, v_new_id, stop_name, stop_time, drop_time, latitude, longitude, stop_order
  FROM public.transport_route_stops WHERE route_id = _route_id;

  RETURN v_new_id;
END;
$$;

-- Helper to set workspace setting key
CREATE OR REPLACE FUNCTION public.set_workspace_setting(_ws text, _key text, _value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(_ws) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.workspaces
     SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(_key, _value)
   WHERE id = _ws;
END;
$$;
