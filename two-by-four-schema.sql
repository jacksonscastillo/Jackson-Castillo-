-- =============================================================
-- TWO BY FOUR — the office's Fixed Activity Commitment cards
-- One-time setup. Paste this whole file into the Supabase SQL
-- editor (the same project the dashboard and the Granum game
-- use) and click RUN. Safe to run more than once.
-- =============================================================

-- ---------- TABLE ----------
-- One row per person. Their whole card is the `days` object, keyed by date:
--   {"2026-09-03": {"ff":2, "qs":4, "type":"work", "t":1772…, "tf":2, "tq":4}}
-- The app merges days one at a time on `t`, so two phones logging the same
-- person never overwrite each other's entries.
create table if not exists public.two_by_four_cards (
  card_id     text primary key,             -- stable per-person id (minted on first open)
  name        text not null,
  team        text default '',              -- mentor or unit, optional
  role        text default 'advisor',       -- 'advisor' or 'manager'
  joined      date,                         -- first day on the card
  pin_hash    text default '',              -- SHA-256 of "<card_id>:<pin>"
  pin_alg     text default '',              -- 'sha', or 'fnv' where SubtleCrypto is unavailable
  days        jsonb default '{}'::jsonb,
  reset_at    bigint default 0,             -- ms epoch; days older than this are dropped on merge
  updated_at  timestamptz default now()
);

-- ---------- ROW LEVEL SECURITY ----------
-- This is one shared office scoreboard with no per-user login, the same shape
-- as the Granum game board. The public anon key may read the board and write
-- its own card. The 4-digit PIN keeps a card from being opened by someone else
-- by accident; it is not enforced here and is not a security boundary.
--
-- What that means in practice: anyone with the page's URL can read every card
-- and, with the anon key that ships in the page, could write any of them. Only
-- activity counts belong in this table. Never client names, contact details, or
-- anything that would matter if the link were forwarded.
alter table public.two_by_four_cards enable row level security;

drop policy if exists "tbf read"   on public.two_by_four_cards;
drop policy if exists "tbf insert" on public.two_by_four_cards;
drop policy if exists "tbf update" on public.two_by_four_cards;
drop policy if exists "tbf delete" on public.two_by_four_cards;

create policy "tbf read"   on public.two_by_four_cards for select using (true);
create policy "tbf insert" on public.two_by_four_cards for insert with check (true);
create policy "tbf update" on public.two_by_four_cards for update using (true) with check (true);
-- delete is only used by the management view's "Remove card" button:
create policy "tbf delete" on public.two_by_four_cards for delete using (true);

-- ---------- GRANTS (REQUIRED) ----------
-- RLS decides WHICH ROWS a role may touch; GRANT decides whether the role may
-- touch the table at all. Without these the public anon key gets:
--   HTTP 401 / 42501  "permission denied for table two_by_four_cards"
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.two_by_four_cards to anon, authenticated;

-- ---------- RELOAD POSTGREST SCHEMA CACHE ----------
-- Forces the REST API to re-read the table and grants immediately, so you don't
-- hit a stale  404 PGRST205  "could not find the table in the schema cache".
notify pgrst, 'reload schema';
