export default function EquipmentIcon({ type, size = 40 }) {
  const s = size
  const sw = 1.8
  const c = '#1a472a'

  const icons = {
    balls: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="14" stroke={c} strokeWidth={sw}/>
        <path d="M10 12C14 16 14 24 10 28" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/>
        <path d="M30 12C26 16 26 24 30 28" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/>
      </svg>
    ),
    bats: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M10 30L13 27" stroke={c} strokeWidth={3} strokeLinecap="round"/>
        <path d="M13 27L30 10C31 9 33 9 34 10C35 11 34 13 33 14L16 31C15 32 13 32 12 31C11 30 12 28 13 27Z" stroke={c} strokeWidth={sw} fill="none"/>
        <circle cx="11" cy="31" r="1.5" fill={c}/>
      </svg>
    ),
    catchers_gear: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M12 14C12 9 16 6 20 6C24 6 28 9 28 14V20C28 24 24 28 20 28C16 28 12 24 12 20Z" stroke={c} strokeWidth={sw} fill="none"/>
        <line x1="12" y1="16" x2="28" y2="16" stroke={c} strokeWidth={sw}/>
        <line x1="12" y1="22" x2="28" y2="22" stroke={c} strokeWidth={sw}/>
        <circle cx="17" cy="12" r="1.5" fill={c}/>
        <circle cx="23" cy="12" r="1.5" fill={c}/>
        <path d="M10 28L14 32" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
        <path d="M30 28L26 32" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
      </svg>
    ),
    batting_helmets: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M8 24C8 15 13 8 22 8C31 8 34 15 34 22C34 25 32 26 30 26H26" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/>
        <path d="M8 24C8 28 10 30 14 30H20C22 30 24 28 24 26H30" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/>
        <path d="M24 26C24 24 22 22 20 22H16C13 22 10 24 8 24" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/>
      </svg>
    ),
    bags: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="9" y="14" width="22" height="18" rx="3" stroke={c} strokeWidth={sw} fill="none"/>
        <path d="M15 14V10C15 8 17 6 20 6C23 6 25 8 25 10V14" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/>
        <line x1="9" y1="20" x2="31" y2="20" stroke={c} strokeWidth={sw}/>
        <rect x="17" y="17" width="6" height="6" rx="1" stroke={c} strokeWidth={1.2} fill="none"/>
      </svg>
    ),
    field_equipment: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="8" y="28" width="24" height="6" rx="1" stroke={c} strokeWidth={sw} fill="none"/>
        <rect x="12" y="22" width="4" height="6" rx="1" stroke={c} strokeWidth={sw} fill="none"/>
        <rect x="24" y="22" width="4" height="6" rx="1" stroke={c} strokeWidth={sw} fill="none"/>
        <path d="M14 22V18C14 16 16 14 20 14C24 14 26 16 26 18V22" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round"/>
        <line x1="20" y1="8" x2="20" y2="14" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
        <circle cx="20" cy="11" r="3" stroke={c} strokeWidth={sw} fill="none"/>
      </svg>
    ),
    game_supplies: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="8" y="6" width="24" height="30" rx="2" stroke={c} strokeWidth={sw} fill="none"/>
        <line x1="12" y1="12" x2="28" y2="12" stroke={c} strokeWidth={1.2}/>
        <line x1="12" y1="17" x2="28" y2="17" stroke={c} strokeWidth={1.2}/>
        <line x1="12" y1="22" x2="28" y2="22" stroke={c} strokeWidth={1.2}/>
        <line x1="12" y1="27" x2="22" y2="27" stroke={c} strokeWidth={1.2}/>
        <path d="M24 30L27 27L30 30" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
    first_aid: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="8" y="10" width="24" height="20" rx="3" stroke={c} strokeWidth={sw} fill="none"/>
        <line x1="20" y1="16" x2="20" y2="24" stroke={c} strokeWidth={2.5} strokeLinecap="round"/>
        <line x1="16" y1="20" x2="24" y2="20" stroke={c} strokeWidth={2.5} strokeLinecap="round"/>
        <path d="M14 10V8C14 7 15 6 16 6H24C25 6 26 7 26 8V10" stroke={c} strokeWidth={sw} fill="none"/>
      </svg>
    ),
    umpire_gear: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <ellipse cx="20" cy="16" rx="12" ry="4" stroke={c} strokeWidth={sw} fill="none"/>
        <path d="M8 16V18C8 20 13 22 20 22C27 22 32 20 32 18V16" stroke={c} strokeWidth={sw} fill="none"/>
        <path d="M12 22V28C12 30 15 32 20 32C25 32 28 30 28 28V22" stroke={c} strokeWidth={sw} fill="none"/>
        <ellipse cx="20" cy="13" rx="8" ry="2.5" stroke={c} strokeWidth={1.2} fill="none"/>
      </svg>
    ),
    training: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="16" r="4" stroke={c} strokeWidth={sw} fill="none"/>
        <line x1="20" y1="20" x2="20" y2="34" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
        <line x1="14" y1="28" x2="26" y2="28" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
        <path d="M12 10L16 14" stroke={c} strokeWidth={1.5} strokeLinecap="round"/>
        <path d="M28 10L24 14" stroke={c} strokeWidth={1.5} strokeLinecap="round"/>
        <line x1="20" y1="6" x2="20" y2="12" stroke={c} strokeWidth={1.5} strokeLinecap="round"/>
        <path d="M8 16H12" stroke={c} strokeWidth={1.5} strokeLinecap="round"/>
        <path d="M28 16H32" stroke={c} strokeWidth={1.5} strokeLinecap="round"/>
      </svg>
    ),
    apparel: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M14 8L8 14V18L12 16V32H28V16L32 18V14L26 8" stroke={c} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" fill="none"/>
        <path d="M14 8C14 8 16 12 20 12C24 12 26 8 26 8" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/>
      </svg>
    ),
  }

  return icons[type] || null
}
