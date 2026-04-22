-- =====================================================================
-- Migration 3: Tickets + team bag swap tracking
-- Purpose: Replace text messages and group chats with a trackable
--          ticketing system. Supports equipment issues, field/grounds
--          concerns, safety reports, injury reports, and general
--          league requests. Adds swap-lifecycle tracking to team bags.
--
-- APPLY: Paste as single block into Supabase SQL Editor → Run.
-- =====================================================================

-- =========== ENUMS ===========

DO $$ BEGIN
  CREATE TYPE ticket_type AS ENUM (
    'equipment_team_bag',       -- coach reports issue with gear in their team bag
    'equipment_baseroom',       -- issue with equipment at a baseroom
    'equipment_stock_request',  -- request for more stock somewhere
    'field_condition',          -- field/grounds maintenance issue
    'safety_concern',           -- general safety report (SENSITIVE)
    'injury_report',            -- player/volunteer injury (SENSITIVE)
    'uniform_issue',            -- uniform-related issue
    'schedule_conflict',        -- scheduling/field-reservation issue
    'umpire_issue',             -- umpire issue (no-show, gear, etc.)
    'sponsor_inquiry',          -- sponsor-related inquiry
    'registration_question',    -- registration issue
    'player_move_request',      -- request to move player between teams
    'general'                   -- anything else (triaged by admin)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'open', 'in_progress', 'resolved', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM (
    'low', 'normal', 'high', 'urgent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_event_type AS ENUM (
    'opened', 'assigned', 'unassigned', 'status_changed',
    'priority_changed', 'commented', 'resolved', 'reopened', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE team_bag_item_status AS ENUM (
    'active',        -- in the bag, currently in use
    'swapped_out',   -- removed from the bag, replaced
    'lost',          -- reported missing
    'damaged',       -- broken but not yet replaced/retired
    'returned'       -- returned at end of season
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========== TICKETS ===========

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Classification
  ticket_type ticket_type NOT NULL,
  status ticket_status NOT NULL DEFAULT 'open',
  priority ticket_priority NOT NULL DEFAULT 'normal',

  -- Content
  title TEXT NOT NULL CHECK (char_length(title) > 0),
  description TEXT,

  -- Ownership
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,

  -- Optional context relations (set based on ticket type)
  team_id UUID REFERENCES teams(id),
  division_id UUID REFERENCES divisions(id),
  location_id UUID REFERENCES storage_locations(id),
  equipment_item_id UUID REFERENCES equipment_items(id),
  team_bag_item_id UUID REFERENCES team_bag_items(id),

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_org_status ON tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_opened_by ON tickets(opened_by);
CREATE INDEX IF NOT EXISTS idx_tickets_team ON tickets(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_opened_at ON tickets(opened_at DESC);

-- =========== TICKET COMMENTS ===========

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL CHECK (char_length(body) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at);

-- =========== TICKET ATTACHMENTS ===========
-- Stores metadata only. Actual files live in Supabase Storage bucket
-- 'ticket-attachments' (create manually in dashboard after this migration).

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  storage_path TEXT NOT NULL,  -- path within the storage bucket
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);

-- =========== TICKET EVENTS (audit log) ===========

CREATE TABLE IF NOT EXISTS ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  event_type ticket_event_type NOT NULL,
  detail JSONB,  -- e.g. {"from": "open", "to": "in_progress"}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, created_at);

-- =========== TEAM BAG ITEM ENHANCEMENTS ===========

ALTER TABLE team_bag_items
  ADD COLUMN IF NOT EXISTS status team_bag_item_status NOT NULL DEFAULT 'active';

ALTER TABLE team_bag_items
  ADD COLUMN IF NOT EXISTS swapped_out_at TIMESTAMPTZ;

ALTER TABLE team_bag_items
  ADD COLUMN IF NOT EXISTS swap_reason TEXT;

ALTER TABLE team_bag_items
  ADD COLUMN IF NOT EXISTS replacement_item_id UUID REFERENCES equipment_items(id);

ALTER TABLE team_bag_items
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_team_bag_items_status ON team_bag_items(status) WHERE status != 'active';

-- =========== KIT TEMPLATE ENHANCEMENT ===========

ALTER TABLE kit_templates
  ADD COLUMN IF NOT EXISTS auto_assign_on_team_create BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN kit_templates.auto_assign_on_team_create IS
  'When TRUE, application code should auto-generate a team_bag + equipment assembly ticket when a new team is created matching this template.';

-- =========== VISIBILITY HELPER ===========

CREATE OR REPLACE FUNCTION can_view_ticket(
  t_org_id UUID,
  t_type ticket_type,
  t_opened_by UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT CASE
    -- Sensitive types: opener, admins, safety officers only
    WHEN t_type IN ('safety_concern', 'injury_report') THEN
      auth.uid() = t_opened_by
      OR has_any_role(t_org_id, ARRAY['admin','safety_officer']::member_role[])
    -- All other types: any org member
    ELSE
      EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.organization_id = t_org_id
          AND om.profile_id = auth.uid()
      )
  END;
$$;

-- =========== RLS: TICKETS ===========

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_select" ON tickets;
CREATE POLICY "tickets_select" ON tickets FOR SELECT
  USING (can_view_ticket(organization_id, ticket_type, opened_by));

DROP POLICY IF EXISTS "tickets_insert" ON tickets;
CREATE POLICY "tickets_insert" ON tickets FOR INSERT
  WITH CHECK (
    -- Opener must be the auth user
    auth.uid() = opened_by
    AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = tickets.organization_id
        AND om.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tickets_update" ON tickets;
CREATE POLICY "tickets_update" ON tickets FOR UPDATE
  USING (
    auth.uid() = opened_by
    OR auth.uid() = assigned_to
    OR has_role(organization_id, 'admin'::member_role)
  );

-- No DELETE policy — tickets are not deletable. Use status='cancelled' instead.

-- =========== RLS: TICKET COMMENTS ===========

ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_comments_select" ON ticket_comments;
CREATE POLICY "ticket_comments_select" ON ticket_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)
    )
  );

