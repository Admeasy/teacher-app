CREATE OR REPLACE FUNCTION public.ensure_workspace_membership(_workspace_id text, _workspace_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _workspace_id IS NULL OR length(trim(_workspace_id)) = 0 THEN
    RAISE EXCEPTION 'Missing workspace id';
  END IF;

  INSERT INTO public.workspaces (id, name)
  VALUES (_workspace_id, COALESCE(NULLIF(trim(_workspace_name), ''), _workspace_id))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_members (workspace_id, user_id)
  VALUES (_workspace_id, _uid)
  ON CONFLICT (user_id, workspace_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_workspace_membership(text, text) TO authenticated;