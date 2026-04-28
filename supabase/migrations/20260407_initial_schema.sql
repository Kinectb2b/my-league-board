--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: bag_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bag_status AS ENUM (
    'building',
    'built',
    'picked_up',
    'returned',
    'incomplete'
);


--
-- Name: item_condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_condition AS ENUM (
    'new',
    'good',
    'fair',
    'worn',
    'damaged',
    'broken',
    'needs_repair',
    'retired'
);


--
-- Name: item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_status AS ENUM (
    'available',
    'assigned',
    'in_repair',
    'lost',
    'retired'
);


--
-- Name: log_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.log_action AS ENUM (
    'condition_change',
    'repair_requested',
    'repair_started',
    'repair_completed',
    'replaced',
    'retired',
    'note'
);


--
-- Name: member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_role AS ENUM (
    'admin',
    'equipment_manager',
    'coach',
    'board_member',
    'volunteer',
    'safety_officer',
    'division_vp',
    'treasurer',
    'field_manager',
    'uniform_manager',
    'scheduling_manager',
    'registration_manager',
    'player_agent',
    'umpire_coordinator',
    'sponsorship_coordinator'
);


--
-- Name: replacement_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.replacement_reason AS ENUM (
    'lost',
    'broken',
    'damaged',
    'missing',
    'worn_out',
    'wrong_size',
    'other'
);


--
-- Name: role_scope_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role_scope_type AS ENUM (
    'league',
    'division',
    'team'
);


--
-- Name: stock_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_event_type AS ENUM (
    'receive',
    'transfer',
    'consume',
    'damage',
    'retire',
    'audit'
);


--
-- Name: team_bag_item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.team_bag_item_status AS ENUM (
    'active',
    'swapped_out',
    'lost',
    'damaged',
    'returned'
);


--
-- Name: ticket_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_event_type AS ENUM (
    'opened',
    'assigned',
    'unassigned',
    'status_changed',
    'priority_changed',
    'commented',
    'resolved',
    'reopened',
    'cancelled'
);


--
-- Name: ticket_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'cancelled'
);


--
-- Name: ticket_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_type AS ENUM (
    'equipment_team_bag',
    'equipment_baseroom',
    'equipment_stock_request',
    'field_condition',
    'safety_concern',
    'injury_report',
    'uniform_issue',
    'schedule_conflict',
    'umpire_issue',
    'sponsor_inquiry',
    'registration_question',
    'player_move_request',
    'general'
);


--
-- Name: apply_stock_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_stock_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  delta_from INTEGER;
BEGIN
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


--
-- Name: can_view_ticket(uuid, public.ticket_type, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_ticket(t_org_id uuid, t_type public.ticket_type, t_opened_by uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT CASE
    WHEN t_type IN ('safety_concern', 'injury_report') THEN
      auth.uid() = t_opened_by
      OR has_any_role(t_org_id, ARRAY['admin','safety_officer']::member_role[])
    ELSE
      EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.organization_id = t_org_id 
          AND om.profile_id = auth.uid()
      )
  END;
$$;


--
-- Name: fields_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fields_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;


--
-- Name: handle_new_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_org() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.organization_members (organization_id, profile_id, role)
    VALUES (NEW.id, auth.uid(), 'admin');
    RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$;


--
-- Name: has_any_role(uuid, public.member_role[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_any_role(check_org_id uuid, check_roles public.member_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = check_org_id
      AND role = ANY(check_roles)
  );
$$;


--
-- Name: has_org_role(uuid, public.member_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_org_role(org_id uuid, required_role public.member_role) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_role member_role;
BEGIN
  SELECT role INTO user_role FROM organization_members
  WHERE organization_id = org_id AND profile_id = auth.uid();
  
  IF user_role IS NULL THEN RETURN false; END IF;
  IF user_role = 'admin' THEN RETURN true; END IF;
  IF required_role = 'equipment_manager' AND user_role = 'equipment_manager' THEN RETURN true; END IF;
  IF required_role = 'coach' AND user_role IN ('equipment_manager', 'coach') THEN RETURN true; END IF;
  IF required_role = 'board_member' AND user_role IN ('equipment_manager', 'board_member') THEN RETURN true; END IF;
  IF required_role = 'volunteer' THEN RETURN true; END IF;
  
  RETURN false;
END;
$$;


--
-- Name: has_role(uuid, public.member_role, public.role_scope_type, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(check_org_id uuid, check_role public.member_role, check_scope_type public.role_scope_type DEFAULT 'league'::public.role_scope_type, check_scope_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = check_org_id
      AND role = check_role
      AND (
        scope_type = 'league'
        OR (scope_type = check_scope_type AND scope_id IS NOT DISTINCT FROM check_scope_id)
      )
  );
$$;


--
-- Name: is_org_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_member(org_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
    AND profile_id = auth.uid()
  );
END;
$$;


--
-- Name: log_ticket_comment_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_ticket_comment_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
  VALUES (NEW.ticket_id, NEW.author_id, 'commented', 
          jsonb_build_object('comment_id', NEW.id));
  RETURN NEW;
END;
$$;


--
-- Name: log_ticket_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_ticket_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
    VALUES (NEW.id, NEW.opened_by, 'opened', 
            jsonb_build_object('type', NEW.ticket_type, 'priority', NEW.priority));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
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


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: tickets_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tickets_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: transfer_stock(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_stock(p_org_id uuid, p_transfers jsonb) RETURNS SETOF uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_check    RECORD;
  v_transfer JSONB;
  v_event_id UUID;
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


--
-- Name: FUNCTION transfer_stock(p_org_id uuid, p_transfers jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.transfer_stock(p_org_id uuid, p_transfers jsonb) IS 'Atomically execute a batch of stock transfers. Two-pass: validates aggregated source quantities, then inserts stock_events whose AFTER INSERT trigger updates location_stock. Returns inserted event IDs. Errors roll back the whole batch.';


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_name text,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: background_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    profile_id uuid,
    person_name text NOT NULL,
    role text,
    submission_date date,
    approval_date date,
    expiration_date date,
    status text DEFAULT 'pending'::text,
    provider text DEFAULT 'JDP'::text,
    reference_number text,
    notes text,
    season_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT background_checks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'expired'::text, 'denied'::text])))
);


--
-- Name: bag_item_replacements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bag_item_replacements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_bag_item_id uuid NOT NULL,
    reason public.replacement_reason NOT NULL,
    description text,
    old_equipment_item_id uuid,
    new_equipment_item_id uuid,
    replaced_by uuid,
    replaced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    season_id uuid NOT NULL,
    sport_type_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    age_range text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kit_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kit_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    sport_type_id uuid,
    division_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_assign_on_team_create boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN kit_templates.auto_assign_on_team_create; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kit_templates.auto_assign_on_team_create IS 'When TRUE, application code should auto-generate a team_bag + equipment assembly ticket when a new team is created matching this template.';


--
-- Name: sport_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sport_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_bag_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_bag_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_bag_id uuid NOT NULL,
    category_id uuid NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    is_packed boolean DEFAULT false NOT NULL,
    packed_at timestamp with time zone,
    equipment_item_id uuid,
    notes text,
    status public.team_bag_item_status DEFAULT 'active'::public.team_bag_item_status NOT NULL,
    swapped_out_at timestamp with time zone,
    swap_reason text,
    replacement_item_id uuid,
    returned_at timestamp with time zone
);


--
-- Name: team_bags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_bags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    team_id uuid NOT NULL,
    kit_template_id uuid NOT NULL,
    season_id uuid NOT NULL,
    bag_tag text,
    status public.bag_status DEFAULT 'building'::public.bag_status NOT NULL,
    built_by uuid,
    built_at timestamp with time zone,
    picked_up_by_name text,
    picked_up_at timestamp with time zone,
    returned_at timestamp with time zone,
    returned_condition text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    division_id uuid NOT NULL,
    name text NOT NULL,
    head_coach_id uuid,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bag_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.bag_summary AS
 SELECT tb.id AS bag_id,
    tb.organization_id,
    t.id AS team_id,
    t.name AS team_name,
    d.name AS division_name,
    st.name AS sport_name,
    kt.id AS template_id,
    kt.name AS template_name,
    tb.status,
    tb.picked_up_by_name,
    tb.picked_up_at,
    tb.built_at,
    tb.notes AS bag_notes,
    ( SELECT count(*) AS count
           FROM public.team_bag_items
          WHERE (team_bag_items.team_bag_id = tb.id)) AS item_count,
    ( SELECT count(*) AS count
           FROM public.team_bag_items
          WHERE ((team_bag_items.team_bag_id = tb.id) AND (team_bag_items.is_packed = false))) AS items_missing
   FROM ((((public.team_bags tb
     JOIN public.teams t ON ((t.id = tb.team_id)))
     LEFT JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.sport_types st ON ((st.id = d.sport_type_id)))
     LEFT JOIN public.kit_templates kt ON ((kt.id = tb.kit_template_id)));


--
-- Name: board_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    is_required boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    assigned_to uuid,
    appointed_date date,
    term_expires date,
    is_vacant boolean GENERATED ALWAYS AS ((assigned_to IS NULL)) STORED,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: budget_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    budgeted_amount numeric(10,2) DEFAULT 0,
    season_id uuid,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT budget_categories_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: condition_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.condition_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    equipment_item_id uuid NOT NULL,
    action public.log_action NOT NULL,
    old_condition public.item_condition,
    new_condition public.item_condition,
    description text,
    reported_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: equipment_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    equipment_item_id uuid NOT NULL,
    team_id uuid,
    assigned_to_profile_id uuid,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    returned_at timestamp with time zone,
    return_condition public.item_condition,
    quantity_assigned integer DEFAULT 1 NOT NULL,
    notes text
);


--
-- Name: equipment_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    parent_category_id uuid,
    sport_type_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: equipment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    category_id uuid,
    name text NOT NULL,
    description text,
    tag_number text,
    brand text,
    model text,
    size text,
    quantity integer DEFAULT 1 NOT NULL,
    item_condition public.item_condition DEFAULT 'good'::public.item_condition NOT NULL,
    status public.item_status DEFAULT 'available'::public.item_status NOT NULL,
    storage_location_id uuid,
    sport_type_id uuid,
    purchase_date date,
    purchase_price numeric(10,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    home_location_id uuid,
    case_size integer DEFAULT 1 NOT NULL,
    CONSTRAINT equipment_items_case_size_check CHECK ((case_size >= 1))
);


--
-- Name: COLUMN equipment_items.case_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.equipment_items.case_size IS 'How many individual items come in one shipping case. Default 1. Example: dozen baseballs = 12.';


--
-- Name: location_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    storage_location_id uuid NOT NULL,
    equipment_item_id uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    target_quantity integer,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: storage_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    location_type text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_supply_room boolean DEFAULT false NOT NULL
);


