-- SnapMeter — Postgres schema for the production backend (PRD §6).
-- This is the target schema the PWA's Dexie stores mirror. Apply via Supabase
-- migrations. Row-level security stubs at the bottom; tighten per role before use.

create type meter_type as enum ('water', 'electricity', 'gas', 'heat');
create type meter_status as enum ('active', 'replaced', 'removed');
create type reading_status as enum ('pending', 'confirmed', 'flagged', 'rejected');
create type user_role as enum ('technician', 'manager', 'admin', 'client_viewer');
create type value_kind as enum ('reading', 'consumption');

create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text,
  created_at  timestamptz not null default now()
);

create table sites (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  address     text,
  geo         jsonb,
  created_at  timestamptz not null default now()
);

create table meters (
  id               uuid primary key default gen_random_uuid(),
  qr_payload       text not null unique,
  meter_label      text not null,
  site_id          uuid not null references sites(id),
  client_id        uuid not null references clients(id),
  meter_type       meter_type not null,
  units            text not null,
  register_config  jsonb not null,  -- { integer_digits, decimals, multiplier, registers[] }
  status           meter_status not null default 'active',
  created_at       timestamptz not null default now()
);
create index on meters (site_id);
create index on meters (client_id);

create table readings (
  id                   uuid primary key default gen_random_uuid(),
  meter_id             uuid not null references meters(id),
  register             text,
  period               text not null,            -- 'YYYY-MM'
  reading_value        numeric not null,
  previous_reading_id  uuid references readings(id),
  consumption          numeric,
  captured_at          timestamptz not null default now(),
  captured_by          uuid,
  photo_url            text,
  qr_photo_url         text,
  confidence           numeric,
  raw_extraction       jsonb,
  status               reading_status not null default 'pending',
  flags                jsonb not null default '[]',
  confirmed_by         uuid,
  confirmed_at         timestamptz
);
create index on readings (meter_id);
create index on readings (period);
create index on readings (status);
-- Idempotent offline sync key (PRD §7.1).
create unique index readings_dedupe
  on readings (meter_id, coalesce(register, ''), period, captured_at);

-- Append-only audit guard: corrections create new rows; never overwrite history.
create or replace function forbid_value_overwrite() returns trigger as $$
begin
  if old.status = 'confirmed' and new.reading_value <> old.reading_value then
    raise exception 'Confirmed readings are immutable; create a correcting record';
  end if;
  return new;
end; $$ language plpgsql;
create trigger readings_immutable before update on readings
  for each row execute function forbid_value_overwrite();

create table templates (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id),
  name            text not null,
  file_ref        text not null,      -- path in Supabase Storage to the master template
  structure_meta  jsonb,
  created_at      timestamptz not null default now()
);

create table template_mappings (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references templates(id) on delete cascade,
  meter_id      uuid not null references meters(id),
  target_sheet  text not null,
  target_cell   text not null,
  value_kind    value_kind not null,
  period_anchor text
);

create table app_users (
  id    uuid primary key,           -- references auth.users(id)
  role  user_role not null default 'technician',
  name  text
);

-- RLS (enable then add policies scoped to a user's client/site assignments).
alter table clients          enable row level security;
alter table sites            enable row level security;
alter table meters           enable row level security;
alter table readings         enable row level security;
alter table templates        enable row level security;
alter table template_mappings enable row level security;
-- e.g. technicians: read meters on assigned sites, insert readings;
--      managers: confirm/flag readings for their client;
--      client_viewer: read-only on own client. Define per deployment.
