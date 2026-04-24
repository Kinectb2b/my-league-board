-- Relax the unique constraint on invitations to allow the same email
-- to receive invitations with different scopes (e.g., a league board
-- invitation AND a team-scoped assistant coach invitation).
--
-- Old: UNIQUE(organization_id, email)
-- New: UNIQUE(organization_id, email, scope_type, COALESCE(scope_id, '00000000-...'))
--
-- We use a unique index instead of a constraint because scope_id is
-- nullable and NULLs are not equal in standard unique constraints.

ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_organization_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_org_email_scope
  ON invitations (
    organization_id,
    email,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')
  )
  WHERE accepted_at IS NULL;

-- Allow coaches to insert team-scoped invitations for their own team
CREATE POLICY "Coaches insert team invitations" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    scope_type = 'team'
    AND scope_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = invitations.organization_id
        AND ur.role = 'coach'
        AND ur.scope_type = 'team'
        AND ur.scope_id = invitations.scope_id
    )
  );
