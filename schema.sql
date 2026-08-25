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
