-- Per-project notes that act as durable, user-owned project memory.
create table if not exists public.project_memories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_memories_project_user_unique unique (id, project_id, user_id)
);

create index if not exists project_memories_owner_updated_idx
  on public.project_memories (user_id, project_id, updated_at desc);

drop trigger if exists project_memories_set_updated_at on public.project_memories;
create trigger project_memories_set_updated_at
before update on public.project_memories
for each row execute function public.set_updated_at();

alter table public.project_memories enable row level security;

drop policy if exists "Users can manage their project memories" on public.project_memories;
create policy "Users can manage their project memories"
on public.project_memories for all
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.projects
    where projects.id = project_memories.project_id
      and projects.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.projects
    where projects.id = project_memories.project_id
      and projects.user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.project_memories to authenticated;
