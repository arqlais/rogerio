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


-- Anexos (notas fiscais, contratos, orçamentos assinados): bucket PRIVADO "documentos".
-- Cada usuário só vê e grava na própria pasta.
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false) on conflict (id) do update set public = false;
drop policy if exists "documentos: dono vê"    on storage.objects;
drop policy if exists "documentos: dono cria"  on storage.objects;
drop policy if exists "documentos: dono altera" on storage.objects;
drop policy if exists "documentos: dono apaga" on storage.objects;
create policy "documentos: dono vê"     on storage.objects for select to authenticated using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documentos: dono cria"   on storage.objects for insert to authenticated with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documentos: dono altera" on storage.objects for update to authenticated using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documentos: dono apaga"  on storage.objects for delete to authenticated using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Agenda do celular: arquivo .ics por usuário no bucket "agenda" (endereço com chave secreta).
insert into storage.buckets (id, name, public) values ('agenda', 'agenda', true) on conflict (id) do update set public = true;
drop policy if exists "agenda: dono vê"     on storage.objects;
drop policy if exists "agenda: dono cria"   on storage.objects;
drop policy if exists "agenda: dono altera" on storage.objects;
drop policy if exists "agenda: dono apaga"  on storage.objects;
create policy "agenda: dono vê"     on storage.objects for select to authenticated using (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "agenda: dono cria"   on storage.objects for insert to authenticated with check (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "agenda: dono altera" on storage.objects for update to authenticated using (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "agenda: dono apaga"  on storage.objects for delete to authenticated using (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text);

-- avisa a API que a tabela nova existe (resolve "Could not find the table ... in the schema cache")
notify pgrst, 'reload schema';
