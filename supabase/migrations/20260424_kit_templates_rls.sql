-- RLS policies for kit_templates and kit_template_items
-- SELECT: any authenticated org member
-- INSERT/UPDATE/DELETE: admins and equipment_managers only

ALTER TABLE kit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit_template_items ENABLE ROW LEVEL SECURITY;

-- kit_templates policies
CREATE POLICY "Members view kit_templates" ON kit_templates
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "Admins/EM manage kit_templates" ON kit_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    OR has_org_role(organization_id, 'equipment_manager')
  );

CREATE POLICY "Admins/EM update kit_templates" ON kit_templates
  FOR UPDATE TO authenticated
  USING (
    has_org_role(organization_id, 'admin')
    OR has_org_role(organization_id, 'equipment_manager')
  );

CREATE POLICY "Admins/EM delete kit_templates" ON kit_templates
  FOR DELETE TO authenticated
  USING (
    has_org_role(organization_id, 'admin')
    OR has_org_role(organization_id, 'equipment_manager')
  );

-- kit_template_items policies (join through kit_templates for org check)
CREATE POLICY "Members view kit_template_items" ON kit_template_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kit_templates kt
      WHERE kt.id = kit_template_items.kit_template_id
        AND is_org_member(kt.organization_id)
    )
  );

CREATE POLICY "Admins/EM manage kit_template_items" ON kit_template_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM kit_templates kt
      WHERE kt.id = kit_template_items.kit_template_id
        AND (has_org_role(kt.organization_id, 'admin')
             OR has_org_role(kt.organization_id, 'equipment_manager'))
    )
  );

CREATE POLICY "Admins/EM update kit_template_items" ON kit_template_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kit_templates kt
      WHERE kt.id = kit_template_items.kit_template_id
        AND (has_org_role(kt.organization_id, 'admin')
             OR has_org_role(kt.organization_id, 'equipment_manager'))
    )
  );

CREATE POLICY "Admins/EM delete kit_template_items" ON kit_template_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kit_templates kt
      WHERE kt.id = kit_template_items.kit_template_id
        AND (has_org_role(kt.organization_id, 'admin')
             OR has_org_role(kt.organization_id, 'equipment_manager'))
    )
  );
