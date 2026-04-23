-- Add board-position and multi-role fields to invitations
-- so we can auto-wire position assignment + role grants on acceptance.
--
-- APPLY: Run in the Supabase SQL Editor as a single query.

-- New columns
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS board_position_id UUID REFERENCES board_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intended_roles TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS welcome_message TEXT;

-- Index for looking up pending invites by position
CREATE INDEX IF NOT EXISTS idx_invitations_board_position
  ON invitations(board_position_id)
  WHERE board_position_id IS NOT NULL AND accepted_at IS NULL;
