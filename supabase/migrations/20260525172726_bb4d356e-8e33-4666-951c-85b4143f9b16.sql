DROP POLICY IF EXISTS "workspace members can subscribe to their channels" ON realtime.messages;
DROP POLICY IF EXISTS "workspace members can broadcast to their channels" ON realtime.messages;

CREATE POLICY "workspace members can subscribe to their channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_workspace_member(split_part(realtime.topic(), ':', 1))
);

CREATE POLICY "workspace members can broadcast to their channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_workspace_member(split_part(realtime.topic(), ':', 1))
);