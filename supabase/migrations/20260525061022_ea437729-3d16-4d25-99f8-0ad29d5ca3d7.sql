-- 1) Remove broad authenticated read on global RAG tables. Super admins keep full access via existing ALL policy.
DROP POLICY IF EXISTS "authenticated read global chunks" ON public.global_rag_chunks;
DROP POLICY IF EXISTS "authenticated read global sources" ON public.global_rag_sources;

-- 2) Restrict Realtime channel subscriptions to workspace members.
-- Channel topic convention: 'ws:<workspace_id>:...' OR exactly the workspace_id.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can subscribe to their channels" ON realtime.messages;
CREATE POLICY "workspace members can subscribe to their channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_workspace_member(
    split_part(realtime.topic(), ':', 1)
  )
  OR public.is_workspace_member(
    split_part(realtime.topic(), ':', 2)
  )
);

DROP POLICY IF EXISTS "workspace members can broadcast to their channels" ON realtime.messages;
CREATE POLICY "workspace members can broadcast to their channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_workspace_member(
    split_part(realtime.topic(), ':', 1)
  )
  OR public.is_workspace_member(
    split_part(realtime.topic(), ':', 2)
  )
);
