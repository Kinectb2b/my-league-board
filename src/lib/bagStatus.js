// Canonical bag-status configuration matching the live `bag_status` enum:
//   building   — being assembled
//   built      — ready for pickup
//   picked_up  — out with the team
//   returned   — end-of-season, returned to inventory
//   incomplete — side-state for missing items (not part of the primary lifecycle)
//
// Source of truth for status labels and chip colors. Never hardcode a label
// or color in a page; import from here.

export const BAG_STATUSES = ['building', 'built', 'picked_up', 'returned', 'incomplete']

export const BAG_STATUS_CONFIG = {
  building:   { label: 'Building',         color: '#f97316', bg: '#ffedd5' },
  built:      { label: 'Ready for pickup', color: '#3b82f6', bg: '#dbeafe' },
  picked_up:  { label: 'Picked up',        color: '#8b5cf6', bg: '#ede9fe' },
  returned:   { label: 'Returned',         color: '#16a34a', bg: '#d4edda' },
  incomplete: { label: 'Incomplete',       color: '#d97706', bg: '#fef3c7' },
}

// Primary lifecycle progression. `incomplete` is reachable from `built` or
// `picked_up` as a side-state, not part of the primary flow.
export const BAG_LIFECYCLE_STAGES = ['building', 'built', 'picked_up', 'returned']

// Filter dropdown options including the side-state.
export const BAG_FILTER_OPTIONS = [
  { value: '',           label: 'All statuses' },
  { value: 'building',   label: 'Building' },
  { value: 'built',      label: 'Ready for pickup' },
  { value: 'picked_up',  label: 'Picked up' },
  { value: 'returned',   label: 'Returned' },
  { value: 'incomplete', label: 'Incomplete' },
]

export function getBagStatusConfig(status) {
  return BAG_STATUS_CONFIG[status] || BAG_STATUS_CONFIG.building
}
