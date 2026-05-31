DROP FUNCTION IF EXISTS public.ensure_workspace_membership(text, text);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workspaces' AND policyname = 'users can create own derived workspace'
  ) THEN
    CREATE POLICY "users can create own derived workspace"
    ON public.workspaces
    FOR INSERT
    TO authenticated
    WITH CHECK (
      id = split_part((auth.jwt() ->> 'email'), '@', 1)
      AND lower(split_part((auth.jwt() ->> 'email'), '@', 2)) = 'admeasy.in'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workspace_members' AND policyname = 'users can create own derived membership'
  ) THEN
    CREATE POLICY "users can create own derived membership"
    ON public.workspace_members
    FOR INSERT
    TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND workspace_id = split_part((auth.jwt() ->> 'email'), '@', 1)
      AND lower(split_part((auth.jwt() ->> 'email'), '@', 2)) = 'admeasy.in'
    );
  END IF;
END $$;