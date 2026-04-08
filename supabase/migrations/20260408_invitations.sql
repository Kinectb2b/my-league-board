CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role member_role NOT NULL DEFAULT 'volunteer',
    invited_by UUID NOT NULL REFERENCES profiles(id),
    token UUID NOT NULL DEFAULT gen_random_uuid(),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, email)
);

CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_token ON invitations(token);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view invitations" ON invitations FOR SELECT TO authenticated USING (is_org_member(organization_id));
CREATE POLICY "Admins manage invitations" ON invitations FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins update invitations" ON invitations FOR UPDATE TO authenticated USING (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins delete invitations" ON invitations FOR DELETE TO authenticated USING (has_org_role(organization_id, 'admin'));
CREATE POLICY "Anyone can view by token" ON invitations FOR SELECT TO authenticated USING (true);
