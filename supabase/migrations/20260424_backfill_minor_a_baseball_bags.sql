-- Backfill: create team_bags + team_bag_items for Minor A Baseball teams
-- in Demotte (org 02747fa0-d336-4ff2-a5b1-b76937f7d641) that were created
-- before auto_assign_on_team_create was enabled on the kit_template.
--
-- Affected teams: Meyers, Mifflin, Osborn, Ridder, Schultz

DO $$
DECLARE
  v_org_id UUID := '02747fa0-d336-4ff2-a5b1-b76937f7d641';
  v_template_id UUID;
  v_season_id UUID;
  v_team RECORD;
  v_bag_id UUID;
BEGIN
  -- Find the auto-assign template for Minor A Baseball in this org
  SELECT kt.id INTO v_template_id
  FROM kit_templates kt
  JOIN sport_types st ON st.id = kt.sport_type_id
  WHERE kt.organization_id = v_org_id
    AND kt.auto_assign_on_team_create = TRUE
    AND st.name ILIKE 'Baseball'
    AND kt.division_name ILIKE 'Minor A'
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'No matching kit_template found for Minor A Baseball in org %', v_org_id;
  END IF;

  -- Find the active season
  SELECT id INTO v_season_id
  FROM seasons
  WHERE organization_id = v_org_id AND is_active = TRUE
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season found for org %', v_org_id;
  END IF;

  -- Loop through Minor A Baseball teams that don't already have a bag
  FOR v_team IN
    SELECT t.id, t.name
    FROM teams t
    JOIN divisions d ON d.id = t.division_id
    JOIN sport_types st ON st.id = d.sport_type_id
    WHERE t.organization_id = v_org_id
      AND st.name ILIKE 'Baseball'
      AND d.name ILIKE 'Minor A'
      AND NOT EXISTS (
        SELECT 1 FROM team_bags tb
        WHERE tb.team_id = t.id AND tb.season_id = v_season_id
      )
  LOOP
    -- Create team_bag
    INSERT INTO team_bags (organization_id, team_id, kit_template_id, season_id, status)
    VALUES (v_org_id, v_team.id, v_template_id, v_season_id, 'building')
    RETURNING id INTO v_bag_id;

    -- Populate team_bag_items from template
    INSERT INTO team_bag_items (team_bag_id, category_id, equipment_item_id, is_required, is_packed, notes)
    SELECT v_bag_id, kti.category_id, kti.equipment_item_id, kti.is_required, FALSE, kti.notes
    FROM kit_template_items kti
    WHERE kti.kit_template_id = v_template_id;

    RAISE NOTICE 'Created bag % for team % (%)', v_bag_id, v_team.name, v_team.id;
  END LOOP;
END $$;
