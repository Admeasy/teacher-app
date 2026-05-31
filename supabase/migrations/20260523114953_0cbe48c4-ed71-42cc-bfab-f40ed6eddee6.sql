
revoke execute on function public.match_global_chunks(vector, int, text, text, text) from public, anon;
revoke execute on function public.match_workspace_chunks(vector, text, int) from public, anon;
grant execute on function public.match_global_chunks(vector, int, text, text, text) to authenticated;
grant execute on function public.match_workspace_chunks(vector, text, int) to authenticated;
