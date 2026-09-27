-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Guarda todos os dados da plataforma numa linha por usuário.
-- RLS garante que só quem está logado lê e altera os próprios dados.

create table if not exists public.engenharia (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.engenharia enable row level security;

drop policy if exists "dono lê"     on public.engenharia;
drop policy if exists "dono cria"   on public.engenharia;
drop policy if exists "dono altera" on public.engenharia;

create policy "dono lê"     on public.engenharia for select using (auth.uid() = user_id);
create policy "dono cria"   on public.engenharia for insert with check (auth.uid() = user_id);
create policy "dono altera" on public.engenharia for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
