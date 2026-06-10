-- Thansen Verktøykasse · Tasks v20 — migrerings-logg (schema_migrations)
-- Audit 2026-06-09, punkt 7 (P1): ingen oversikt over hvilke migreringer som er kjørt,
-- og en re-kjøring av tasks_v13.sql ville slettet alle dags-tildelinger. db/run.mjs
-- nekter nå å kjøre en allerede-loggført migrering uten --force.

create table if not exists public.schema_migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

-- Loggfør alt som historisk er kjørt mot denne databasen
insert into public.schema_migrations (name) values
  ('tasks.sql'), ('tasks_v2.sql'), ('tasks_v3.sql'), ('tasks_v4.sql'), ('tasks_v5.sql'),
  ('tasks_v6.sql'), ('tasks_v7.sql'), ('tasks_v8.sql'), ('tasks_v9.sql'), ('tasks_v10.sql'),
  ('tasks_v11.sql'), ('tasks_v12.sql'), ('tasks_v13.sql'), ('tasks_v14.sql'), ('tasks_v15.sql'),
  ('tasks_v16.sql'), ('tasks_v17.sql'), ('tasks_v18.sql'), ('tasks_v19.sql'),
  ('wiki.sql'), ('wiki_v2.sql')
on conflict (name) do nothing;