--
-- Name: equipment_totals; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.equipment_totals AS
 SELECT ei.organization_id,
    ei.id AS equipment_item_id,
    ei.name AS item_name,
    ei.brand,
    ei.size,
    count(DISTINCT ls.storage_location_id) AS location_count,
    COALESCE(sum(ls.quantity), (0)::bigint) AS total_quantity,
    json_agg(json_build_object('location_id', ls.storage_location_id, 'location_name', l.name, 'quantity', ls.quantity) ORDER BY l.name) FILTER (WHERE (ls.quantity IS NOT NULL)) AS by_location
   FROM ((public.equipment_items ei
     LEFT JOIN public.location_stock ls ON ((ls.equipment_item_id = ei.id)))
     LEFT JOIN public.storage_locations l ON ((l.id = ls.storage_location_id)))
  GROUP BY ei.organization_id, ei.id, ei.name, ei.brand, ei.size;


--
-- Name: fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    field_type text,
    address text,
    lat numeric,
    lng numeric,
    status text DEFAULT 'available'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fields_field_type_check CHECK ((field_type = ANY (ARRAY['baseball'::text, 'softball'::text, 'batting_cage'::text, 'practice'::text, 'other'::text]))),
    CONSTRAINT fields_name_check CHECK ((char_length(name) > 0)),
    CONSTRAINT fields_status_check CHECK ((status = ANY (ARRAY['available'::text, 'maintenance'::text, 'closed'::text])))
);


--
-- Name: first_aid_kits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.first_aid_kits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    location text,
    last_inspected date,
    next_inspection date,
    status text DEFAULT 'good'::text,
    items_checklist jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT first_aid_kits_status_check CHECK ((status = ANY (ARRAY['good'::text, 'needs_restock'::text, 'needs_replacement'::text])))
);


--
-- Name: incident_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    "time" text,
    location text,
    reported_by uuid,
    player_name text,
    player_age integer,
    team_name text,
    injury_type text,
    description text NOT NULL,
    treatment text,
    parent_notified boolean DEFAULT false,
    medical_attention boolean DEFAULT false,
    follow_up_needed boolean DEFAULT false,
    follow_up_notes text,
    status text DEFAULT 'open'::text,
    season_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT incident_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'follow_up'::text])))
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    role public.member_role DEFAULT 'volunteer'::public.member_role NOT NULL,
    invited_by uuid NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    full_name text,
    phone text,
    board_position_id uuid,
    intended_roles text[] DEFAULT '{}'::text[],
    welcome_message text,
    email_sent_at timestamp with time zone,
    scope_type public.role_scope_type DEFAULT 'league'::public.role_scope_type NOT NULL,
    scope_id uuid
);


--
-- Name: kit_template_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kit_template_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kit_template_id uuid NOT NULL,
    category_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    notes text,
    equipment_item_id uuid
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role public.member_role DEFAULT 'volunteer'::public.member_role NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    address text,
    city text,
    state text,
    zip text,
    phone text,
    email text,
    website text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    phone text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    emergency_contact_name text,
    emergency_contact_phone text,
    shirt_size text,
    address text
);


--
-- Name: seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    start_date date,
    end_date date,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sponsors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sponsors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    contact_name text,
    contact_email text,
    contact_phone text,
    tier text,
    amount numeric(10,2),
    payment_status text DEFAULT 'pending'::text,
    season_id uuid,
    placement text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT sponsors_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text]))),
    CONSTRAINT sponsors_tier_check CHECK ((tier = ANY (ARRAY['platinum'::text, 'gold'::text, 'silver'::text, 'bronze'::text, 'supporter'::text])))
);


--
-- Name: stock_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    equipment_item_id uuid NOT NULL,
    event_type public.stock_event_type NOT NULL,
    from_location_id uuid,
    to_location_id uuid,
    quantity integer NOT NULL,
    reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT stock_events_location_check CHECK (
CASE event_type
    WHEN 'receive'::public.stock_event_type THEN ((to_location_id IS NOT NULL) AND (from_location_id IS NULL))
    WHEN 'transfer'::public.stock_event_type THEN ((from_location_id IS NOT NULL) AND (to_location_id IS NOT NULL) AND (from_location_id <> to_location_id))
    WHEN 'consume'::public.stock_event_type THEN ((from_location_id IS NOT NULL) AND (to_location_id IS NULL))
    WHEN 'damage'::public.stock_event_type THEN (from_location_id IS NOT NULL)
    WHEN 'retire'::public.stock_event_type THEN ((from_location_id IS NOT NULL) AND (to_location_id IS NULL))
    WHEN 'audit'::public.stock_event_type THEN (from_location_id IS NOT NULL)
    ELSE true
END)
);


