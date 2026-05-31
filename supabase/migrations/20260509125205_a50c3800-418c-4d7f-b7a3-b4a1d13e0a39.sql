
create table public.voice_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  conversation_id uuid,
  event_type text not null check (event_type in ('wake','command','error','offline_queued','offline_replayed')),
  transcript text,
  status text,
  latency_ms integer,
  page_context text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index voice_events_ws_created on public.voice_events(workspace_id, created_at desc);
alter table public.voice_events enable row level security;
create policy "ws read voice_events" on public.voice_events for select using (is_workspace_member(workspace_id));
create policy "ws insert voice_events" on public.voice_events for insert with check (is_workspace_member(workspace_id));
create policy "ws delete voice_events" on public.voice_events for delete using (is_workspace_member(workspace_id));
