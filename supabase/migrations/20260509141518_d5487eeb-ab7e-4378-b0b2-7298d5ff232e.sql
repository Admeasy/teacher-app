CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = auth.uid()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.bump_conversation_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(text) TO authenticated, service_role;