--
-- Name: ticket_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    storage_path text NOT NULL,
    filename text NOT NULL,
    mime_type text,
    size_bytes integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_comments_body_check CHECK ((char_length(body) > 0))
);


--
-- Name: ticket_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    actor_id uuid,
    event_type public.ticket_event_type NOT NULL,
    detail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    ticket_type public.ticket_type NOT NULL,
    status public.ticket_status DEFAULT 'open'::public.ticket_status NOT NULL,
    priority public.ticket_priority DEFAULT 'normal'::public.ticket_priority NOT NULL,
    title text NOT NULL,
    description text,
    opened_by uuid NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    team_id uuid,
    division_id uuid,
    location_id uuid,
    equipment_item_id uuid,
    team_bag_item_id uuid,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolution_note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tickets_title_check CHECK ((char_length(title) > 0))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    category_id uuid,
    type text NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    vendor_or_source text,
    receipt_reference text,
    approved_by uuid,
    created_by uuid,
    season_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role public.member_role NOT NULL,
    scope_type public.role_scope_type DEFAULT 'league'::public.role_scope_type NOT NULL,
    scope_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: user_role_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_role_summary AS
 SELECT ur.user_id,
    ur.organization_id,
    p.full_name,
    p.email,
    array_agg(((ur.role)::text ||
        CASE
            WHEN (ur.scope_type <> 'league'::public.role_scope_type) THEN ((((' ('::text || (ur.scope_type)::text) || ':'::text) || COALESCE((ur.scope_id)::text, 'null'::text)) || ')'::text)
            ELSE ''::text
        END) ORDER BY (ur.role)::text) AS roles
   FROM (public.user_roles ur
     JOIN public.profiles p ON ((p.id = ur.user_id)))
  GROUP BY ur.user_id, ur.organization_id, p.full_name, p.email;


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: background_checks background_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_checks
    ADD CONSTRAINT background_checks_pkey PRIMARY KEY (id);


--
-- Name: bag_item_replacements bag_item_replacements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bag_item_replacements
    ADD CONSTRAINT bag_item_replacements_pkey PRIMARY KEY (id);


--
-- Name: board_positions board_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_positions
    ADD CONSTRAINT board_positions_pkey PRIMARY KEY (id);


--
-- Name: budget_categories budget_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_categories
    ADD CONSTRAINT budget_categories_pkey PRIMARY KEY (id);


--
-- Name: condition_log condition_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condition_log
    ADD CONSTRAINT condition_log_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_season_id_sport_type_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_season_id_sport_type_id_name_key UNIQUE (season_id, sport_type_id, name);


--
-- Name: equipment_assignments equipment_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_assignments
    ADD CONSTRAINT equipment_assignments_pkey PRIMARY KEY (id);


--
-- Name: equipment_categories equipment_categories_organization_id_name_parent_category_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_organization_id_name_parent_category_i_key UNIQUE (organization_id, name, parent_category_id);


--
-- Name: equipment_categories equipment_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_pkey PRIMARY KEY (id);


--
-- Name: equipment_items equipment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_items
    ADD CONSTRAINT equipment_items_pkey PRIMARY KEY (id);


--
-- Name: fields fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fields
    ADD CONSTRAINT fields_pkey PRIMARY KEY (id);


--
-- Name: first_aid_kits first_aid_kits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.first_aid_kits
    ADD CONSTRAINT first_aid_kits_pkey PRIMARY KEY (id);


--
-- Name: incident_reports incident_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: kit_template_items kit_template_items_kit_template_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_template_items
    ADD CONSTRAINT kit_template_items_kit_template_id_category_id_key UNIQUE (kit_template_id, category_id);


--
-- Name: kit_template_items kit_template_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_template_items
    ADD CONSTRAINT kit_template_items_pkey PRIMARY KEY (id);


--
-- Name: kit_templates kit_templates_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_templates
    ADD CONSTRAINT kit_templates_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: kit_templates kit_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_templates
    ADD CONSTRAINT kit_templates_pkey PRIMARY KEY (id);


--
-- Name: location_stock location_stock_loc_item_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_stock
    ADD CONSTRAINT location_stock_loc_item_unique UNIQUE (storage_location_id, equipment_item_id);


--
-- Name: location_stock location_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_stock
    ADD CONSTRAINT location_stock_pkey PRIMARY KEY (id);


--
-- Name: location_stock location_stock_storage_location_id_equipment_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_stock
    ADD CONSTRAINT location_stock_storage_location_id_equipment_item_id_key UNIQUE (storage_location_id, equipment_item_id);


