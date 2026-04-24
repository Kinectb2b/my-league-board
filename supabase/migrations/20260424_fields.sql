-- =====================================================================
-- Migration: Fields / Diamonds / Batting Cages
-- Purpose: Track physical playing fields, their type, status, and
--          allow coaches/members to report field issues via tickets.
-- =====================================================================

CREATE TABLE IF NOT EXISTS fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  field_type TEXT CHECK (field_type IN ('baseball', 'softball', 'batting_cage', 'practice', 'other')),
  address TEXT,
  lat NUMERIC,
  lng NUMERIC,
  status TEXT CHECK (status IN ('available', 'maintenance', 'closed')) DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fields_org ON fields (organization_id);
CREATE INDEX IF NOT EXISTS idx_fields_status ON fields (status) WHERE status != 'available';

-- Updated-at trigger
CREATE OR REPLACE FUNCTION fields_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fields_set_updated_at ON fields;
CREATE TRIGGER trg_fields_set_updated_at
BEFORE UPDATE ON fields
FOR EACH ROW
EXECUTE FUNCTION fields_set_updated_at();

-- RLS
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view fields" ON fields
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = fields.organization_id
        AND om.profile_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage fields" ON fields
  FOR INSERT TO authenticated
  WITH CHECK (
    has_org_role(organization_id, 'admin'::member_role)
  );

CREATE POLICY "Admins update fields" ON fields
  FOR UPDATE TO authenticated
  USING (
    has_org_role(organization_id, 'admin'::member_role)
  );

CREATE POLICY "Admins delete fields" ON fields
  FOR DELETE TO authenticated
  USING (
    has_org_role(organization_id, 'admin'::member_role)
  );
