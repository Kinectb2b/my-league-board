import { getAssigneeRoleForType } from './ticketRouting'

/**
 * After a team is created, check if a matching kit_template with
 * auto_assign_on_team_create exists. If so, create a team_bag in
 * 'building' status and open an equipment_team_bag ticket.
 *
 * @param {object} supabase - Supabase client
 * @param {object} team - The newly created team row (must have id, organization_id, division_id, name)
 * @returns {{ status: string, data?: object }}
 */
export async function autoAssignBagForNewTeam(supabase, team) {
  try {
    const orgId = team.organization_id

    // Step 1: Get the team's division to know sport_type_id and division name
    const { data: division, error: divErr } = await supabase
      .from('divisions')
      .select('id, name, sport_type_id')
      .eq('id', team.division_id)
      .single()

    if (divErr || !division) {
      return { status: 'error', data: { error: divErr || new Error('Division not found') } }
    }

    // Step 2: Find matching kit_templates
    const { data: matchingTemplates, error: tmplErr } = await supabase
      .from('kit_templates')
      .select('id, name, division_name, kit_template_items(id)')
      .eq('organization_id', orgId)
      .eq('sport_type_id', division.sport_type_id)
      .eq('auto_assign_on_team_create', true)

    if (tmplErr) {
      return { status: 'error', data: { error: tmplErr } }
    }

    // Filter by division_name (case-insensitive, trimmed)
    const divNameLower = division.name.trim().toLowerCase()
    const matched = (matchingTemplates || []).filter(
      t => t.division_name && t.division_name.trim().toLowerCase() === divNameLower
    )

    if (matched.length === 0) {
      return { status: 'no_template' }
    }

    if (matched.length > 1) {
      return { status: 'multiple_templates', data: { templates: matched } }
    }

    const template = matched[0]

    // Step 3: Find the current active season
    const { data: activeSeason } = await supabase
      .from('seasons')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!activeSeason) {
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
      return { status: 'error', data: { error: bagErr } }
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
    const itemCount = template.kit_template_items?.length || 0
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
      // Bag was created but ticket failed — still partially successful
      return { status: 'error', data: { error: ticketErr, teamBag } }
    }

    return { status: 'success', data: { teamBag, ticket } }
  } catch (err) {
    return { status: 'error', data: { error: err } }
  }
}
