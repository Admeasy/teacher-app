
-- 1) Lock down OAuth tokens: revoke column SELECT from client roles.
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM anon, authenticated;

-- Re-grant SELECT on the safe columns so existing client queries keep working.
GRANT SELECT (id, workspace_id, type, metadata, connected_at) ON public.integrations TO anon, authenticated;

-- Also restrict INSERT/UPDATE of token columns to service_role only.
REVOKE INSERT (access_token, refresh_token), UPDATE (access_token, refresh_token) ON public.integrations FROM anon, authenticated;
GRANT INSERT (id, workspace_id, type, metadata, connected_at), UPDATE (workspace_id, type, metadata, connected_at) ON public.integrations TO anon, authenticated;

-- 2) Add DELETE policy on import_batches
CREATE POLICY "ws delete" ON public.import_batches
  FOR DELETE USING (is_workspace_member(workspace_id));

-- 3) Add UPDATE policy on voice_command_history
CREATE POLICY "ws update" ON public.voice_command_history
  FOR UPDATE USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));
