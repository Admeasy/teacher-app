CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = auth.uid()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(text) TO authenticated, service_role;