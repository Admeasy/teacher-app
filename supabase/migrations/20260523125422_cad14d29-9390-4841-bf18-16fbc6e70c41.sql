
CREATE TABLE IF NOT EXISTS public.workspace_rag_sync_queue (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  op text NOT NULL DEFAULT 'upsert',
  payload jsonb,
  attempts int NOT NULL DEFAULT 0,
  error text,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_rag_sync_queue_pending_uniq
  ON public.workspace_rag_sync_queue (workspace_id, entity_type, entity_key)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS workspace_rag_sync_queue_pending_idx
  ON public.workspace_rag_sync_queue (enqueued_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.workspace_rag_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws read own queue" ON public.workspace_rag_sync_queue;
CREATE POLICY "ws read own queue"
  ON public.workspace_rag_sync_queue
  FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE OR REPLACE FUNCTION public.enqueue_rag_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace text;
  v_entity_type text := TG_ARGV[0];
  v_key text;
  v_op text;
  v_rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_rec := OLD; v_op := 'delete';
  ELSE
    v_rec := NEW; v_op := 'upsert';
  END IF;

  v_workspace := (row_to_json(v_rec)->>'workspace_id');
  IF v_workspace IS NULL THEN RETURN v_rec; END IF;

  IF v_entity_type IN ('students','teachers','attendance_alerts','fee_reminders') THEN
    v_key := COALESCE(row_to_json(v_rec)->>'id', '');
  ELSE
    v_key := 'snapshot:' || v_entity_type;
  END IF;

  INSERT INTO public.workspace_rag_sync_queue (workspace_id, entity_type, entity_key, op)
  VALUES (v_workspace, v_entity_type, v_key, v_op)
  ON CONFLICT (workspace_id, entity_type, entity_key) WHERE processed_at IS NULL DO NOTHING;

  RETURN v_rec;
END;
$$;

DO $$
DECLARE
  pair text[];
  pairs text[][] := ARRAY[
    ARRAY['students','students'],
    ARRAY['teachers','teachers'],
    ARRAY['timetable','timetable'],
    ARRAY['class_subjects','class_subjects'],
    ARRAY['timetable_settings','timetable_settings'],
    ARRAY['attendance_alerts','attendance_alerts'],
    ARRAY['fee_reminders','fee_reminders']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(pairs,1) LOOP
    pair := pairs[i:i][1:2];
    EXECUTE format('DROP TRIGGER IF EXISTS trg_rag_enqueue_%I ON public.%I', pairs[i][1], pairs[i][1]);
    EXECUTE format(
      'CREATE TRIGGER trg_rag_enqueue_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enqueue_rag_sync(%L)',
      pairs[i][1], pairs[i][1], pairs[i][2]
    );
  END LOOP;
END $$;

ALTER TABLE public.global_rag_sources
  ADD COLUMN IF NOT EXISTS detection_payload jsonb,
  ADD COLUMN IF NOT EXISTS review_status text;

CREATE INDEX IF NOT EXISTS global_rag_sources_review_idx
  ON public.global_rag_sources (review_status)
  WHERE review_status IS NOT NULL;
