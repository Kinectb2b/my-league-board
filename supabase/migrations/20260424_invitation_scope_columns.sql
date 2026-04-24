-- Add team/division scope support to invitations
-- Allows invitations to carry scope_type + scope_id so that accepting
-- a team-scoped invitation (e.g. assistant coach) creates a properly
-- scoped user_role entry.

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS scope_type role_scope_type NOT NULL DEFAULT 'league',
  ADD COLUMN IF NOT EXISTS scope_id UUID;

-- Index for looking up invitations scoped to a specific team/division
CREATE INDEX IF NOT EXISTS idx_invitations_scope
  ON invitations (scope_type, scope_id) WHERE scope_id IS NOT NULL;
