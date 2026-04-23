-- Add parent_category_id to equipment_categories for hierarchical nesting
ALTER TABLE equipment_categories
  ADD COLUMN IF NOT EXISTS parent_category_id uuid REFERENCES equipment_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_categories_parent
  ON equipment_categories(parent_category_id);
