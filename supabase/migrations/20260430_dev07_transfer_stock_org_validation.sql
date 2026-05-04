-- =====================================================================
-- DEV-07: Validate location org-membership in transfer_stock RPC.
--
-- Issue: transfer_stock(p_org_id, p_transfers) authorizes the caller by
-- role within p_org_id but trusts every from_id and to_id storage
-- location in the JSONB payload. A caller could supply a location UUID
-- belonging to a different organization, causing a stock_event to be
-- inserted across the tenancy boundary. The AFTER INSERT trigger
-- (apply_stock_event) would then mutate location_stock for that other
-- org's location.
--
-- Fix: Before any stock checks or inserts, validate that every distinct
-- from_id and to_id in p_transfers belongs to p_org_id (via
-- storage_locations.organization_id). Raise on first mismatch, naming
-- the offending location for diagnostics. Whole RPC is one transaction,
-- so a raise rolls everything back.
--
-- APPLY: Paste as single block into Supabase SQL Editor → Run.
-- Idempotent: CREATE OR REPLACE FUNCTION.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.transfer_stock(
  p_org_id UUID,
  p_transfers JSONB
)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check    RECORD;
  v_transfer JSONB;
  v_event_id UUID;
  v_loc_id   UUID;
BEGIN
  -- Authorization: caller must be admin or equipment_manager in this org
  IF NOT has_any_role(p_org_id, ARRAY['admin', 'equipment_manager']::member_role[]) THEN
    RAISE EXCEPTION 'Permission denied: requires admin or equipment_manager role';
  END IF;

  IF p_transfers IS NULL OR jsonb_typeof(p_transfers) <> 'array' OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'p_transfers must be a non-empty JSONB array';
  END IF;

  -- Per-row shape + sanity checks
  FOR v_transfer IN SELECT * FROM jsonb_array_elements(p_transfers)
  LOOP
    IF (v_transfer->>'item_id') IS NULL
       OR (v_transfer->>'from_id') IS NULL
       OR (v_transfer->>'to_id') IS NULL
       OR (v_transfer->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'Each transfer requires item_id, from_id, to_id, quantity';
    END IF;

    IF (v_transfer->>'quantity')::INTEGER <= 0 THEN
      RAISE EXCEPTION 'Quantity must be positive (got %)', v_transfer->>'quantity';
    END IF;

    IF (v_transfer->>'from_id')::UUID = (v_transfer->>'to_id')::UUID THEN
      RAISE EXCEPTION 'from_id and to_id must differ for each transfer';
    END IF;
  END LOOP;

  -- TENANCY GUARD: every from_id and to_id must belong to p_org_id.
  -- Without this, a caller authorized in p_org_id could move stock at
  -- a location owned by a different organization.
  FOR v_loc_id IN
    SELECT DISTINCT loc_id FROM (
      SELECT (t->>'from_id')::UUID AS loc_id FROM jsonb_array_elements(p_transfers) AS t
      UNION
      SELECT (t->>'to_id')::UUID   AS loc_id FROM jsonb_array_elements(p_transfers) AS t
    ) ids
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM storage_locations sl
       WHERE sl.id = v_loc_id
         AND sl.organization_id = p_org_id
    ) THEN
      RAISE EXCEPTION 'Location % does not belong to organization %', v_loc_id, p_org_id;
    END IF;
  END LOOP;

  -- PASS 1: Validate aggregated demand per (from_location, item) does not
  -- exceed available stock. Catches the case where multiple rows draw
  -- from the same source.
  FOR v_check IN
    SELECT
      (t->>'from_id')::UUID AS from_id,
      (t->>'item_id')::UUID AS item_id,
      SUM((t->>'quantity')::INTEGER) AS requested
    FROM jsonb_array_elements(p_transfers) AS t
    GROUP BY (t->>'from_id')::UUID, (t->>'item_id')::UUID
  LOOP
    PERFORM 1
      FROM location_stock ls
     WHERE ls.organization_id = p_org_id
       AND ls.storage_location_id = v_check.from_id
       AND ls.equipment_item_id  = v_check.item_id
       AND ls.quantity >= v_check.requested;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock at source location % for item % (requested %)',
        v_check.from_id, v_check.item_id, v_check.requested;
    END IF;
  END LOOP;

  -- PASS 2: Insert stock_events. The apply_stock_event trigger fires
  -- per row and updates location_stock atomically. Whole function runs
  -- in one transaction; any error rolls back every event.
  FOR v_transfer IN SELECT * FROM jsonb_array_elements(p_transfers)
  LOOP
    INSERT INTO stock_events (
      organization_id, equipment_item_id, event_type,
      from_location_id, to_location_id, quantity,
      reason, notes, created_by
    )
    VALUES (
      p_org_id,
      (v_transfer->>'item_id')::UUID,
      'transfer',
      (v_transfer->>'from_id')::UUID,
      (v_transfer->>'to_id')::UUID,
      (v_transfer->>'quantity')::INTEGER,
      v_transfer->>'reason',
      v_transfer->>'notes',
      auth.uid()
    )
    RETURNING id INTO v_event_id;

    RETURN NEXT v_event_id;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_stock(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.transfer_stock(UUID, JSONB) IS
  'Atomically execute a batch of stock transfers. Validates location org-membership, then aggregated source quantities, then inserts stock_events whose AFTER INSERT trigger updates location_stock. Returns inserted event IDs. Errors roll back the whole batch.';