--
-- Name: organization_members organization_members_organization_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_profile_id_key UNIQUE (organization_id, profile_id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: seasons seasons_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: sponsors sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsors
    ADD CONSTRAINT sponsors_pkey PRIMARY KEY (id);


--
-- Name: sport_types sport_types_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport_types
    ADD CONSTRAINT sport_types_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: sport_types sport_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport_types
    ADD CONSTRAINT sport_types_pkey PRIMARY KEY (id);


--
-- Name: stock_events stock_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_events
    ADD CONSTRAINT stock_events_pkey PRIMARY KEY (id);


--
-- Name: storage_locations storage_locations_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: storage_locations storage_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_pkey PRIMARY KEY (id);


--
-- Name: team_bag_items team_bag_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bag_items
    ADD CONSTRAINT team_bag_items_pkey PRIMARY KEY (id);


--
-- Name: team_bags team_bags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bags
    ADD CONSTRAINT team_bags_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: ticket_attachments ticket_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_pkey PRIMARY KEY (id);


--
-- Name: ticket_comments ticket_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: ticket_events ticket_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_events
    ADD CONSTRAINT ticket_events_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_organization_id_role_scope_type_scope_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_organization_id_role_scope_type_scope_id_key UNIQUE (user_id, organization_id, role, scope_type, scope_id);


--
-- Name: idx_activity_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_created ON public.activity_log USING btree (created_at DESC);


--
-- Name: idx_activity_log_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_org ON public.activity_log USING btree (organization_id);


--
-- Name: idx_assignments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_active ON public.equipment_assignments USING btree (returned_at) WHERE (returned_at IS NULL);


--
-- Name: idx_assignments_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_item ON public.equipment_assignments USING btree (equipment_item_id);


--
-- Name: idx_assignments_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_team ON public.equipment_assignments USING btree (team_id);


--
-- Name: idx_bag_replacements_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bag_replacements_item ON public.bag_item_replacements USING btree (team_bag_item_id);


--
-- Name: idx_condition_log_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_condition_log_item ON public.condition_log USING btree (equipment_item_id);


--
-- Name: idx_divisions_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_divisions_season ON public.divisions USING btree (season_id);


--
-- Name: idx_divisions_sport; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_divisions_sport ON public.divisions USING btree (sport_type_id);


--
-- Name: idx_equipment_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_items_category ON public.equipment_items USING btree (category_id);


--
-- Name: idx_equipment_items_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_items_location ON public.equipment_items USING btree (storage_location_id);


--
-- Name: idx_equipment_items_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_items_org ON public.equipment_items USING btree (organization_id);


--
-- Name: idx_equipment_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_items_status ON public.equipment_items USING btree (status);


--
-- Name: idx_fields_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fields_org ON public.fields USING btree (organization_id);


--
-- Name: idx_fields_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fields_status ON public.fields USING btree (status) WHERE (status <> 'available'::text);


--
-- Name: idx_invitations_board_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_board_position ON public.invitations USING btree (board_position_id) WHERE ((board_position_id IS NOT NULL) AND (accepted_at IS NULL));


--
-- Name: idx_invitations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_org ON public.invitations USING btree (organization_id);


--
-- Name: idx_invitations_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_scope ON public.invitations USING btree (scope_type, scope_id) WHERE (scope_id IS NOT NULL);


--
-- Name: idx_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_token ON public.invitations USING btree (token);


--
-- Name: idx_location_stock_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_stock_item ON public.location_stock USING btree (equipment_item_id);


--
-- Name: idx_location_stock_loc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_stock_loc ON public.location_stock USING btree (storage_location_id);


--
-- Name: idx_location_stock_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_stock_org ON public.location_stock USING btree (organization_id);


--
-- Name: idx_org_members_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_org ON public.organization_members USING btree (organization_id);


--
-- Name: idx_org_members_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_profile ON public.organization_members USING btree (profile_id);


--
-- Name: idx_seasons_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seasons_org ON public.seasons USING btree (organization_id);


--
-- Name: idx_sport_types_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sport_types_org ON public.sport_types USING btree (organization_id);


--
-- Name: idx_stock_events_from_loc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_events_from_loc ON public.stock_events USING btree (from_location_id) WHERE (from_location_id IS NOT NULL);


--
-- Name: idx_stock_events_item_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_events_item_created ON public.stock_events USING btree (equipment_item_id, created_at DESC);


--
-- Name: idx_stock_events_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_events_org ON public.stock_events USING btree (organization_id);


--
-- Name: idx_stock_events_to_loc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_events_to_loc ON public.stock_events USING btree (to_location_id) WHERE (to_location_id IS NOT NULL);


--
-- Name: idx_stock_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_events_type ON public.stock_events USING btree (event_type);


--
-- Name: idx_team_bag_items_bag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_bag_items_bag ON public.team_bag_items USING btree (team_bag_id);


--
-- Name: idx_team_bag_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_bag_items_status ON public.team_bag_items USING btree (status) WHERE (status <> 'active'::public.team_bag_item_status);


--
-- Name: idx_team_bags_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_bags_org ON public.team_bags USING btree (organization_id);


--
-- Name: idx_team_bags_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_bags_season ON public.team_bags USING btree (season_id);


--
-- Name: idx_team_bags_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_bags_team ON public.team_bags USING btree (team_id);


--
-- Name: idx_teams_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teams_division ON public.teams USING btree (division_id);


--
-- Name: idx_ticket_attachments_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_attachments_ticket ON public.ticket_attachments USING btree (ticket_id);


--
-- Name: idx_ticket_comments_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_comments_ticket ON public.ticket_comments USING btree (ticket_id, created_at);


--
-- Name: idx_ticket_events_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_events_ticket ON public.ticket_events USING btree (ticket_id, created_at);


--
-- Name: idx_tickets_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_assigned ON public.tickets USING btree (assigned_to, status) WHERE (assigned_to IS NOT NULL);


--
-- Name: idx_tickets_opened_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_opened_at ON public.tickets USING btree (opened_at DESC);


--
-- Name: idx_tickets_opened_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_opened_by ON public.tickets USING btree (opened_by);


--
-- Name: idx_tickets_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_org ON public.tickets USING btree (organization_id);


--
-- Name: idx_tickets_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_org_status ON public.tickets USING btree (organization_id, status);


--
-- Name: idx_tickets_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_team ON public.tickets USING btree (team_id) WHERE (team_id IS NOT NULL);


--
-- Name: idx_tickets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_type ON public.tickets USING btree (ticket_type);


--
-- Name: idx_user_roles_org_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_org_role ON public.user_roles USING btree (organization_id, role);


--
-- Name: idx_user_roles_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_scope ON public.user_roles USING btree (scope_type, scope_id) WHERE (scope_id IS NOT NULL);


--
-- Name: idx_user_roles_user_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_org ON public.user_roles USING btree (user_id, organization_id);


--
-- Name: uq_invitations_org_email_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_invitations_org_email_scope ON public.invitations USING btree (organization_id, email, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (accepted_at IS NULL);


--
-- Name: organizations on_org_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_org_created AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_new_org();


--
-- Name: stock_events trg_apply_stock_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_apply_stock_event AFTER INSERT ON public.stock_events FOR EACH ROW EXECUTE FUNCTION public.apply_stock_event();


--
-- Name: fields trg_fields_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fields_set_updated_at BEFORE UPDATE ON public.fields FOR EACH ROW EXECUTE FUNCTION public.fields_set_updated_at();


--
-- Name: ticket_comments trg_log_ticket_comment_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_ticket_comment_event AFTER INSERT ON public.ticket_comments FOR EACH ROW EXECUTE FUNCTION public.log_ticket_comment_event();


--
-- Name: tickets trg_log_ticket_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_ticket_event AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.log_ticket_event();


--
-- Name: tickets trg_tickets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tickets_set_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_set_updated_at();


--
-- Name: equipment_items update_equipment_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_equipment_items_updated_at BEFORE UPDATE ON public.equipment_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: location_stock update_location_stock_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_location_stock_updated_at BEFORE UPDATE ON public.location_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: team_bags update_team_bags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_team_bags_updated_at BEFORE UPDATE ON public.team_bags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: activity_log activity_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: activity_log activity_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: background_checks background_checks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_checks
    ADD CONSTRAINT background_checks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: background_checks background_checks_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_checks
    ADD CONSTRAINT background_checks_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: background_checks background_checks_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_checks
    ADD CONSTRAINT background_checks_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: bag_item_replacements bag_item_replacements_new_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bag_item_replacements
    ADD CONSTRAINT bag_item_replacements_new_equipment_item_id_fkey FOREIGN KEY (new_equipment_item_id) REFERENCES public.equipment_items(id);


--
-- Name: bag_item_replacements bag_item_replacements_old_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bag_item_replacements
    ADD CONSTRAINT bag_item_replacements_old_equipment_item_id_fkey FOREIGN KEY (old_equipment_item_id) REFERENCES public.equipment_items(id);


--
-- Name: bag_item_replacements bag_item_replacements_replaced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bag_item_replacements
    ADD CONSTRAINT bag_item_replacements_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES public.profiles(id);


--
-- Name: bag_item_replacements bag_item_replacements_team_bag_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bag_item_replacements
    ADD CONSTRAINT bag_item_replacements_team_bag_item_id_fkey FOREIGN KEY (team_bag_item_id) REFERENCES public.team_bag_items(id) ON DELETE CASCADE;


--
-- Name: board_positions board_positions_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_positions
    ADD CONSTRAINT board_positions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: board_positions board_positions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_positions
    ADD CONSTRAINT board_positions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: budget_categories budget_categories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_categories
    ADD CONSTRAINT budget_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: budget_categories budget_categories_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_categories
    ADD CONSTRAINT budget_categories_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: condition_log condition_log_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condition_log
    ADD CONSTRAINT condition_log_equipment_item_id_fkey FOREIGN KEY (equipment_item_id) REFERENCES public.equipment_items(id) ON DELETE CASCADE;


--
-- Name: condition_log condition_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condition_log
    ADD CONSTRAINT condition_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: condition_log condition_log_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condition_log
    ADD CONSTRAINT condition_log_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id);


--
-- Name: divisions divisions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: divisions divisions_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: divisions divisions_sport_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_sport_type_id_fkey FOREIGN KEY (sport_type_id) REFERENCES public.sport_types(id) ON DELETE CASCADE;


--
-- Name: equipment_assignments equipment_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_assignments
    ADD CONSTRAINT equipment_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
-- Name: equipment_assignments equipment_assignments_assigned_to_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_assignments
    ADD CONSTRAINT equipment_assignments_assigned_to_profile_id_fkey FOREIGN KEY (assigned_to_profile_id) REFERENCES public.profiles(id);


--
-- Name: equipment_assignments equipment_assignments_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_assignments
    ADD CONSTRAINT equipment_assignments_equipment_item_id_fkey FOREIGN KEY (equipment_item_id) REFERENCES public.equipment_items(id) ON DELETE CASCADE;


--
-- Name: equipment_assignments equipment_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_assignments
    ADD CONSTRAINT equipment_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: equipment_assignments equipment_assignments_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_assignments
    ADD CONSTRAINT equipment_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: equipment_categories equipment_categories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: equipment_categories equipment_categories_parent_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.equipment_categories(id);


--
-- Name: equipment_categories equipment_categories_sport_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_categories
    ADD CONSTRAINT equipment_categories_sport_type_id_fkey FOREIGN KEY (sport_type_id) REFERENCES public.sport_types(id);


--
-- Name: equipment_items equipment_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_items
    ADD CONSTRAINT equipment_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.equipment_categories(id) ON DELETE CASCADE;


--
-- Name: equipment_items equipment_items_home_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_items
    ADD CONSTRAINT equipment_items_home_location_id_fkey FOREIGN KEY (home_location_id) REFERENCES public.storage_locations(id);


--
-- Name: equipment_items equipment_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_items
    ADD CONSTRAINT equipment_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: equipment_items equipment_items_sport_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_items
    ADD CONSTRAINT equipment_items_sport_type_id_fkey FOREIGN KEY (sport_type_id) REFERENCES public.sport_types(id);


--
-- Name: equipment_items equipment_items_storage_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_items
    ADD CONSTRAINT equipment_items_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES public.storage_locations(id);


--
-- Name: fields fields_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fields
    ADD CONSTRAINT fields_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: first_aid_kits first_aid_kits_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.first_aid_kits
    ADD CONSTRAINT first_aid_kits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: incident_reports incident_reports_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: incident_reports incident_reports_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id);


