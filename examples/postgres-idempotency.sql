-- Reference shape. Run this in the same PostgreSQL transaction as the domain write.
create table causync_idempotency (
  actor_scope text not null,
  mutation_id uuid not null,
  contract_id text not null,
  payload_sha256 text not null,
  state text not null check (state in ('processing', 'accepted', 'rejected')),
  receipt jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (actor_scope, mutation_id)
);

create index causync_idempotency_expiry_idx on causync_idempotency (expires_at);

-- The application must retain a row longer than its maximum client retry window.
-- Delete only terminal rows; a processing row may represent an interrupted transaction.
delete from causync_idempotency
where expires_at < now() and state in ('accepted', 'rejected');
