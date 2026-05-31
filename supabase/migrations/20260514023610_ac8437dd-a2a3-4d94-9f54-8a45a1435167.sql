-- Restrict OAuth/API tokens to service role only.
-- Frontend can still read non-secret columns (id, workspace_id, type, metadata, connected_at).
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM anon, authenticated;