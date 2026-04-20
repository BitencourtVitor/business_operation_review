// ─── Shared constants & types for the Permits feature ────────────────────────

export const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export const MONTHS = [
  { value: '01', label: 'January'   }, { value: '02', label: 'February'  },
  { value: '03', label: 'March'     }, { value: '04', label: 'April'     },
  { value: '05', label: 'May'       }, { value: '06', label: 'June'      },
  { value: '07', label: 'July'      }, { value: '08', label: 'August'    },
  { value: '09', label: 'September' }, { value: '10', label: 'October'   },
  { value: '11', label: 'November'  }, { value: '12', label: 'December'  },
]

export const DATE_FIELDS = [
  { value: 'solicitacao', label: 'Request Date'     },
  { value: 'aplicacao',   label: 'Application Date' },
  { value: 'emissao',     label: 'Issue Date'       },
] as const

export type DateField = typeof DATE_FIELDS[number]['value']

export const ALL = 'all'

// ─── Timeline layout constants ────────────────────────────────────────────────

export const DAY_WIDTH  = 80
export const SUB_H      = 40
export const TIMELINE_H = 340
export const LABEL_H    = 40
export const TOP_PAD    = 18
export const STEM_MAX_H = TIMELINE_H - LABEL_H - TOP_PAD - 28

// ─── Situation tiers ──────────────────────────────────────────────────────────

export type SitTier = 'issued' | 'applied' | 'not-applied' | 'pending' | 'other'

export const SIT_STYLE: Record<SitTier, { dot: string; text: string; bg: string; hex: string }> = {
  'issued':      { dot: 'bg-primary',                        text: 'text-primary',                              bg: 'bg-primary/10',                          hex: '' },
  'applied':     { dot: 'bg-yellow-500 dark:bg-yellow-300',  text: 'text-yellow-500 dark:text-yellow-300',      bg: 'bg-yellow-500/10 dark:bg-yellow-300/10',  hex: '#eab308' },
  'not-applied': { dot: 'bg-red-500 dark:bg-red-300',        text: 'text-red-500 dark:text-red-300',            bg: 'bg-red-500/10 dark:bg-red-300/10',        hex: '#ef4444' },
  'pending':     { dot: 'bg-gray-500 dark:bg-gray-400',      text: 'text-gray-500 dark:text-gray-400',          bg: 'bg-gray-500/10 dark:bg-gray-400/10',      hex: '#6b7280' },
  'other':       { dot: 'bg-muted-foreground',               text: 'text-muted-foreground',                     bg: 'bg-muted',                                hex: '#6b7280' },
}

// ─── Situation dropdown options ───────────────────────────────────────────────
// NOTE: icons are defined in permit-filters.tsx to keep this file free of JSX.
// The values and labels are shared here.
export const SIT_VALUES = [ALL, 'Pending', 'Not Applied', 'Applied', 'Issued'] as const
