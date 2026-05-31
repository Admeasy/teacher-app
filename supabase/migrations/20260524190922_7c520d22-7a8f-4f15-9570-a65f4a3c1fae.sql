
-- Per-source vector match functions for Super Admin KB test chat
create or replace function public.match_global_chunks_by_source(
  query_embedding vector,
  p_source_id uuid,
  match_count integer default 6
)
returns table (
  id uuid,
  chunk_index integer,
  source_id uuid,
  source_name text,
  content text,
  similarity double precision
)
language sql stable
security definer
set search_path = public
as $$
  select c.id, c.chunk_index, c.source_id, s.name as source_name, c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.global_rag_chunks c
  join public.global_rag_sources s on s.id = c.source_id
  where c.source_id = p_source_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_workspace_chunks_by_source(
  query_embedding vector,
  p_source_id uuid,
  match_count integer default 6
)
returns table (
  id uuid,
  chunk_index integer,
  source_id uuid,
  source_name text,
  content text,
  similarity double precision
)
language sql stable
security definer
set search_path = public
as $$
  select c.id, c.chunk_index, c.source_id, s.name as source_name, c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.workspace_rag_chunks c
  join public.workspace_rag_sources s on s.id = c.source_id
  where c.source_id = p_source_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