DROP POLICY IF EXISTS "ticket_comments_insert" ON ticket_comments;
CREATE POLICY "ticket_comments_insert" ON ticket_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)
    )
  );

-- =========== RLS: TICKET ATTACHMENTS ===========

ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_attachments_select" ON ticket_attachments;
CREATE POLICY "ticket_attachments_select" ON ticket_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_attachments.ticket_id
        AND can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)
    )
  );

DROP POLICY IF EXISTS "ticket_attachments_insert" ON ticket_attachments;
CREATE POLICY "ticket_attachments_insert" ON ticket_attachments FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_attachments.ticket_id
        AND can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)
    )
  );

-- =========== RLS: TICKET EVENTS ===========

ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_events_select" ON ticket_events;
CREATE POLICY "ticket_events_select" ON ticket_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_events.ticket_id
        AND can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)
    )
  );

-- ticket_events are inserted by triggers (SECURITY DEFINER), so no
-- INSERT policy for end users.

-- =========== TRIGGERS ===========

-- Trigger 1: bump tickets.updated_at on any update
CREATE OR REPLACE FUNCTION tickets_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_set_updated_at ON tickets;
CREATE TRIGGER trg_tickets_set_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION tickets_set_updated_at();

-- Trigger 2: log ticket lifecycle events
CREATE OR REPLACE FUNCTION log_ticket_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- On INSERT: log 'opened'
  IF TG_OP = 'INSERT' THEN
    INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
    VALUES (NEW.id, NEW.opened_by, 'opened',
            jsonb_build_object('type', NEW.ticket_type, 'priority', NEW.priority));
    RETURN NEW;
  END IF;

  -- On UPDATE: log specific state changes
  IF TG_OP = 'UPDATE' THEN
    -- Status change
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
      VALUES (
        NEW.id,
        auth.uid(),
        CASE NEW.status
          WHEN 'resolved' THEN 'resolved'::ticket_event_type
          WHEN 'cancelled' THEN 'cancelled'::ticket_event_type
          WHEN 'open' THEN (CASE WHEN OLD.status = 'resolved' OR OLD.status = 'cancelled'
                                  THEN 'reopened'::ticket_event_type
                                  ELSE 'status_changed'::ticket_event_type END)
          ELSE 'status_changed'::ticket_event_type
        END,
        jsonb_build_object('from', OLD.status, 'to', NEW.status)
      );
    END IF;

    -- Assignment change
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
      VALUES (
        NEW.id,
        auth.uid(),
        CASE WHEN NEW.assigned_to IS NULL THEN 'unassigned'::ticket_event_type
             ELSE 'assigned'::ticket_event_type END,
        jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to)
      );
    END IF;

    -- Priority change
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
      VALUES (
        NEW.id,
        auth.uid(),
        'priority_changed',
        jsonb_build_object('from', OLD.priority, 'to', NEW.priority)
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ticket_event ON tickets;
CREATE TRIGGER trg_log_ticket_event
AFTER INSERT OR UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION log_ticket_event();

-- Trigger 3: log ticket_comment events
CREATE OR REPLACE FUNCTION log_ticket_comment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
  VALUES (NEW.ticket_id, NEW.author_id, 'commented',
          jsonb_build_object('comment_id', NEW.id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ticket_comment_event ON ticket_comments;
CREATE TRIGGER trg_log_ticket_comment_event
AFTER INSERT ON ticket_comments
FOR EACH ROW
EXECUTE FUNCTION log_ticket_comment_event();

-- =====================================================================
-- END MIGRATION 3
-- =====================================================================
