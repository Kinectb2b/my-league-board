-- =====================================================================
-- DEV-06: Pin activity_log.actor_id = auth.uid() on INSERT.
--
-- Issue: The existing "Members add activity" INSERT policy only checks
-- is_org_member(organization_id). It does not constrain actor_id, so any
-- authenticated org member can write an audit-log row claiming any other
-- user took the action. This is a forgery vector and undermines the
-- integrity of the activity log as evidence.
--
-- App-side audit (verified pre-migration): both insert call sites
-- (src/lib/activity.js, src/pages/MembersPage.jsx) already set
-- actor_id = (await supabase.auth.getUser()).data.user.id, which equals
-- auth.uid() server-side. The new policy will not reject any existing
-- app caller. activity_log has no triggers — every insert comes from
-- app code — so this WITH CHECK is the sole enforcement point.
--
-- Defense-in-depth: also set DEFAULT actor_id = auth.uid() on the
-- column. If a future caller forgets the field, Postgres auto-fills it
-- correctly rather than dropping a NULL that would fail the new CHECK.
--
-- APPLY: Paste as single block into Supabase SQL Editor → Run.
-- Idempotent: ALTER COLUMN SET DEFAULT (absolute), DROP IF EXISTS +
-- CREATE.
-- =====================================================================

ALTER TABLE public.activity_log
  ALTER COLUMN actor_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Members add activity" ON public.activity_log;

CREATE POLICY "Members add activity" ON public.activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND is_org_member(organization_id)
  );
