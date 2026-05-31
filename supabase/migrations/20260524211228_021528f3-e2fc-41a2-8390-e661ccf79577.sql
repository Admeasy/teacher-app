
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  date DATE,
  recurring_weekday SMALLINT,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'school_holiday',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT holidays_date_or_weekday_chk CHECK (date IS NOT NULL OR recurring_weekday IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS holidays_ws_date_uniq ON public.holidays(workspace_id, date) WHERE date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_ws_weekday_uniq ON public.holidays(workspace_id, recurring_weekday) WHERE recurring_weekday IS NOT NULL;
CREATE INDEX IF NOT EXISTS holidays_ws_idx ON public.holidays(workspace_id);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read holidays" ON public.holidays FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert holidays" ON public.holidays FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update holidays" ON public.holidays FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete holidays" ON public.holidays FOR DELETE USING (is_workspace_member(workspace_id));

CREATE OR REPLACE FUNCTION public.touch_holidays_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_holidays_updated_at
BEFORE UPDATE ON public.holidays
FOR EACH ROW EXECUTE FUNCTION public.touch_holidays_updated_at();

INSERT INTO public.holidays (workspace_id, recurring_weekday, label, kind)
SELECT DISTINCT workspace_id, 0, 'Sunday', 'weekly_off' FROM public.students
WHERE workspace_id IS NOT NULL
ON CONFLICT DO NOTHING;
