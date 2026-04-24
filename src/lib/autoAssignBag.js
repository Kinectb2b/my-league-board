import { getAssigneeRoleForType } from './ticketRouting'

/**
 * After a team is created, check if a matching kit_template with
 * auto_assign_on_team_create exists. If so, create a team_bag in
 * 'building' status, populate team_bag_items from the template,
 * and open an equipment_team_bag ticket.
 *
 * @param {object} supabase - Supabase client
 * @param {object} team - The newly created team row (must have id, organization_id, division_id, name)
 * @returns {{ status: string, data?: object }}
 */
export async function autoAssignBagForNewTeam(supabase, team) {
  try {
    const orgId = team.organization_id
    console.log('[autoAssignBag] Starting for team:', team.name, 'id:', team.id, 'division_id:', team.division_id)

    // Step 1: Get the team's division to know sport_type_id and division name
    const { data: division, error: divErr } = await supabase
      .from('divisions')
      .select('id, name, sport_type_id')
      .eq('id', team.division_id)
      .single()

    if (divErr || !division) {
      console.error('[autoAssignBag] Division lookup failed:', divErr || 'not found', 'division_id:', team.division_id)
      return { status: 'error', data: { error: divErr || new Error('Division not found for id: ' + team.division_id) } }
    }
    console.log('[autoAssignBag] Division:', division.name, 'sport_type_id:', division.sport_type_id)

    // Step 2: Find matching kit_templates
    const { data: matchingTemplates, error: tmplErr } = await supabase
      .from('kit_templates')
      .select('id, name, division_name, kit_template_items(id, category_id, equipment_item_id, is_required, notes)')
      .eq('organization_id', orgId)
      .eq('sport_type_id', division.sport_type_id)
      .eq('auto_assign_on_team_create', true)

    if (tmplErr) {
      console.error('[autoAssignBag] Template query failed:', tmplErr)
      return { status: 'error', data: { error: tmplErr } }
    }
    console.log('[autoAssignBag] Templates with auto_assign + matching sport:', (matchingTemplates || []).map(t => `${t.name} (division_name="${t.division_name}")`))

    // Filter by division_name (case-insensitive, trimmed)
    // Also match templates with no division_name set (apply to all divisions in the sport)
    const divNameLower = division.name.trim().toLowerCase()
    const matched = (matchingTemplates || []).filter(
      t => !t.division_name || t.division_name.trim().toLowerCase() === divNameLower
    )

    console.log('[autoAssignBag] After division_name filter (looking for "' + division.name + '"):', matched.length, 'matches')

    if (matched.length === 0) {
      console.log('[autoAssignBag] No matching template found — skipping bag assignment')
      return { status: 'no_template' }
    }

    if (matched.length > 1) {
      // Prefer exact division match over null division_name
      const exactMatch = matched.filter(t => t.division_name && t.division_name.trim().toLowerCase() === divNameLower)
      if (exactMatch.length === 1) {
        matched.length = 0
        matched.push(exactMatch[0])
      } else {
        console.warn('[autoAssignBag] Multiple templates match:', matched.map(t => t.name))
        return { status: 'multiple_templates', data: { templates: matched } }
      }
    }

    const template = matched[0]
    console.log('[autoAssignBag] Using template:', template.name, 'with', template.kit_template_items?.length || 0, 'items')

    // Step 3: Find the current active season
    const { data: activeSeason } = await supabase
      .from('seasons')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!activeSeason) {
      console.warn('[autoAssignBag] No active season found for org:', orgId)
      return { status: 'no_active_season' }
    }

    // Step 4: Create team_bag
    const { data: teamBag, error: bagErr } = await supabase
      .from('team_bags')
      .insert({
        organization_id: orgId,
        team_id: team.id,
        kit_template_id: template.id,
        season_id: activeSeason.id,
        status: 'building'
      })
      .select()
      .single()

    if (bagErr) {
      console.error('[autoAssignBag] team_bags insert failed:', bagErr)
      return { status: 'error', data: { error: bagErr } }
    }
    console.log('[autoAssignBag] Created team_bag:', teamBag.id)

    // Step 4b: Populate team_bag_items from template
    const templateItems = template.kit_template_items || []
    if (templateItems.length > 0) {
      const bagItems = templateItems.map(ti => ({
        team_bag_id: teamBag.id,
        category_id: ti.category_id,
        equipment_item_id: ti.equipment_item_id,
        is_required: ti.is_required,
        is_packed: false,
        notes: ti.notes
      }))
      const { error: itemsErr } = await supabase.from('team_bag_items').insert(bagItems)
      if (itemsErr) {
        console.error('[autoAssignBag] team_bag_items insert failed:', itemsErr)
        // Bag exists but items failed — continue to ticket creation
      } else {
        console.log('[autoAssignBag] Inserted', bagItems.length, 'bag items')
      }
    }

    // Step 5: Find equipment_manager for auto-assignment
    const role = getAssigneeRoleForType('equipment_team_bag')
    let assignedTo = null
    if (role) {
      const { data: roleHolders } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', orgId)
        .eq('role', role)
      if (roleHolders?.length === 1) {
        assignedTo = roleHolders[0].user_id
      }
    }

    // Step 6: Create ticket
    const itemCount = templateItems.length
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .insert({
        organization_id: orgId,
        ticket_type: 'equipment_team_bag',
        status: 'open',
        priority: 'normal',
        title: `Assemble ${template.name} for ${team.name}`,
        description: `Bag assembly auto-requested on team creation. Template: ${template.name}. Number of items to pack: ${itemCount}.`,
        opened_by: (await supabase.auth.getUser()).data?.user?.id || null,
        assigned_to: assignedTo,
        assigned_at: assignedTo ? new Date().toISOString() : null,
        team_id: team.id
      })
      .select()
      .single()

    if (ticketErr) {
      console.error('[autoAssignBag] ticket insert failed:', ticketErr)
      return { status: 'error', data: { error: ticketErr, teamBag } }
    }

    console.log('[autoAssignBag] Success — bag:', teamBag.id, 'ticket:', ticket.id)
    return { status: 'success', data: { teamBag, ticket } }
  } catch (err) {
    console.error('[autoAssignBag] Uncaught error:', err)
    return { status: 'error', data: { error: err } }
  }
}
