create table if not exists submissions (
  id serial primary key,
  ref text unique not null,
  type text not null,
  case_data jsonb not null default '{}',
  checklist jsonb,
  fee_tier int,
  expedited boolean not null default false,
  status text not null default 'received',
  officer text not null default 'Unassigned',
  decision text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists files (
  id serial primary key,
  submission_id int not null references submissions(id) on delete cascade,
  category text not null,
  filename text not null,
  size_bytes bigint not null default 0,
  content_type text not null default '',
  blob_url text not null default '',
  description text not null default '',
  verified boolean not null default false,
  uploaded_at timestamptz not null default now()
);

create table if not exists audit (
  id serial primary key,
  submission_id int,
  actor text not null default '',
  action text not null default '',
  detail text not null default '',
  at timestamptz not null default now()
);

create index if not exists files_submission_idx on files(submission_id);

-- accounts: consultants self-register; ERA staff are created with scripts/create-staff.mjs
create table if not exists users (
  id serial primary key,
  email text unique not null,
  password_hash text not null,
  name text not null default '',
  role text not null default 'consultant',   -- consultant | officer | admin
  consultant_id int,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id int not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

-- the public EIA Consultants Registry (seeded from ERA's published list)
create table if not exists consultants (
  id serial primary key,
  reg_no text not null default '',
  name text not null default '',
  category text not null default '',          -- ERA category A/B/...
  kind text not null default 'permanent',     -- permanent | temporary
  company text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  license_expiry date,
  qualifications text not null default '',
  specialties text not null default '',
  status text not null default 'active',      -- active | suspended | pending
  verified boolean not null default false,    -- ERA has verified this entry / linked account
  era_notes text not null default '',
  registered_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

-- issues flagged by ERA on a submission (optionally pinned to a file + page);
-- consultants see and reply to them, ERA resolves them.
create table if not exists issues (
  id serial primary key,
  submission_id int not null references submissions(id) on delete cascade,
  file_id int,
  page text not null default '',
  note text not null default '',
  raised_by text not null default '',
  status text not null default 'open',        -- open | resolved
  reply text not null default '',
  resolution text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists issues_submission_idx on issues(submission_id);
create index if not exists sessions_user_idx on sessions(user_id);

-- upgrades for databases created before accounts existed
alter table submissions add column if not exists user_id int;
alter table submissions add column if not exists consultant_id int;
