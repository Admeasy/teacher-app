
-- 1. Fix world-readable global-academic bucket: remove OR true
DROP POLICY IF EXISTS "super admins read global-academic" ON storage.objects;
CREATE POLICY "super admins read global-academic"
ON storage.objects FOR SELECT
USING (bucket_id = 'global-academic' AND has_role(auth.uid(), 'super_admin'));

-- 2. Re-assert column-level revoke on integrations OAuth tokens
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM anon, authenticated;

-- 3. Lock down workspace_rag_sync_queue writes (only service role / triggers should write)
DROP POLICY IF EXISTS "queue no insert" ON public.workspace_rag_sync_queue;
DROP POLICY IF EXISTS "queue no update" ON public.workspace_rag_sync_queue;
DROP POLICY IF EXISTS "queue no delete" ON public.workspace_rag_sync_queue;
CREATE POLICY "queue no insert" ON public.workspace_rag_sync_queue FOR INSERT WITH CHECK (false);
CREATE POLICY "queue no update" ON public.workspace_rag_sync_queue FOR UPDATE USING (false);
CREATE POLICY "queue no delete" ON public.workspace_rag_sync_queue FOR DELETE USING (false);
