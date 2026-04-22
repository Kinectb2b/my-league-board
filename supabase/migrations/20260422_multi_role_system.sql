-- =====================================================================
-- Migration 1: Multi-role system
-- Purpose: Support multiple role assignments per user, with optional
--          scope (league, division, team). Enables division VPs,
--          treasurers, field managers, etc. as first-class roles.
--
-- APPLY IN TWO STEPS in the Supabase SQL Editor:
--   1. Run BLOCK A alone, wait for it to complete.
--   2. Run BLOCK B as a separate query.
-- =====================================================================

-- ============ BLOCK A: New enum values ============
-- (Run this on its own first.)

ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'division_vp';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'treasurer';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'field_manager';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'uniform_manager';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'scheduling_manager';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'registration_manager';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'player_agent';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'umpire_coordinator';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'sponsorship_coordinator';


-- ============ BLOCK B: Tables, data, helpers, RLS ============
-- (Run this after BLOCK A finishes.)

-- Scope type enum
DO $$ BEGIN
  CREATE TYPE role_scope_type AS ENUM ('league', 'division', 'team');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role member_role NOT NULL,
  scope_type role_scope_type NOT NULL DEFAULT 'league',
  scope_id UUID,  -- NULL for league; points at divisions.id or teams.id otherwise
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, organization_id, role, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_org
  ON user_roles(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org_role
  ON user_roles(organization_id, role);
CREATE INDEX IF NOT EXISTS idx_user_roles_scope
  ON user_roles(scope_type, scope_id) WHERE scope_id IS NOT NULL;

-- Backfill from organization_members
-- Note: profile_id is the auth user id (profiles.id == auth.users.id in Supabase)
INSERT INTO user_roles (user_id, organization_id, role, scope_type, assigned_at)
SELECT
  om.profile_id,
  om.organization_id,
  om.role,
  'league'::role_scope_type,
  COALESCE(om.joined_at, NOW())
FROM organization_members om
WHERE om.profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = om.profile_id
      AND ur.organization_id = om.organization_id
      AND ur.role = om.role
      AND ur.scope_type = 'league'
      AND ur.scope_id IS NULL
  );

-- Helper: scope-aware role check
CREATE OR REPLACE FUNCTION has_role(
  check_org_id UUID,
  check_role member_role,
  check_scope_type role_scope_type DEFAULT 'league',
  check_scope_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = check_org_id
      AND role = check_role
      AND (
        scope_type = 'league'
        OR (scope_type = check_scope_type AND scope_id IS NOT DISTINCT FROM check_scope_id)
      )
  );
$$;

-- Helper: "does the user have ANY of these roles in this org?"
CREATE OR REPLACE FUNCTION has_any_role(
  check_org_id UUID,
  check_roles member_role[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = check_org_id
      AND role = ANY(check_roles)
  );
$$;

-- RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own roles" ON user_roles;
CREATE POLICY "Users view own roles"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all roles in org" ON user_roles;
CREATE POLICY "Admins view all roles in org"
  ON user_roles FOR SELECT
  USING (has_role(organization_id, 'admin'::member_role));

DROP POLICY IF EXISTS "Admins manage roles in org" ON user_roles;
CREATE POLICY "Admins manage roles in org"
  ON user_roles FOR ALL
  USING (has_role(organization_id, 'admin'::member_role))
  WITH CHECK (has_role(organization_id, 'admin'::member_role));

-- Convenience view: flatten role assignments for debugging / display
CREATE OR REPLACE VIEW user_role_summary AS
SELECT
  ur.user_id,
  ur.organization_id,
  p.full_name,
  p.email,
  ARRAY_AGG(
    ur.role::text ||
    CASE
      WHEN ur.scope_type != 'league' THEN ' (' || ur.scope_type::text || ':' || COALESCE(ur.scope_id::text, 'null') || ')'
      ELSE ''
    END
    ORDER BY ur.role::text
  ) AS roles
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
GROUP BY ur.user_id, ur.organization_id, p.full_name, p.email;

-- =====================================================================
-- END MIGRATION 1
-- =====================================================================