--
-- Name: incident_reports incident_reports_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: invitations invitations_board_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_board_position_id_fkey FOREIGN KEY (board_position_id) REFERENCES public.board_positions(id) ON DELETE SET NULL;


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id);


--
-- Name: invitations invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: kit_template_items kit_template_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_template_items
    ADD CONSTRAINT kit_template_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.equipment_categories(id) ON DELETE CASCADE;


--
-- Name: kit_template_items kit_template_items_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_template_items
    ADD CONSTRAINT kit_template_items_equipment_item_id_fkey FOREIGN KEY (equipment_item_id) REFERENCES public.equipment_items(id);


--
-- Name: kit_template_items kit_template_items_kit_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_template_items
    ADD CONSTRAINT kit_template_items_kit_template_id_fkey FOREIGN KEY (kit_template_id) REFERENCES public.kit_templates(id) ON DELETE CASCADE;


--
-- Name: kit_templates kit_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_templates
    ADD CONSTRAINT kit_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: kit_templates kit_templates_sport_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kit_templates
    ADD CONSTRAINT kit_templates_sport_type_id_fkey FOREIGN KEY (sport_type_id) REFERENCES public.sport_types(id);


--
-- Name: location_stock location_stock_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_stock
    ADD CONSTRAINT location_stock_equipment_item_id_fkey FOREIGN KEY (equipment_item_id) REFERENCES public.equipment_items(id) ON DELETE CASCADE;


--
-- Name: location_stock location_stock_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_stock
    ADD CONSTRAINT location_stock_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: location_stock location_stock_storage_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_stock
    ADD CONSTRAINT location_stock_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES public.storage_locations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id);


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: seasons seasons_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sponsors sponsors_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsors
    ADD CONSTRAINT sponsors_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: sponsors sponsors_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsors
    ADD CONSTRAINT sponsors_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: sport_types sport_types_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport_types
    ADD CONSTRAINT sport_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: stock_events stock_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_events
    ADD CONSTRAINT stock_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: stock_events stock_events_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_events
    ADD CONSTRAINT stock_events_equipment_item_id_fkey FOREIGN KEY (equipment_item_id) REFERENCES public.equipment_items(id) ON DELETE RESTRICT;


--
-- Name: stock_events stock_events_from_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_events
    ADD CONSTRAINT stock_events_from_location_id_fkey FOREIGN KEY (from_location_id) REFERENCES public.storage_locations(id);


--
-- Name: stock_events stock_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_events
    ADD CONSTRAINT stock_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: stock_events stock_events_to_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_events
    ADD CONSTRAINT stock_events_to_location_id_fkey FOREIGN KEY (to_location_id) REFERENCES public.storage_locations(id);


--
-- Name: storage_locations storage_locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: team_bag_items team_bag_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bag_items
    ADD CONSTRAINT team_bag_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.equipment_categories(id);


--
-- Name: team_bag_items team_bag_items_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bag_items
    ADD CONSTRAINT team_bag_items_equipment_item_id_fkey FOREIGN KEY (equipment_item_id) REFERENCES public.equipment_items(id);


--
-- Name: team_bag_items team_bag_items_replacement_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bag_items
    ADD CONSTRAINT team_bag_items_replacement_item_id_fkey FOREIGN KEY (replacement_item_id) REFERENCES public.equipment_items(id);


--
-- Name: team_bag_items team_bag_items_team_bag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bag_items
    ADD CONSTRAINT team_bag_items_team_bag_id_fkey FOREIGN KEY (team_bag_id) REFERENCES public.team_bags(id) ON DELETE CASCADE;


--
-- Name: team_bags team_bags_built_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bags
    ADD CONSTRAINT team_bags_built_by_fkey FOREIGN KEY (built_by) REFERENCES public.profiles(id);


--
-- Name: team_bags team_bags_kit_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bags
    ADD CONSTRAINT team_bags_kit_template_id_fkey FOREIGN KEY (kit_template_id) REFERENCES public.kit_templates(id);


--
-- Name: team_bags team_bags_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bags
    ADD CONSTRAINT team_bags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: team_bags team_bags_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bags
    ADD CONSTRAINT team_bags_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: team_bags team_bags_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_bags
    ADD CONSTRAINT team_bags_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: teams teams_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE CASCADE;


--
-- Name: teams teams_head_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_head_coach_id_fkey FOREIGN KEY (head_coach_id) REFERENCES public.profiles(id);


--
-- Name: teams teams_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ticket_attachments ticket_attachments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_attachments ticket_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: ticket_comments ticket_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id);


--
-- Name: ticket_comments ticket_comments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_events ticket_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_events
    ADD CONSTRAINT ticket_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);


--
-- Name: ticket_events ticket_events_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_events
    ADD CONSTRAINT ticket_events_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);


--
-- Name: tickets tickets_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: tickets tickets_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_equipment_item_id_fkey FOREIGN KEY (equipment_item_id) REFERENCES public.equipment_items(id);


--
-- Name: tickets tickets_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id);


--
-- Name: tickets tickets_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);


--
-- Name: tickets tickets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);


--
-- Name: tickets tickets_team_bag_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_team_bag_item_id_fkey FOREIGN KEY (team_bag_item_id) REFERENCES public.team_bag_items(id);


--
-- Name: tickets tickets_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: transactions transactions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.budget_categories(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);


--
-- Name: user_roles user_roles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_members Admins can delete members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete members" ON public.organization_members FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: organization_members Admins can insert members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert members" ON public.organization_members FOR INSERT TO authenticated WITH CHECK ((public.has_org_role(organization_id, 'admin'::public.member_role) OR (auth.uid() IS NOT NULL)));


--
-- Name: board_positions Admins can manage board positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage board positions" ON public.board_positions USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: budget_categories Admins can manage budget_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage budget_categories" ON public.budget_categories USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: sponsors Admins can manage sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage sponsors" ON public.sponsors USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: transactions Admins can manage transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage transactions" ON public.transactions USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: organization_members Admins can update members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update members" ON public.organization_members FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: organizations Admins can update org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update org" ON public.organizations FOR UPDATE TO authenticated USING (public.has_org_role(id, 'admin'::public.member_role));


