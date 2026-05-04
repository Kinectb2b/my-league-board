-- =====================================================================
-- DEV-05: Add WITH CHECK clause to tickets_update RLS policy.
--
-- Issue: The existing tickets_update policy has only a USING expression.
-- Without WITH CHECK, an authorized updater (opener / assignee / admin)
-- could mutate the row into a state outside their authority. A naive
-- mirror of USING is NOT sufficient: an opener can still UPDATE
-- organization_id to OrgB while remaining opened_by, and the mirrored
-- WITH CHECK would pass — the ticket migrates across the tenancy
-- boundary. Same hole exists for assigned_to.
--
-- Fix: WITH CHECK requires the post-update row's organization_id to be
-- one the caller is a member of (is_org_member), AND the standard
-- authorization predicate. This forces any post-update org_id into the
-- caller's own membership set, eliminating cross-org reassignment via
-- UPDATE.
--
-- APPLY: Paste as single block into Supabase SQL Editor → Run.
-- Idempotent: DROP IF EXISTS + CREATE.
-- =====================================================================

DROP POLICY IF EXISTS "tickets_update" ON public.tickets;

CREATE POLICY "tickets_update" ON public.tickets FOR UPDATE
  USING (
    auth.uid() = opened_by
    OR auth.uid() = assigned_to
    OR has_role(organization_id, 'admin'::member_role)
  )
  WITH CHECK (
    is_org_member(organization_id)
    AND (
      auth.uid() = opened_by
      OR auth.uid() = assigned_to
      OR has_role(organization_id, 'admin'::member_role)
    )
  );
