-- No financial entries are stored here. Device IDs are SHA-256 hashes of random local tokens.
create table if not exists public.buddy_reminder_devices (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  subscription jsonb,
  enabled boolean not null default false,
  month_key text check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  has_actual boolean not null default false,
  last_phrase smallint not null default -1 check (last_phrase between -1 and 9),
  updated_at timestamptz not null default now()
);

create table if not exists public.buddy_reminder_sends (
  device_id text not null references public.buddy_reminder_devices(id) on delete cascade,
  month_key text not null,
  hour integer not null check (hour in (10, 13, 16, 19, 22)),
  sent_at timestamptz not null default now(),
  primary key (device_id, month_key, hour)
);

alter table public.buddy_reminder_devices enable row level security;
alter table public.buddy_reminder_sends enable row level security;
revoke all on public.buddy_reminder_devices, public.buddy_reminder_sends from anon, authenticated;
-- The Edge Function alone uses the server-side secret key to access these tables.
