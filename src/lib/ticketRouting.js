export const TICKET_TYPES = [
  { value: 'equipment_team_bag',      label: 'Team Bag Issue',       defaultAssigneeRole: 'equipment_manager',       icon: '🎒', isSensitive: false },
  { value: 'equipment_baseroom',      label: 'Baseroom Issue',       defaultAssigneeRole: 'equipment_manager',       icon: '🏠', isSensitive: false },
  { value: 'equipment_stock_request', label: 'Stock Request',        defaultAssigneeRole: 'equipment_manager',       icon: '📦', isSensitive: false },
  { value: 'field_condition',         label: 'Field Condition',      defaultAssigneeRole: 'field_manager',           icon: '🌿', isSensitive: false },
  { value: 'safety_concern',          label: 'Safety Concern',       defaultAssigneeRole: 'safety_officer',          icon: '🛡️', isSensitive: true },
  { value: 'injury_report',           label: 'Injury Report',        defaultAssigneeRole: 'safety_officer',          icon: '🚑', isSensitive: true },
  { value: 'uniform_issue',           label: 'Uniform Issue',        defaultAssigneeRole: 'uniform_manager',         icon: '👕', isSensitive: false },
  { value: 'schedule_conflict',       label: 'Schedule Conflict',    defaultAssigneeRole: 'scheduling_manager',      icon: '📅', isSensitive: false },
  { value: 'umpire_issue',            label: 'Umpire Issue',         defaultAssigneeRole: 'umpire_coordinator',      icon: '⚖️', isSensitive: false },
  { value: 'sponsor_inquiry',         label: 'Sponsor Inquiry',      defaultAssigneeRole: 'sponsorship_coordinator', icon: '💼', isSensitive: false },
  { value: 'registration_question',   label: 'Registration Question', defaultAssigneeRole: 'registration_manager',  icon: '📝', isSensitive: false },
  { value: 'player_move_request',     label: 'Player Move Request',  defaultAssigneeRole: 'player_agent',            icon: '🔄', isSensitive: false },
  { value: 'general',                 label: 'General',              defaultAssigneeRole: 'admin',                   icon: '📌', isSensitive: false },
]

export function getTicketTypeConfig(value) {
  return TICKET_TYPES.find(t => t.value === value) || null
}

export function getAssigneeRoleForType(value) {
  const config = getTicketTypeConfig(value)
  return config?.defaultAssigneeRole || 'admin'
}

export const PRIORITY_COLORS = {
  urgent: { dot: '#ef4444', bg: '#fee2e2', text: '#ef4444' },
  high:   { dot: '#f97316', bg: '#ffedd5', text: '#f97316' },
  normal: { dot: '#64748b', bg: '#f1f5f9', text: '#64748b' },
  low:    { dot: '#9ca3af', bg: '#f3f4f6', text: '#9ca3af' },
}

export const STATUS_COLORS = {
  open:        { bg: '#dbeafe', text: '#3b82f6' },
  in_progress: { bg: '#fef3c7', text: '#d97706' },
  resolved:    { bg: '#d4edda', text: '#16a34a' },
  cancelled:   { bg: '#f3f4f6', text: '#6b7280' },
}
