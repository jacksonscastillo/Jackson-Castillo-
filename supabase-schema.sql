-- =============================================================
-- Castillo & Partners — Dashboard schema + Row-Level Security
-- Paste this entire file into the Supabase SQL Editor and run.
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- TABLES ----------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  name text not null,
  type text,
  email text,
  phone text,
  "riskProfile" text,
  since date,
  status text default 'Active',
  address text,
  notes text,
  created_at timestamptz default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  "clientId" uuid references public.clients(id) on delete cascade,
  type text,
  custodian text,
  value numeric default 0,
  allocation text,
  "ytdReturn" numeric default 0,
  "feeRate" numeric default 0,
  "lastReview" date,
  created_at timestamptz default now()
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  "clientId" uuid references public.clients(id) on delete cascade,
  type text,
  carrier text,
  "faceAmount" numeric default 0,
  "annualPremium" numeric default 0,
  "commissionPct" numeric default 0,
  status text default 'In-Force',
  "issueDate" date,
  "renewalDate" date,
  notes text,
  created_at timestamptz default now()
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  name text not null,
  email text,
  phone text,
  type text,
  stage text default 'Lead',
  "expectedAUM" numeric default 0,
  "expectedPremium" numeric default 0,
  probability numeric default 0,
  source text,
  "nextAction" text,
  "nextActionDate" date,
  "stageDate" date,
  notes text,
  created_at timestamptz default now()
);

-- ---------- INDEXES ----------

create index on public.clients (user_id);
create index on public.accounts (user_id, "clientId");
create index on public.policies (user_id, "clientId");
create index on public.prospects (user_id);

-- ---------- ROW LEVEL SECURITY ----------

alter table public.clients   enable row level security;
alter table public.accounts  enable row level security;
alter table public.policies  enable row level security;
alter table public.prospects enable row level security;

create policy "own rows" on public.clients   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.accounts  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.policies  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.prospects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
