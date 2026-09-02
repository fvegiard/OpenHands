-- PROPOSAL ONLY — REVIEW ON A SUPABASE PREVIEW BRANCH BEFORE APPLYING.
-- Additive indexes and a function search_path correction derived from the
-- current schema audit. No RLS policy change is included here because the
-- existing bus/estimation tables do not yet carry organization ownership.

begin;

create index if not exists message_repond_a_idx
  on bus.message (repond_a) where repond_a is not null;
create index if not exists taux_ccq_document_id_idx
  on estimation.taux_ccq (document_id) where document_id is not null;
create index if not exists unite_main_oeuvre_document_id_idx
  on estimation.unite_main_oeuvre (document_id) where document_id is not null;
create index if not exists activity_events_actor_id_idx
  on public.activity_events (actor_id) where actor_id is not null;
create index if not exists clients_created_by_idx
  on public.clients (created_by) where created_by is not null;
create index if not exists organizations_created_by_idx
  on public.organizations (created_by) where created_by is not null;
create index if not exists projects_created_by_idx
  on public.projects (created_by) where created_by is not null;
create index if not exists tasks_created_by_idx
  on public.tasks (created_by) where created_by is not null;

alter function mavis.set_updated_at()
  set search_path = pg_catalog, mavis;

commit;
