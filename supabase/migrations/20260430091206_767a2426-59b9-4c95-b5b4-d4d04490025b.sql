
revoke execute on function public.is_workspace_member(text) from public, anon;
grant execute on function public.is_workspace_member(text) to authenticated;
