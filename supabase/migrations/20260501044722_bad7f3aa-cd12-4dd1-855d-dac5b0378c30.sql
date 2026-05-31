create table if not exists public.fee_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  student_id text,
  student_name text,
  section text,
  parent_name text,
  parent_email text,
  parent_phone text,
  amount_due numeric,
  fee_status text,
  channels text,
  created_at timestamptz not null default now()
);
alter table public.fee_reminders enable row level security;
create policy "ws read" on public.fee_reminders for select using (public.is_workspace_member(workspace_id));
create policy "ws insert" on public.fee_reminders for insert with check (public.is_workspace_member(workspace_id));
create policy "ws update" on public.fee_reminders for update using (public.is_workspace_member(workspace_id));
create policy "ws delete" on public.fee_reminders for delete using (public.is_workspace_member(workspace_id));

create table if not exists public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  student_id text,
  student_name text,
  section text,
  attendance_pct numeric,
  parent_name text,
  parent_email text,
  parent_phone text,
  risk_level text,
  created_at timestamptz not null default now()
);
alter table public.attendance_alerts enable row level security;
create policy "ws read" on public.attendance_alerts for select using (public.is_workspace_member(workspace_id));
create policy "ws insert" on public.attendance_alerts for insert with check (public.is_workspace_member(workspace_id));
create policy "ws update" on public.attendance_alerts for update using (public.is_workspace_member(workspace_id));
create policy "ws delete" on public.attendance_alerts for delete using (public.is_workspace_member(workspace_id));

create table if not exists public.mentor_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  student_id text,
  student_name text,
  section text,
  student_interests text,
  mentor_id text,
  mentor_name text,
  mentor_institution text,
  mentor_tags text,
  created_at timestamptz not null default now()
);
alter table public.mentor_matches enable row level security;
create policy "ws read" on public.mentor_matches for select using (public.is_workspace_member(workspace_id));
create policy "ws insert" on public.mentor_matches for insert with check (public.is_workspace_member(workspace_id));
create policy "ws update" on public.mentor_matches for update using (public.is_workspace_member(workspace_id));
create policy "ws delete" on public.mentor_matches for delete using (public.is_workspace_member(workspace_id));