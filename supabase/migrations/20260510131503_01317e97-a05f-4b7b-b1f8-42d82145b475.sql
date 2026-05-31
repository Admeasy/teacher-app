create table public.canonical_schema_memory (
  id uuid default gen_random_uuid() primary key,
  workspace_id text not null,
  source_header text not null,
  canonical_field text not null,
  entity_type text not null,
  confidence float not null,
  seen_count int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(workspace_id, source_header)
);

alter table public.canonical_schema_memory enable row level security;

create policy "ws read schema memory"
on public.canonical_schema_memory for select
using (public.is_workspace_member(workspace_id));

create policy "ws insert schema memory"
on public.canonical_schema_memory for insert
with check (public.is_workspace_member(workspace_id));

create policy "ws update schema memory"
on public.canonical_schema_memory for update
using (public.is_workspace_member(workspace_id));

create policy "ws delete schema memory"
on public.canonical_schema_memory for delete
using (public.is_workspace_member(workspace_id));

create index idx_csm_workspace on public.canonical_schema_memory(workspace_id);
create index idx_csm_lookup on public.canonical_schema_memory(workspace_id, source_header);