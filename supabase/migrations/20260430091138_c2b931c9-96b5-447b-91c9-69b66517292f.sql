
-- Workspaces (one per school)
create table public.workspaces (
  id text primary key,
  name text not null,
  erp_urls jsonb default '{}'::jsonb,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Map auth users to workspaces
create table public.workspace_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create or replace function public.is_workspace_member(_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = _workspace_id and user_id = auth.uid()
  )
$$;

-- Students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  student_id text,
  name text,
  class text,
  section text,
  student_email text,
  parent_name text,
  parent_email text,
  parent_phone text,
  attendance_pct numeric,
  total_fees numeric,
  paid numeric,
  due numeric,
  fee_status text,
  interests text,
  created_at timestamptz not null default now(),
  unique(workspace_id, student_id)
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  teacher_id text,
  name text,
  subject text,
  email text,
  phone text,
  assigned_classes text,
  created_at timestamptz not null default now(),
  unique(workspace_id, teacher_id)
);

create table public.mentors (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  mentor_id text,
  name text,
  institution text,
  program text,
  college text,
  expertise_tags text,
  available_for text,
  contact_email text,
  created_at timestamptz not null default now(),
  unique(workspace_id, mentor_id)
);

create table public.command_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  command text not null,
  intent text,
  created_at timestamptz not null default now()
);

create table public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  command text,
  intent text,
  plan jsonb,
  actions_taken jsonb,
  status text,
  result jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  message text not null,
  type text,
  status text default 'unread',
  created_at timestamptz not null default now()
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  type text not null,
  access_token text,
  refresh_token text,
  metadata jsonb,
  connected_at timestamptz not null default now(),
  unique(workspace_id, type)
);

create table public.csv_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  file_name text,
  file_url text,
  entity_type text,
  row_count integer,
  parsed_status text,
  uploaded_at timestamptz not null default now()
);

create table public.browser_bookmarks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  label text not null,
  url text not null,
  icon text,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.mentors enable row level security;
alter table public.command_history enable row level security;
alter table public.execution_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.integrations enable row level security;
alter table public.csv_uploads enable row level security;
alter table public.browser_bookmarks enable row level security;

-- Policies
create policy "members read own workspace" on public.workspaces
  for select using (public.is_workspace_member(id));

create policy "members read own membership" on public.workspace_members
  for select using (user_id = auth.uid());

-- Generic per-table policy macro via repeated statements
do $$
declare t text;
begin
  foreach t in array array['students','teachers','mentors','command_history','execution_logs','notifications','integrations','csv_uploads','browser_bookmarks']
  loop
    execute format('create policy "ws read" on public.%I for select using (public.is_workspace_member(workspace_id));', t);
    execute format('create policy "ws insert" on public.%I for insert with check (public.is_workspace_member(workspace_id));', t);
    execute format('create policy "ws update" on public.%I for update using (public.is_workspace_member(workspace_id));', t);
    execute format('create policy "ws delete" on public.%I for delete using (public.is_workspace_member(workspace_id));', t);
  end loop;
end$$;

-- Seed the two demo workspaces
insert into public.workspaces (id, name) values
  ('Schoolid0001', 'Demo School 0001'),
  ('Schoolid0002', 'Demo School 0002')
on conflict (id) do nothing;
