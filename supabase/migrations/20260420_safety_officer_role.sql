-- Add safety_officer to member_role enum
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'safety_officer';

-- RLS: incident_reports — only admin + safety_officer can view/manage
DROP POLICY IF EXISTS "Members can view incident_reports" ON incident_reports;
DROP POLICY IF EXISTS "Admins can manage incident_reports" ON incident_reports;

CREATE POLICY "Safety roles view incident_reports" ON incident_reports
  FOR SELECT TO authenticated
  USING (
    has_org_role(organization_id, 'admin'::member_role)
    OR has_org_role(organization_id, 'safety_officer'::member_role)
  );

CREATE POLICY "Safety roles manage incident_reports" ON incident_reports
  FOR ALL TO authenticated
  USING (
    has_org_role(organization_id, 'admin'::member_role)
    OR has_org_role(organization_id, 'safety_officer'::member_role)
  );

-- RLS: background_checks — only admin + safety_officer can view/manage
DROP POLICY IF EXISTS "Members can view background_checks" ON background_checks;
DROP POLICY IF EXISTS "Admins can manage background_checks" ON background_checks;

CREATE POLICY "Safety roles view background_checks" ON background_checks
  FOR SELECT TO authenticated
  USING (
    has_org_role(organization_id, 'admin'::member_role)
    OR has_org_role(organization_id, 'safety_officer'::member_role)
  );

CREATE POLICY "Safety roles manage background_checks" ON background_checks
  FOR ALL TO authenticated
  USING (
    has_org_role(organization_id, 'admin'::member_role)
    OR has_org_role(organization_id, 'safety_officer'::member_role)
  );

-- RLS: first_aid_kits — admin + safety_officer can manage, all members
-- can view (kits are non-sensitive; knowing WHERE a kit is helps everyone)
DROP POLICY IF EXISTS "Admins can manage first_aid_kits" ON first_aid_kits;

CREATE POLICY "Safety roles manage first_aid_kits" ON first_aid_kits
  FOR ALL TO authenticated
  USING (
    has_org_role(organization_id, 'admin'::member_role)
    OR has_org_role(organization_id, 'safety_officer'::member_role)
  );
