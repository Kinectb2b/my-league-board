// Position → role mapping for auto-granting user_roles on board assignment
// When a person is assigned to (or accepts an invite for) a board position,
// these roles get added to user_roles automatically.

export const POSITION_TO_ROLES = {
  'President': ['admin'],
  'Secretary': ['admin'],
  'Treasurer': ['treasurer'],
  'VP of Tee Ball and Pee Wee': ['division_vp'],
  'VP of Minor Baseball': ['division_vp'],
  'VP of Major and Junior Baseball': ['division_vp'],
  'VP of Minor Softball': ['division_vp'],
  'VP of Major and Junior Softball': ['division_vp'],
  'VP of Challengers': ['division_vp'],
  'Player Agent': ['player_agent'],
  'Umpire In Chief': ['umpire_coordinator'],
  'Equipment Manager': ['equipment_manager'],
  'Safety Officer': ['safety_officer'],
  'Groundskeeping and Facilities': ['field_manager'],
  'Sponsorships and Fundraising': ['sponsorship_coordinator'],
  'Uniform Manager': ['uniform_manager'],
  'Scheduling Manager': ['scheduling_manager'],
  'Registration': ['registration_manager'],
  'Board Member at Large (Seat 1)': ['board_member'],
  'Board Member at Large (Seat 2)': ['board_member'],
  'Board Member at Large (Seat 3)': ['board_member'],
  'Board Member at Large (Seat 4)': ['board_member'],
  'Board Member at Large (Seat 5)': ['board_member'],
  'Board Member at Large (Seat 6)': ['board_member'],
  'Board Member at Large (Seat 7)': ['board_member'],
  'Board Member at Large (Seat 8)': ['board_member'],
}

export function getRolesForPosition(title) {
  return POSITION_TO_ROLES[title] || ['board_member']
}

// Grouping for the Board Directory UI
// Positions are matched by title; "at large" catches any remaining
export const POSITION_CATEGORIES = [
  {
    name: 'Executive',
    titles: ['President', 'Secretary', 'Treasurer'],
  },
  {
    name: 'Division vice presidents',
    titles: [
      'VP of Tee Ball and Pee Wee',
      'VP of Minor Baseball',
      'VP of Major and Junior Baseball',
      'VP of Minor Softball',
      'VP of Major and Junior Softball',
      'VP of Challengers',
    ],
  },
  {
    name: 'Functional managers',
    titles: [
      'Player Agent',
      'Umpire In Chief',
      'Equipment Manager',
      'Safety Officer',
      'Groundskeeping and Facilities',
      'Sponsorships and Fundraising',
      'Uniform Manager',
      'Scheduling Manager',
      'Registration',
    ],
  },
  {
    name: 'Board members at large',
    // Matches by prefix rather than exact title
    matcher: (title) => title.startsWith('Board Member at Large'),
  },
]

// Given a flat array of positions, return them grouped by category
export function groupPositions(positions) {
  const groups = []
  const placed = new Set()

  for (const cat of POSITION_CATEGORIES) {
    const matched = positions.filter((p) => {
      if (placed.has(p.id)) return false
      if (cat.titles) return cat.titles.includes(p.title)
      if (cat.matcher) return cat.matcher(p.title)
      return false
    })
    // Sort within group by the category's title order, or by sort_order
    if (cat.titles) {
      matched.sort((a, b) => cat.titles.indexOf(a.title) - cat.titles.indexOf(b.title))
    } else {
      matched.sort((a, b) => a.sort_order - b.sort_order)
    }
    matched.forEach((p) => placed.add(p.id))
    if (matched.length > 0) {
      groups.push({ name: cat.name, positions: matched })
    }
  }

  // Any positions that didn't match a category
  const uncategorized = positions.filter((p) => !placed.has(p.id))
  if (uncategorized.length > 0) {
    groups.push({ name: 'Other', positions: uncategorized })
  }

  return groups
}
