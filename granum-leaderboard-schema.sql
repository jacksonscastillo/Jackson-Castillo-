-- =============================================================
-- THE GRANUM GAME — live team leaderboard
-- One-time setup. Paste this whole file into the Supabase SQL
-- editor (the same project the dashboard uses) and click RUN.
-- Safe to run more than once.
-- =============================================================

-- ---------- TABLE ----------
create table if not exists public.granum_scores (
  player_id     text primary key,           -- stable per-laptop id (from localStorage)
  name          text not null,
  pts           numeric  default 0,         -- OCS points (0–150)
  best_streak   integer  default 0,
  modules_done  integer  default 0,         -- 0–6
  finished      boolean  default false,     -- completed all 6 modules
  accuracy      numeric  default 0,         -- % correct across played modules
  updated_at    timestamptz default now()
);

-- ---------- ROW LEVEL SECURITY ----------
-- This is a friendly, in-room competition with no per-user login, so the
-- public anon key is allowed to read the board and post/update its own row.
-- (Scores are a game, not sensitive data.) Each laptop only ever upserts the
-- row matching the random player_id it generated for itself.
alter table public.granum_scores enable row level security;

drop policy if exists "granum read"   on public.granum_scores;
drop policy if exists "granum insert" on public.granum_scores;
drop policy if exists "granum update" on public.granum_scores;
drop policy if exists "granum delete" on public.granum_scores;

create policy "granum read"   on public.granum_scores for select using (true);
create policy "granum insert" on public.granum_scores for insert with check (true);
create policy "granum update" on public.granum_scores for update using (true) with check (true);
-- delete is only used by the host "RESET BOARD" button:
create policy "granum delete" on public.granum_scores for delete using (true);

-- ---------- REALTIME ----------
-- Lets every laptop see score changes instantly (the app also polls as a
-- fallback, so the board still works even if this step is skipped).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'granum_scores'
  ) then
    execute 'alter publication supabase_realtime add table public.granum_scores';
  end if;
end $$;

-- ---------- GRANTS (REQUIRED) ----------
-- RLS decides WHICH ROWS a role may touch; GRANT decides whether the role may
-- touch the table at all. Without these the public anon key gets:
--   HTTP 401 / 42501  "permission denied for table granum_scores"
-- The app authenticates with the anon key (Postgres role "anon"); we also grant
-- "authenticated" for safety. This is a no-login game board, so both roles get
-- full CRUD and the permissive policies above keep it scoped sanely.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.granum_scores to anon, authenticated;

-- ---------- RELOAD POSTGREST SCHEMA CACHE ----------
-- Forces the REST API to re-read the table + grants immediately, so you don't
-- hit a stale  404 PGRST205  "could not find the table in the schema cache".
notify pgrst, 'reload schema';
