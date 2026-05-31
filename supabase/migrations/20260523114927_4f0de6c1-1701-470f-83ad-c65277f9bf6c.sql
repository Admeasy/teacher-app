
-- Enable pgvector
create extension if not exists vector;

-- ============ global_rag_sources ============
create table public.global_rag_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  board text,
  class text,
  subject text,
  chapter text,
  source_type text not null default 'book',
  storage_path text not null,
  file_size bigint,
  page_count int,
  chunk_count int not null default 0,
  status text not null default 'pending',
  error text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.global_rag_sources enable row level security;

create policy "super admins manage global sources"
  on public.global_rag_sources for all to authenticated
  using (has_role(auth.uid(), 'super_admin'))
  with check (has_role(auth.uid(), 'super_admin'));

create policy "authenticated read global sources"
  on public.global_rag_sources for select to authenticated using (true);

create trigger trg_global_rag_sources_updated
  before update on public.global_rag_sources
  for each row execute function public.set_updated_at();

-- ============ global_rag_chunks ============
create table public.global_rag_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.global_rag_sources(id) on delete cascade,
  source_name text,
  board text,
  class text,
  subject text,
  chapter text,
  source_type text,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.global_rag_chunks enable row level security;

create policy "super admins manage global chunks"
  on public.global_rag_chunks for all to authenticated
  using (has_role(auth.uid(), 'super_admin'))
  with check (has_role(auth.uid(), 'super_admin'));

create policy "authenticated read global chunks"
  on public.global_rag_chunks for select to authenticated using (true);

create index global_rag_chunks_embedding_idx
  on public.global_rag_chunks using hnsw (embedding vector_cosine_ops);
create index global_rag_chunks_bcs_idx
  on public.global_rag_chunks (board, class, subject);
create index global_rag_chunks_source_idx
  on public.global_rag_chunks (source_id);

-- ============ workspace_rag_chunks ============
create table public.workspace_rag_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  source_name text,
  source_type text,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.workspace_rag_chunks enable row level security;

create policy "ws read rag" on public.workspace_rag_chunks
  for select using (is_workspace_member(workspace_id));
create policy "ws insert rag" on public.workspace_rag_chunks
  for insert with check (is_workspace_member(workspace_id));
create policy "ws update rag" on public.workspace_rag_chunks
  for update using (is_workspace_member(workspace_id));
create policy "ws delete rag" on public.workspace_rag_chunks
  for delete using (is_workspace_member(workspace_id));

create index workspace_rag_chunks_embedding_idx
  on public.workspace_rag_chunks using hnsw (embedding vector_cosine_ops);
create index workspace_rag_chunks_ws_idx
  on public.workspace_rag_chunks (workspace_id);

-- ============ Search RPCs ============
create or replace function public.match_global_chunks(
  query_embedding vector(1536),
  match_count int default 6,
  p_board text default null,
  p_class text default null,
  p_subject text default null
)
returns table (
  id uuid,
  source_id uuid,
  source_name text,
  board text,
  class text,
  subject text,
  chapter text,
  content text,
  similarity float
)
language sql stable
security definer
set search_path = public
as $$
  select c.id, c.source_id, c.source_name, c.board, c.class, c.subject, c.chapter,
         c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.global_rag_chunks c
  where c.embedding is not null
    and (p_board   is null or c.board   ilike p_board)
    and (p_class   is null or c.class   ilike p_class)
    and (p_subject is null or c.subject ilike p_subject)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_workspace_chunks(
  query_embedding vector(1536),
  p_workspace_id text,
  match_count int default 6
)
returns table (
  id uuid,
  source_name text,
  source_type text,
  content text,
  similarity float
)
language sql stable
security definer
set search_path = public
as $$
  select c.id, c.source_name, c.source_type, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.workspace_rag_chunks c
  where c.workspace_id = p_workspace_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ============ Storage bucket ============
insert into storage.buckets (id, name, public)
values ('global-academic', 'global-academic', false)
on conflict (id) do nothing;

create policy "super admins read global-academic"
  on storage.objects for select to authenticated
  using (bucket_id = 'global-academic' and (has_role(auth.uid(),'super_admin') or true));

create policy "super admins upload global-academic"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'global-academic' and has_role(auth.uid(),'super_admin'));

create policy "super admins update global-academic"
  on storage.objects for update to authenticated
  using (bucket_id = 'global-academic' and has_role(auth.uid(),'super_admin'));

create policy "super admins delete global-academic"
  on storage.objects for delete to authenticated
  using (bucket_id = 'global-academic' and has_role(auth.uid(),'super_admin'));
