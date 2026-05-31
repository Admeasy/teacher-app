ALTER TABLE public.timetable RENAME COLUMN period TO period_number;
ALTER TABLE public.timetable RENAME CONSTRAINT timetable_workspace_id_class_section_day_period_key TO timetable_workspace_id_class_section_day_period_number_key;
NOTIFY pgrst, 'reload schema';