// Pelvi Design System primitives

const AVATAR_COLORS = [
  ['hsl(16 55% 93%)', 'hsl(16 65% 28%)'],
  ['hsl(142 55% 93%)', 'hsl(142 60% 22%)'],
  ['hsl(199 75% 93%)', 'hsl(199 70% 28%)'],
  ['hsl(38 80% 93%)', 'hsl(30 75% 30%)'],
  ['hsl(285 50% 94%)', 'hsl(285 50% 32%)'],
  ['hsl(30 14% 92%)', 'hsl(220 14% 28%)'],
] as const

function hashColor(name: string): readonly [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h * 31 + name.charCodeAt(i)) >>> 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

export function OrgAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const [bg, fg] = hashColor(name)
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: '50%',
        background: bg, color: fg,
        fontWeight: 600,
        fontSize: size <= 22 ? 9 : size <= 28 ? 10.5 : 12,
        display: 'grid', placeItems: 'center',
        letterSpacing: '0.01em',
        fontFamily: 'var(--font-display)',
      }}
    >
      {getInitials(name)}
    </div>
  )
}

type PillTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'brand' | 'violet'

export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

const PLAN_STYLES: Record<string, { bg: string; fg: string }> = {
  Essential: { bg: 'hsl(30 15% 93%)',    fg: 'hsl(220 14% 30%)' },
  Pro:       { bg: 'var(--p-soft)',       fg: 'var(--p-ink)' },
  Scale:     { bg: 'hsl(20 25% 18%)',    fg: 'hsl(30 18% 88%)' },
}

export function PlanBadge({ name }: { name: string }) {
  const s = PLAN_STYLES[name] ?? { bg: 'var(--surface-3)', fg: 'var(--text-2)' }
  return (
    <span
      className="plan-tag"
      style={{ background: s.bg, color: s.fg }}
    >
      {name}
    </span>
  )
}

// Inline sparkline SVG
export function Sparkline({ data, color = 'currentColor', height = 28 }: { data: number[]; color?: string; height?: number }) {
  const w = 100, h = height
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return [x, y] as [number, number]
  })
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${path} L${w},${h} L0,${h} Z`
  const gradId = `sg-${color.replace(/[^\w]/g, '')}`
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`}/>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Generic page header
export function PageHeader({
  title, subtitle, actions,
}: {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.018em', color: 'var(--text)', lineHeight: '32px', margin: 0 }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--text-muted)', marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// Card shell
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ds-border)',
        borderRadius: 12,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-2"
      style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}
    >
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em', lineHeight: '20px', color: 'var(--text)' }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// Buttons
export function Btn({
  children, onClick, disabled, variant = 'default', size = 'md', style,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'primary' | 'ghost'
  size?: 'md' | 'sm'
  style?: React.CSSProperties
}) {
  const h = size === 'sm' ? 28 : 32
  const px = size === 'sm' ? 10 : 12
  const fs = size === 'sm' ? 12.5 : 13
  const br = size === 'sm' ? 6 : 8

  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: h, padding: `0 ${px}px`,
    borderRadius: br,
    fontSize: fs, fontWeight: 500,
    fontFamily: 'var(--font-sans)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 80ms, border-color 80ms',
    ...style,
  }

  if (variant === 'primary') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          ...base,
          background: 'var(--p)', color: 'white',
          border: '1px solid var(--p)',
          boxShadow: 'var(--shadow-brand), inset 0 1px 0 rgba(255,255,255,0.16)',
        }}
      >
        {children}
      </button>
    )
  }

  if (variant === 'ghost') {
    return (
      <button onClick={onClick} disabled={disabled} style={{ ...base, border: '1px solid transparent', background: 'transparent', color: 'var(--text)' }}>
        {children}
      </button>
    )
  }

  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, border: '1px solid var(--ds-border)', background: 'var(--surface)', color: 'var(--text)' }}>
      {children}
    </button>
  )
}

// Search input
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        height: 34, padding: '0 12px',
        borderRadius: 8, background: 'var(--surface)',
        border: '1px solid var(--ds-border)',
        fontSize: 13.5, minWidth: 300,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }}>
        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Buscar…'}
        style={{
          flex: 1, border: 0, background: 'transparent', outline: 'none',
          fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text)',
        }}
      />
    </div>
  )
}

// Status filter chips
export function FilterChip({ label, count, active, onClick }: { label: string; count?: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 30, padding: '0 12px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--p-border)' : 'var(--ds-border)'}`,
        background: active ? 'var(--p-soft)' : 'var(--surface)',
        fontSize: 12.5, fontWeight: 500,
        color: active ? 'var(--p-ink)' : 'var(--text-2)',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {label}
      {count !== undefined && (
        <span
          style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 999,
            background: active ? 'white' : 'var(--surface-3)',
            color: active ? 'var(--p-ink)' : 'var(--text-muted)',
            fontWeight: 500,
          }}
          className="num"
        >
          {count}
        </span>
      )}
    </button>
  )
}

// Table footer / pagination
export function TableFooter({
  showing, total, page = 1, limit, onPageChange,
}: {
  showing: number
  total: number
  page?: number
  limit?: number
  onPageChange?: (page: number) => void
}) {
  const paged = !!onPageChange && !!limit
  const offset = paged ? (page - 1) * limit! : 0
  const from = showing === 0 ? 0 : offset + 1
  const to = offset + showing
  const canPrev = paged && page > 1
  const canNext = paged && page * limit! < total
  const navBtn = (enabled: boolean): React.CSSProperties => ({
    height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--ds-border)',
    background: 'var(--surface)', fontSize: 12.5, fontFamily: 'var(--font-sans)',
    cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5,
  })

  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '10px 16px', borderTop: '1px solid var(--ds-border)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-muted)' }}
    >
      <div>
        Mostrando <span className="num" style={{ color: 'var(--text-2)' }}>{from}–{to}</span>{' '}
        de <span className="num" style={{ color: 'var(--text-2)' }}>{total}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {paged ? (
          <>
            <button disabled={!canPrev} onClick={() => onPageChange!(page - 1)} style={navBtn(canPrev)}>‹ Anterior</button>
            <button disabled={!canNext} onClick={() => onPageChange!(page + 1)} style={navBtn(canNext)}>Próxima ›</button>
          </>
        ) : (
          <>
            <button disabled style={{ ...navBtn(false) }}>‹ Anterior</button>
            <button style={{ ...navBtn(true) }}>Próxima ›</button>
          </>
        )}
      </div>
    </div>
  )
}
