alter table public.participants
  add column if not exists activity_score integer,
  add column if not exists risk_score integer;