--
-- Name: equipment_assignments Admins delete assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete assignments" ON public.equipment_assignments FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: team_bag_items Admins delete bag items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete bag items" ON public.team_bag_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.team_bags tb
  WHERE ((tb.id = team_bag_items.team_bag_id) AND public.has_org_role(tb.organization_id, 'admin'::public.member_role)))));


--
-- Name: team_bags Admins delete bags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete bags" ON public.team_bags FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: equipment_categories Admins delete categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete categories" ON public.equipment_categories FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: divisions Admins delete divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete divisions" ON public.divisions FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: fields Admins delete fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete fields" ON public.fields FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: invitations Admins delete invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete invitations" ON public.invitations FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: equipment_items Admins delete items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete items" ON public.equipment_items FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: storage_locations Admins delete locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete locations" ON public.storage_locations FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: seasons Admins delete seasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete seasons" ON public.seasons FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: sport_types Admins delete sport types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete sport types" ON public.sport_types FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: location_stock Admins delete stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete stock" ON public.location_stock FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: teams Admins delete teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete teams" ON public.teams FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: kit_template_items Admins delete template items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete template items" ON public.kit_template_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.kit_templates kt
  WHERE ((kt.id = kit_template_items.kit_template_id) AND public.has_org_role(kt.organization_id, 'admin'::public.member_role)))));


--
-- Name: kit_templates Admins delete templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete templates" ON public.kit_templates FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: fields Admins manage fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage fields" ON public.fields FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: invitations Admins manage invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage invitations" ON public.invitations FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: user_roles Admins manage roles in org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage roles in org" ON public.user_roles USING (public.has_role(organization_id, 'admin'::public.member_role)) WITH CHECK (public.has_role(organization_id, 'admin'::public.member_role));


--
-- Name: seasons Admins manage seasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage seasons" ON public.seasons FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: fields Admins update fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update fields" ON public.fields FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: invitations Admins update invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update invitations" ON public.invitations FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: seasons Admins update seasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update seasons" ON public.seasons FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'admin'::public.member_role));


--
-- Name: user_roles Admins view all roles in org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all roles in org" ON public.user_roles FOR SELECT USING (public.has_role(organization_id, 'admin'::public.member_role));


--
-- Name: invitations Anyone can view by token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view by token" ON public.invitations FOR SELECT TO authenticated USING (true);


--
-- Name: invitations Coaches insert team invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches insert team invitations" ON public.invitations FOR INSERT TO authenticated WITH CHECK (((scope_type = 'team'::public.role_scope_type) AND (scope_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.organization_id = invitations.organization_id) AND (ur.role = 'coach'::public.member_role) AND (ur.scope_type = 'team'::public.role_scope_type) AND (ur.scope_id = invitations.scope_id))))));


--
-- Name: stock_events Equipment managers create events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Equipment managers create events" ON public.stock_events FOR INSERT WITH CHECK (public.has_any_role(organization_id, ARRAY['admin'::public.member_role, 'equipment_manager'::public.member_role]));


--
-- Name: equipment_assignments Managers manage assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage assignments" ON public.equipment_assignments FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: team_bag_items Managers manage bag items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage bag items" ON public.team_bag_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.team_bags tb
  WHERE ((tb.id = team_bag_items.team_bag_id) AND public.has_org_role(tb.organization_id, 'equipment_manager'::public.member_role)))));


--
-- Name: team_bags Managers manage bags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage bags" ON public.team_bags FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: equipment_categories Managers manage categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage categories" ON public.equipment_categories FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: divisions Managers manage divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage divisions" ON public.divisions FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: equipment_items Managers manage items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage items" ON public.equipment_items FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: storage_locations Managers manage locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage locations" ON public.storage_locations FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: sport_types Managers manage sport types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage sport types" ON public.sport_types FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: location_stock Managers manage stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage stock" ON public.location_stock FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: teams Managers manage teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: kit_template_items Managers manage template items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage template items" ON public.kit_template_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.kit_templates kt
  WHERE ((kt.id = kit_template_items.kit_template_id) AND public.has_org_role(kt.organization_id, 'equipment_manager'::public.member_role)))));


--
-- Name: kit_templates Managers manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers manage templates" ON public.kit_templates FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: equipment_assignments Managers update assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update assignments" ON public.equipment_assignments FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: team_bag_items Managers update bag items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update bag items" ON public.team_bag_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.team_bags tb
  WHERE ((tb.id = team_bag_items.team_bag_id) AND public.has_org_role(tb.organization_id, 'equipment_manager'::public.member_role)))));


--
-- Name: team_bags Managers update bags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update bags" ON public.team_bags FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: equipment_categories Managers update categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update categories" ON public.equipment_categories FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: divisions Managers update divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update divisions" ON public.divisions FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: equipment_items Managers update items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update items" ON public.equipment_items FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: storage_locations Managers update locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update locations" ON public.storage_locations FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: sport_types Managers update sport types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update sport types" ON public.sport_types FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: location_stock Managers update stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update stock" ON public.location_stock FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: teams Managers update teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update teams" ON public.teams FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: kit_template_items Managers update template items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update template items" ON public.kit_template_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.kit_templates kt
  WHERE ((kt.id = kit_template_items.kit_template_id) AND public.has_org_role(kt.organization_id, 'equipment_manager'::public.member_role)))));


--
-- Name: kit_templates Managers update templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update templates" ON public.kit_templates FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, 'equipment_manager'::public.member_role));


--
-- Name: activity_log Members add activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members add activity" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));


--
-- Name: condition_log Members add condition log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members add condition log" ON public.condition_log FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));


--
-- Name: board_positions Members can view board positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view board positions" ON public.board_positions FOR SELECT USING (public.is_org_member(organization_id));


--
-- Name: budget_categories Members can view budget_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view budget_categories" ON public.budget_categories FOR SELECT USING (public.is_org_member(organization_id));


--
-- Name: first_aid_kits Members can view first_aid_kits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view first_aid_kits" ON public.first_aid_kits FOR SELECT USING (public.is_org_member(organization_id));


--
-- Name: organization_members Members can view members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view members" ON public.organization_members FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: organizations Members can view org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view org" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));


--
-- Name: profiles Members can view profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view profiles" ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.organization_members om1
     JOIN public.organization_members om2 ON ((om1.organization_id = om2.organization_id)))
  WHERE ((om1.profile_id = auth.uid()) AND (om2.profile_id = profiles.id))))));


--
-- Name: sponsors Members can view sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view sponsors" ON public.sponsors FOR SELECT USING (public.is_org_member(organization_id));


--
-- Name: transactions Members can view transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view transactions" ON public.transactions FOR SELECT USING (public.is_org_member(organization_id));


--
-- Name: bag_item_replacements Members manage replacements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members manage replacements" ON public.bag_item_replacements FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.team_bag_items tbi
     JOIN public.team_bags tb ON ((tb.id = tbi.team_bag_id)))
  WHERE ((tbi.id = bag_item_replacements.team_bag_item_id) AND public.is_org_member(tb.organization_id)))));


--
-- Name: activity_log Members view activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view activity" ON public.activity_log FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: equipment_assignments Members view assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view assignments" ON public.equipment_assignments FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: team_bag_items Members view bag items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view bag items" ON public.team_bag_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.team_bags tb
  WHERE ((tb.id = team_bag_items.team_bag_id) AND public.is_org_member(tb.organization_id)))));


--
-- Name: team_bags Members view bags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view bags" ON public.team_bags FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: equipment_categories Members view categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view categories" ON public.equipment_categories FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: condition_log Members view condition log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view condition log" ON public.condition_log FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: divisions Members view divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view divisions" ON public.divisions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: fields Members view fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view fields" ON public.fields FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.organization_members om
  WHERE ((om.organization_id = fields.organization_id) AND (om.profile_id = auth.uid())))));


