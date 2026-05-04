-- =====================================================================
-- BONUS (Session 1 verification finding): Set security_invoker on views.
--
-- Issue: bag_summary, equipment_totals, AND user_role_summary are owned
-- by postgres and were created without (security_invoker = on). Postgres
-- views default to running with the OWNER's privileges, so SELECTs
-- through these views bypass RLS on the underlying tables. Today this
-- is not a vulnerability because underlying RLS happens to permit reads
-- broadly, but once Session 5's RLS hardening lands the views would
-- silently keep returning rows the new policies say should not be
-- readable to the caller.
--
-- Fix: Flip all three views to security_invoker, so SELECT runs with
-- the caller's privileges and the underlying RLS applies. Pure metadata
-- change; view definitions are unaffected.
--
-- APPLY: Paste as single block into Supabase SQL Editor → Run.
-- Idempotent: ALTER VIEW SET sets to absolute value.
-- =====================================================================

ALTER VIEW public.bag_summary        SET (security_invoker = on);
ALTER VIEW public.equipment_totals   SET (security_invoker = on);
ALTER VIEW public.user_role_summary  SET (security_invoker = on);
