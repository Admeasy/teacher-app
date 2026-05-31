
-- Extend existing non_teaching_staff with transport fields
ALTER TABLE public.non_teaching_staff
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'driver',
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS shift_start TIME,
  ADD COLUMN IF NOT EXISTS shift_end TIME,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_route_id UUID,
  ADD COLUMN IF NOT EXISTS license_number TEXT,
  ADD COLUMN IF NOT EXISTS license_expiry DATE,
  ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_photo TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_nts_workspace_role ON public.non_teaching_staff(workspace_id, role);

-- Vehicles
CREATE TABLE IF NOT EXISTS public.transport_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'bus',
  model TEXT,
  capacity INT NOT NULL DEFAULT 0,
  gps_enabled BOOLEAN NOT NULL DEFAULT false,
  gps_device_id TEXT,
  assigned_driver_id UUID REFERENCES public.non_teaching_staff(id) ON DELETE SET NULL,
  assigned_conductor_id UUID REFERENCES public.non_teaching_staff(id) ON DELETE SET NULL,
  route_id UUID,
  insurance_expiry DATE,
  pollution_expiry DATE,
  fitness_expiry DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, vehicle_number)
);
CREATE INDEX IF NOT EXISTS idx_tv_workspace ON public.transport_vehicles(workspace_id);

-- Routes
CREATE TABLE IF NOT EXISTS public.transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  route_name TEXT NOT NULL,
  route_code TEXT,
  start_location TEXT,
  end_location TEXT,
  estimated_duration_min INT,
  vehicle_id UUID REFERENCES public.transport_vehicles(id) ON DELETE SET NULL,
  transport_manager_id UUID REFERENCES public.non_teaching_staff(id) ON DELETE SET NULL,
  monthly_fee NUMERIC(10,2) DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tr_workspace ON public.transport_routes(workspace_id);

ALTER TABLE public.transport_vehicles
  DROP CONSTRAINT IF EXISTS fk_tv_route;
ALTER TABLE public.transport_vehicles
  ADD CONSTRAINT fk_tv_route FOREIGN KEY (route_id)
  REFERENCES public.transport_routes(id) ON DELETE SET NULL;

-- Route stops
CREATE TABLE IF NOT EXISTS public.transport_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  route_id UUID NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  stop_time TIME,
  drop_time TIME,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  stop_order INT NOT NULL DEFAULT 0,
  landmark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trs_route ON public.transport_route_stops(route_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_trs_workspace ON public.transport_route_stops(workspace_id);

-- Student transport assignments
CREATE TABLE IF NOT EXISTS public.transport_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  student_id UUID NOT NULL,
  route_id UUID REFERENCES public.transport_routes(id) ON DELETE SET NULL,
  stop_id UUID REFERENCES public.transport_route_stops(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.transport_vehicles(id) ON DELETE SET NULL,
  pickup_type TEXT NOT NULL DEFAULT 'both',
  drop_type  TEXT,
  monthly_transport_fee NUMERIC(10,2) DEFAULT 0,
  start_date DATE DEFAULT now(),
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ta_workspace ON public.transport_assignments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ta_student ON public.transport_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_ta_route ON public.transport_assignments(route_id);

-- Transport fees (monthly)
CREATE TABLE IF NOT EXISTS public.transport_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  assignment_id UUID NOT NULL REFERENCES public.transport_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  period_month INT NOT NULL,
  period_year INT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  reference_no TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_tf_workspace ON public.transport_fees(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tf_status ON public.transport_fees(workspace_id, status);

-- Transport attendance
CREATE TABLE IF NOT EXISTS public.transport_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  assignment_id UUID NOT NULL REFERENCES public.transport_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  vehicle_id UUID,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  boarded_at TIMESTAMPTZ,
  alighted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tat_workspace_date ON public.transport_attendance(workspace_id, date);

-- Vehicle tracking logs
CREATE TABLE IF NOT EXISTS public.vehicle_tracking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed_kmph NUMERIC(6,2),
  heading NUMERIC(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vtl_vehicle_time ON public.vehicle_tracking_logs(vehicle_id, recorded_at DESC);

-- Transport notifications
CREATE TABLE IF NOT EXISTS public.transport_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  route_id UUID REFERENCES public.transport_routes(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.transport_vehicles(id) ON DELETE SET NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  target_student_ids UUID[] DEFAULT '{}',
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
  email_sent BOOLEAN NOT NULL DEFAULT false,
  read_by JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tn_workspace ON public.transport_notifications(workspace_id, created_at DESC);

-- RLS
ALTER TABLE public.transport_vehicles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_routes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_route_stops    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_fees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_attendance     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_tracking_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_notifications  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transport_vehicles','transport_routes','transport_route_stops',
    'transport_assignments','transport_fees','transport_attendance',
    'vehicle_tracking_logs','transport_notifications'
  ]
  LOOP
    EXECUTE format($f$DROP POLICY IF EXISTS "members read %1$s"   ON public.%1$I$f$, t);
    EXECUTE format($f$DROP POLICY IF EXISTS "members insert %1$s" ON public.%1$I$f$, t);
    EXECUTE format($f$DROP POLICY IF EXISTS "members update %1$s" ON public.%1$I$f$, t);
    EXECUTE format($f$DROP POLICY IF EXISTS "members delete %1$s" ON public.%1$I$f$, t);
    EXECUTE format($f$CREATE POLICY "members read %1$s" ON public.%1$I FOR SELECT USING (public.is_workspace_member(workspace_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "members insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "members update %1$s" ON public.%1$I FOR UPDATE USING (public.is_workspace_member(workspace_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "members delete %1$s" ON public.%1$I FOR DELETE USING (public.is_workspace_member(workspace_id))$f$, t);
  END LOOP;
END $$;

-- Triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transport_vehicles','transport_routes','transport_route_stops',
    'transport_assignments','transport_fees'
  ]
  LOOP
    EXECUTE format($f$DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I$f$, t);
    EXECUTE format($f$CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()$f$, t);
  END LOOP;
END $$;
