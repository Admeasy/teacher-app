ALTER TABLE public.timetable_settings
  ADD COLUMN IF NOT EXISTS school_level text NOT NULL DEFAULT 'All';