-- Migration 0011 — idempotence des webhooks Stripe + Sellsy
-- PK text (event id) → unique check sur reception (cf. SPEC §3.10 + §3.24).

-- ========================================================================== --
-- stripe_events_processed
-- ========================================================================== --
create table public.stripe_events_processed (
  event_id text primary key,
  event_type text not null,
  prospect_id uuid references public.prospects(id) on delete set null,
  payload jsonb,
  processed_at timestamptz not null default now()
);

create index stripe_events_processed_prospect_idx on public.stripe_events_processed (prospect_id) where prospect_id is not null;
create index stripe_events_processed_type_idx on public.stripe_events_processed (event_type, processed_at desc);

comment on table public.stripe_events_processed is 'Idempotence webhooks Stripe — PK = event.id Stripe';

-- ========================================================================== --
-- sellsy_events_processed (synchro inverse SPEC §3.24)
-- ========================================================================== --
create table public.sellsy_events_processed (
  event_id text primary key,
  event_type text not null,
  prospect_id uuid references public.prospects(id) on delete set null,
  payload jsonb,
  processed_at timestamptz not null default now()
);

create index sellsy_events_processed_prospect_idx on public.sellsy_events_processed (prospect_id) where prospect_id is not null;
create index sellsy_events_processed_type_idx on public.sellsy_events_processed (event_type, processed_at desc);

comment on table public.sellsy_events_processed is 'Idempotence webhooks Sellsy (quote.accepted, invoice.paid...)';