--
-- Name: invitations Members view invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view invitations" ON public.invitations FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: equipment_items Members view items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view items" ON public.equipment_items FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: storage_locations Members view locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view locations" ON public.storage_locations FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: bag_item_replacements Members view replacements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view replacements" ON public.bag_item_replacements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.team_bag_items tbi
     JOIN public.team_bags tb ON ((tb.id = tbi.team_bag_id)))
  WHERE ((tbi.id = bag_item_replacements.team_bag_item_id) AND public.is_org_member(tb.organization_id)))));


--
-- Name: seasons Members view seasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view seasons" ON public.seasons FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: sport_types Members view sport types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view sport types" ON public.sport_types FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: location_stock Members view stock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view stock" ON public.location_stock FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: teams Members view teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view teams" ON public.teams FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: kit_template_items Members view template items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view template items" ON public.kit_template_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.kit_templates kt
  WHERE ((kt.id = kit_template_items.kit_template_id) AND public.is_org_member(kt.organization_id)))));


--
-- Name: kit_templates Members view templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view templates" ON public.kit_templates FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


--
-- Name: stock_events Org members view stock events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org members view stock events" ON public.stock_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_members om
  WHERE ((om.organization_id = stock_events.organization_id) AND (om.profile_id = auth.uid())))));


--
-- Name: background_checks Safety roles manage background_checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Safety roles manage background_checks" ON public.background_checks TO authenticated USING ((public.has_org_role(organization_id, 'admin'::public.member_role) OR public.has_org_role(organization_id, 'safety_officer'::public.member_role)));


--
-- Name: first_aid_kits Safety roles manage first_aid_kits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Safety roles manage first_aid_kits" ON public.first_aid_kits TO authenticated USING ((public.has_org_role(organization_id, 'admin'::public.member_role) OR public.has_org_role(organization_id, 'safety_officer'::public.member_role)));


--
-- Name: incident_reports Safety roles manage incident_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Safety roles manage incident_reports" ON public.incident_reports TO authenticated USING ((public.has_org_role(organization_id, 'admin'::public.member_role) OR public.has_org_role(organization_id, 'safety_officer'::public.member_role)));


--
-- Name: background_checks Safety roles view background_checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Safety roles view background_checks" ON public.background_checks FOR SELECT TO authenticated USING ((public.has_org_role(organization_id, 'admin'::public.member_role) OR public.has_org_role(organization_id, 'safety_officer'::public.member_role)));


--
-- Name: incident_reports Safety roles view incident_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Safety roles view incident_reports" ON public.incident_reports FOR SELECT TO authenticated USING ((public.has_org_role(organization_id, 'admin'::public.member_role) OR public.has_org_role(organization_id, 'safety_officer'::public.member_role)));


--
-- Name: organizations Users can create orgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: user_roles Users view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: background_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.background_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: bag_item_replacements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bag_item_replacements ENABLE ROW LEVEL SECURITY;

--
-- Name: board_positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: condition_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.condition_log ENABLE ROW LEVEL SECURITY;

--
-- Name: divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_items ENABLE ROW LEVEL SECURITY;

--
-- Name: fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;

--
-- Name: first_aid_kits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.first_aid_kits ENABLE ROW LEVEL SECURITY;

--
-- Name: incident_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: kit_template_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kit_template_items ENABLE ROW LEVEL SECURITY;

--
-- Name: kit_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kit_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: location_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: seasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: sponsors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

--
-- Name: sport_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sport_types ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_events ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: team_bag_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_bag_items ENABLE ROW LEVEL SECURITY;

--
-- Name: team_bags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_bags ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_attachments ticket_attachments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_attachments_insert ON public.ticket_attachments FOR INSERT WITH CHECK (((auth.uid() = uploaded_by) AND (EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE ((t.id = ticket_attachments.ticket_id) AND public.can_view_ticket(t.organization_id, t.ticket_type, t.opened_by))))));


--
-- Name: ticket_attachments ticket_attachments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_attachments_select ON public.ticket_attachments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE ((t.id = ticket_attachments.ticket_id) AND public.can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)))));


--
-- Name: ticket_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_comments ticket_comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_comments_insert ON public.ticket_comments FOR INSERT WITH CHECK (((auth.uid() = author_id) AND (EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE ((t.id = ticket_comments.ticket_id) AND public.can_view_ticket(t.organization_id, t.ticket_type, t.opened_by))))));


--
-- Name: ticket_comments ticket_comments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_comments_select ON public.ticket_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE ((t.id = ticket_comments.ticket_id) AND public.can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)))));


--
-- Name: ticket_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_events ticket_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_events_select ON public.ticket_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE ((t.id = ticket_events.ticket_id) AND public.can_view_ticket(t.organization_id, t.ticket_type, t.opened_by)))));


--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets tickets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_insert ON public.tickets FOR INSERT WITH CHECK (((auth.uid() = opened_by) AND (EXISTS ( SELECT 1
   FROM public.organization_members om
  WHERE ((om.organization_id = tickets.organization_id) AND (om.profile_id = auth.uid()))))));


--
-- Name: tickets tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_select ON public.tickets FOR SELECT USING (public.can_view_ticket(organization_id, ticket_type, opened_by));


--
-- Name: tickets tickets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_update ON public.tickets FOR UPDATE USING (((auth.uid() = opened_by) OR (auth.uid() = assigned_to) OR public.has_role(organization_id, 'admin'::public.member_role)));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION apply_stock_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_stock_event() TO anon;
GRANT ALL ON FUNCTION public.apply_stock_event() TO authenticated;
GRANT ALL ON FUNCTION public.apply_stock_event() TO service_role;


