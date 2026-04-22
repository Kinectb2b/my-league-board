-- =====================================================================
-- Migration 2: Stock events (equipment audit log)
-- Purpose: Introduce event-log pattern for inventory movements. Every
--          receive/transfer/consume/damage/retire/audit is recorded
--          immutably. A trigger keeps location_stock.quantity in sync.
--
-- APPLY: Paste into Supabase SQL Editor in ONE block. Run once.
-- (No ALTER TYPE ADD VALUE here, so no transaction splitting needed.)
-- =====================================================================

-- Add case_size to equipment_items
ALTER TABLE equipment_items
  ADD COLUMN IF NOT EXISTS case_size INTEGER NOT NULL DEFAULT 1
  CHECK (case_size >= 1);

COMMENT ON COLUMN equipment_items.case_size IS
  'How many individual items come in one shipping case. Default 1. Example: dozen baseballs = 12.';

-- Ensure location_stock has unique constraint on (location, item) so UPSERT works
DO $$ BEGIN
  ALTER TABLE location_stock
    ADD CONSTRAINT location_stock_loc_item_unique
    UNIQUE (storage_location_id, equipment_item_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

-- Event type enum (new type — safe to create/use in same transaction)
DO $$ BEGIN
  CREATE TYPE stock_event_type AS ENUM (
    'receive',   -- new stock arrives at a location
    'transfer',  -- moves between locations, total unchanged
    'consume',   -- used up (game balls), total decreases
    'damage',    -- damaged in place (doesn't remove from location unless paired w/ retire)
    'retire',    -- removed from service, total decreases
    'audit'      -- physical count reconciliation; quantity is signed delta
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- stock_events table (immutable audit log)
CREATE TABLE IF NOT EXISTS stock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_item_id UUID NOT NULL REFERENCES equipment_items(id) ON DELETE RESTRICT,
  event_type stock_event_type NOT NULL,

  from_location_id UUID REFERENCES storage_locations(id),
  to_location_id UUID REFERENCES storage_locations(id),

  -- For most events: positive count of units affected.
  -- For 'audit': signed delta (can be negative if physical count is lower than system).
  quantity INTEGER NOT NULL,

  reason TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Validation: require appropriate location fields per event type
ALTER TABLE stock_events DROP CONSTRAINT IF EXISTS stock_events_location_check;
ALTER TABLE stock_events ADD CONSTRAINT stock_events_location_check CHECK (
  CASE event_type
    WHEN 'receive'  THEN to_location_id IS NOT NULL AND from_location_id IS NULL
    WHEN 'transfer' THEN from_location_id IS NOT NULL
                     AND to_location_id IS NOT NULL
                     AND from_location_id <> to_location_id
    WHEN 'consume'  THEN from_location_id IS NOT NULL AND to_location_id IS NULL
    WHEN 'damage'   THEN from_location_id IS NOT NULL
    WHEN 'retire'   THEN from_location_id IS NOT NULL AND to_location_id IS NULL
    WHEN 'audit'    THEN from_location_id IS NOT NULL
    ELSE true
  END
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_events_org
  ON stock_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_events_item_created
  ON stock_events(equipment_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_events_from_loc
  ON stock_events(from_location_id) WHERE from_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_events_to_loc
  ON stock_events(to_location_id) WHERE to_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_events_type
  ON stock_events(event_type);

-- Trigger function: apply event to location_stock
CREATE OR REPLACE FUNCTION apply_stock_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  delta_from INTEGER;
BEGIN
  -- Compute delta for from_location:
  --   audit  → signed quantity as-is
  --   other  → subtract quantity (leaves the location)
  IF NEW.from_location_id IS NOT NULL THEN
    delta_from := CASE
      WHEN NEW.event_type = 'audit' THEN NEW.quantity
      ELSE -NEW.quantity
    END;

    INSERT INTO location_stock (organization_id, storage_location_id, equipment_item_id, quantity)
    VALUES (NEW.organization_id, NEW.from_location_id, NEW.equipment_item_id, delta_from)
    ON CONFLICT (storage_location_id, equipment_item_id)
    DO UPDATE SET
      quantity = location_stock.quantity + delta_from,
      updated_at = NOW();
  END IF;

  -- to_location always gets +quantity (receive, or transfer destination)
  IF NEW.to_location_id IS NOT NULL THEN
    INSERT INTO location_stock (organization_id, storage_location_id, equipment_item_id, quantity)
    VALUES (NEW.organization_id, NEW.to_location_id, NEW.equipment_item_id, NEW.quantity)
    ON CONFLICT (storage_location_id, equipment_item_id)
    DO UPDATE SET
      quantity = location_stock.quantity + NEW.quantity,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_stock_event ON stock_events;
CREATE TRIGGER trg_apply_stock_event
AFTER INSERT ON stock_events
FOR EACH ROW
EXECUTE FUNCTION apply_stock_event();

-- RLS
ALTER TABLE stock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view stock events" ON stock_events;
CREATE POLICY "Org members view stock events"
  ON stock_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = stock_events.organization_id
        AND om.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Equipment managers create events" ON stock_events;
CREATE POLICY "Equipment managers create events"
  ON stock_events FOR INSERT
  WITH CHECK (
    has_any_role(
      organization_id,
      ARRAY['admin', 'equipment_manager']::member_role[]
    )
  );

-- Events are immutable — no UPDATE or DELETE policies intentionally.

-- =====================================================================
-- END MIGRATION 2
-- =====================================================================