--
-- Name: FUNCTION can_view_ticket(t_org_id uuid, t_type public.ticket_type, t_opened_by uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_view_ticket(t_org_id uuid, t_type public.ticket_type, t_opened_by uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_ticket(t_org_id uuid, t_type public.ticket_type, t_opened_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_ticket(t_org_id uuid, t_type public.ticket_type, t_opened_by uuid) TO service_role;


--
-- Name: FUNCTION fields_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fields_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.fields_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.fields_set_updated_at() TO service_role;


--
-- Name: FUNCTION handle_new_org(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_org() TO anon;
GRANT ALL ON FUNCTION public.handle_new_org() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_org() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_any_role(check_org_id uuid, check_roles public.member_role[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_any_role(check_org_id uuid, check_roles public.member_role[]) TO anon;
GRANT ALL ON FUNCTION public.has_any_role(check_org_id uuid, check_roles public.member_role[]) TO authenticated;
GRANT ALL ON FUNCTION public.has_any_role(check_org_id uuid, check_roles public.member_role[]) TO service_role;


--
-- Name: FUNCTION has_org_role(org_id uuid, required_role public.member_role); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_org_role(org_id uuid, required_role public.member_role) TO anon;
GRANT ALL ON FUNCTION public.has_org_role(org_id uuid, required_role public.member_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_org_role(org_id uuid, required_role public.member_role) TO service_role;


--
-- Name: FUNCTION has_role(check_org_id uuid, check_role public.member_role, check_scope_type public.role_scope_type, check_scope_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_role(check_org_id uuid, check_role public.member_role, check_scope_type public.role_scope_type, check_scope_id uuid) TO anon;
GRANT ALL ON FUNCTION public.has_role(check_org_id uuid, check_role public.member_role, check_scope_type public.role_scope_type, check_scope_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(check_org_id uuid, check_role public.member_role, check_scope_type public.role_scope_type, check_scope_id uuid) TO service_role;


--
-- Name: FUNCTION is_org_member(org_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_org_member(org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_org_member(org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_member(org_id uuid) TO service_role;


--
-- Name: FUNCTION log_ticket_comment_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_ticket_comment_event() TO anon;
GRANT ALL ON FUNCTION public.log_ticket_comment_event() TO authenticated;
GRANT ALL ON FUNCTION public.log_ticket_comment_event() TO service_role;


--
-- Name: FUNCTION log_ticket_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_ticket_event() TO anon;
GRANT ALL ON FUNCTION public.log_ticket_event() TO authenticated;
GRANT ALL ON FUNCTION public.log_ticket_event() TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION tickets_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tickets_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.tickets_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.tickets_set_updated_at() TO service_role;


--
-- Name: FUNCTION transfer_stock(p_org_id uuid, p_transfers jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.transfer_stock(p_org_id uuid, p_transfers jsonb) TO anon;
GRANT ALL ON FUNCTION public.transfer_stock(p_org_id uuid, p_transfers jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_stock(p_org_id uuid, p_transfers jsonb) TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: TABLE activity_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_log TO anon;
GRANT ALL ON TABLE public.activity_log TO authenticated;
GRANT ALL ON TABLE public.activity_log TO service_role;


--
-- Name: TABLE background_checks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.background_checks TO anon;
GRANT ALL ON TABLE public.background_checks TO authenticated;
GRANT ALL ON TABLE public.background_checks TO service_role;


--
-- Name: TABLE bag_item_replacements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bag_item_replacements TO anon;
GRANT ALL ON TABLE public.bag_item_replacements TO authenticated;
GRANT ALL ON TABLE public.bag_item_replacements TO service_role;


--
-- Name: TABLE divisions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.divisions TO anon;
GRANT ALL ON TABLE public.divisions TO authenticated;
GRANT ALL ON TABLE public.divisions TO service_role;


--
-- Name: TABLE kit_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kit_templates TO anon;
GRANT ALL ON TABLE public.kit_templates TO authenticated;
GRANT ALL ON TABLE public.kit_templates TO service_role;


--
-- Name: TABLE sport_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sport_types TO anon;
GRANT ALL ON TABLE public.sport_types TO authenticated;
GRANT ALL ON TABLE public.sport_types TO service_role;


--
-- Name: TABLE team_bag_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_bag_items TO anon;
GRANT ALL ON TABLE public.team_bag_items TO authenticated;
GRANT ALL ON TABLE public.team_bag_items TO service_role;


--
-- Name: TABLE team_bags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_bags TO anon;
GRANT ALL ON TABLE public.team_bags TO authenticated;
GRANT ALL ON TABLE public.team_bags TO service_role;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teams TO anon;
GRANT ALL ON TABLE public.teams TO authenticated;
GRANT ALL ON TABLE public.teams TO service_role;


--
-- Name: TABLE bag_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bag_summary TO anon;
GRANT ALL ON TABLE public.bag_summary TO authenticated;
GRANT ALL ON TABLE public.bag_summary TO service_role;


--
-- Name: TABLE board_positions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.board_positions TO anon;
GRANT ALL ON TABLE public.board_positions TO authenticated;
GRANT ALL ON TABLE public.board_positions TO service_role;


--
-- Name: TABLE budget_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.budget_categories TO anon;
GRANT ALL ON TABLE public.budget_categories TO authenticated;
GRANT ALL ON TABLE public.budget_categories TO service_role;


--
-- Name: TABLE condition_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.condition_log TO anon;
GRANT ALL ON TABLE public.condition_log TO authenticated;
GRANT ALL ON TABLE public.condition_log TO service_role;


--
-- Name: TABLE equipment_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.equipment_assignments TO anon;
GRANT ALL ON TABLE public.equipment_assignments TO authenticated;
GRANT ALL ON TABLE public.equipment_assignments TO service_role;


--
-- Name: TABLE equipment_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.equipment_categories TO anon;
GRANT ALL ON TABLE public.equipment_categories TO authenticated;
GRANT ALL ON TABLE public.equipment_categories TO service_role;


--
-- Name: TABLE equipment_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.equipment_items TO anon;
GRANT ALL ON TABLE public.equipment_items TO authenticated;
GRANT ALL ON TABLE public.equipment_items TO service_role;


--
-- Name: TABLE location_stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.location_stock TO anon;
GRANT ALL ON TABLE public.location_stock TO authenticated;
GRANT ALL ON TABLE public.location_stock TO service_role;


--
-- Name: TABLE storage_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.storage_locations TO anon;
GRANT ALL ON TABLE public.storage_locations TO authenticated;
GRANT ALL ON TABLE public.storage_locations TO service_role;


--
-- Name: TABLE equipment_totals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.equipment_totals TO anon;
GRANT ALL ON TABLE public.equipment_totals TO authenticated;
GRANT ALL ON TABLE public.equipment_totals TO service_role;


--
-- Name: TABLE fields; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fields TO anon;
GRANT ALL ON TABLE public.fields TO authenticated;
GRANT ALL ON TABLE public.fields TO service_role;


--
-- Name: TABLE first_aid_kits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.first_aid_kits TO anon;
GRANT ALL ON TABLE public.first_aid_kits TO authenticated;
GRANT ALL ON TABLE public.first_aid_kits TO service_role;


--
-- Name: TABLE incident_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incident_reports TO anon;
GRANT ALL ON TABLE public.incident_reports TO authenticated;
GRANT ALL ON TABLE public.incident_reports TO service_role;


--
-- Name: TABLE invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invitations TO anon;
GRANT ALL ON TABLE public.invitations TO authenticated;
GRANT ALL ON TABLE public.invitations TO service_role;


--
-- Name: TABLE kit_template_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kit_template_items TO anon;
GRANT ALL ON TABLE public.kit_template_items TO authenticated;
GRANT ALL ON TABLE public.kit_template_items TO service_role;


--
-- Name: TABLE organization_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_members TO anon;
GRANT ALL ON TABLE public.organization_members TO authenticated;
GRANT ALL ON TABLE public.organization_members TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE seasons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seasons TO anon;
GRANT ALL ON TABLE public.seasons TO authenticated;
GRANT ALL ON TABLE public.seasons TO service_role;


--
-- Name: TABLE sponsors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sponsors TO anon;
GRANT ALL ON TABLE public.sponsors TO authenticated;
GRANT ALL ON TABLE public.sponsors TO service_role;


--
-- Name: TABLE stock_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_events TO anon;
GRANT ALL ON TABLE public.stock_events TO authenticated;
GRANT ALL ON TABLE public.stock_events TO service_role;


--
-- Name: TABLE ticket_attachments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_attachments TO anon;
GRANT ALL ON TABLE public.ticket_attachments TO authenticated;
GRANT ALL ON TABLE public.ticket_attachments TO service_role;


--
-- Name: TABLE ticket_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_comments TO anon;
GRANT ALL ON TABLE public.ticket_comments TO authenticated;
GRANT ALL ON TABLE public.ticket_comments TO service_role;


--
-- Name: TABLE ticket_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_events TO anon;
GRANT ALL ON TABLE public.ticket_events TO authenticated;
GRANT ALL ON TABLE public.ticket_events TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tickets TO anon;
GRANT ALL ON TABLE public.tickets TO authenticated;
GRANT ALL ON TABLE public.tickets TO service_role;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transactions TO anon;
GRANT ALL ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE user_role_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_role_summary TO anon;
GRANT ALL ON TABLE public.user_role_summary TO authenticated;
GRANT ALL ON TABLE public.user_role_summary TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--




--
-- Cluster-level wiring (added manually; not captured by `pg_dump --schema public`).
-- Restores the event trigger that auto-enables RLS on newly-created public tables,
-- and the auth.users trigger that creates a profiles row on signup.
--

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
