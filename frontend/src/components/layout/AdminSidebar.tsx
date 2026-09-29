import { NavLink } from 'react-router-dom'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useOpenSupportTicketsCount } from '@/lib/support'
import type { AdminRole, MetricsSummary } from '@/types/admin'

const DashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/>
    <rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>
  </svg>
)
const BuildingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M15 9h3a2 2 0 0 1 2 2v10"/>
    <path d="M8 7h3M8 11h3M8 15h3"/><path d="M3 21h18"/>
  </svg>
)
const CardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>
  </svg>
)
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <path d="M21 12a9 9 0 0 1-15.4 6.3L3 16"/><path d="M3 12a9 9 0 0 1 15.4-6.3L21 8"/>
    <path d="M21 3v5h-5M3 21v-5h5"/>
  </svg>
)
const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>
  </svg>
)
const LifebuoyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>
    <path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>
  </svg>
)
const CogIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
  </svg>
)

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

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

function UserAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const [bg, fg] = hashColor(name)
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: '50%',
        background: bg,
        color: fg,
        fontWeight: 600,
        fontSize: size <= 22 ? 9 : size <= 28 ? 10.5 : 12,
        display: 'grid', placeItems: 'center',
        letterSpacing: '0.01em',
      }}
    >
      {initials(name)}
    </div>
  )
}

const FeaturesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
  </svg>
)

const SUPPORT_ROLES: AdminRole[] = ['SUPER_ADMIN', 'SUPPORT']

type NavItem = {
  to: string
  icon: () => React.JSX.Element
  label: string
  badge?: 'overdue' | 'support'
  roles?: AdminRole[]
}

const navItems: NavItem[] = [
  { to: '/dashboard',     icon: DashboardIcon, label: 'Visão geral' },
  { to: '/organizations', icon: BuildingIcon,  label: 'Organizações' },
  { to: '/plans',         icon: CardIcon,      label: 'Planos' },
  { to: '/subscriptions', icon: RefreshIcon,   label: 'Assinaturas' },
  { to: '/invoices',      icon: FileIcon,      label: 'Faturas', badge: 'overdue' },
  { to: '/support',       icon: LifebuoyIcon,  label: 'Suporte', badge: 'support', roles: SUPPORT_ROLES },
]

const planSubItems = [
  { to: '/plan-features', icon: FeaturesIcon, label: 'Features' },
]

export function AdminSidebar() {
  const { user } = useAdminAuth()

  const { data: metrics } = useQuery<MetricsSummary>({
    queryKey: ['metrics-summary'],
    queryFn: () => api.get('/metrics/summary').then((r) => r.data),
    staleTime: 60_000,
  })

  const overdueCount = metrics?.overdueInvoices ?? 0
  const canSeeSupport = !!user && SUPPORT_ROLES.includes(user.role)
  const { data: openTickets = 0 } = useOpenSupportTicketsCount(canSeeSupport)
  const badgeCount = { overdue: overdueCount, support: openTickets }
  const visibleNavItems = navItems.filter((item) => !item.roles || (!!user && item.roles.includes(user.role)))

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 240, flexShrink: 0,
        background: 'var(--side-bg)',
        color: 'var(--side-text)',
        borderRight: '1px solid var(--side-border)',
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center gap-2.5"
        style={{ padding: '18px 20px 16px', borderBottom: '1px solid var(--side-border)' }}
      >
        <div
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--p)',
            display: 'grid', placeItems: 'center',
            color: 'white', fontWeight: 700, fontSize: 14,
            fontFamily: 'var(--font-display)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
          P
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, lineHeight: '20px', letterSpacing: '-0.012em', color: 'var(--side-text)' }}>
            Pelvi Admin
          </div>
          <div style={{ fontSize: 10.5, lineHeight: '14px', color: 'var(--side-text-2)', marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
            Back office
          </div>
        </div>
      </div>

      {/* Section label */}
      <div style={{ padding: '16px 14px 6px', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--side-text-2)' }}>
        Operação
      </div>

      {/* Nav */}
      <nav className="flex-1" style={{ padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleNavItems.map(({ to, icon: Icon, label, badge }) => (
          <div key={to}>
            <NavLink
              to={to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                fontSize: 13.5, fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--side-active-text)' : 'var(--side-text-2)',
                background: isActive ? 'var(--side-active-bg)' : 'transparent',
                textDecoration: 'none',
                transition: 'background 80ms, color 80ms',
              })}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                if (!el.getAttribute('aria-current')) {
                  el.style.background = 'var(--side-bg-2)'
                  el.style.color = 'var(--side-text)'
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget
                if (!el.getAttribute('aria-current')) {
                  el.style.background = 'transparent'
                  el.style.color = 'var(--side-text-2)'
                }
              }}
            >
              <Icon />
              <span className="flex-1">{label}</span>
              {badge && badgeCount[badge] > 0 && (
                <span
                  className="num"
                  style={{
                    fontSize: 10.5, padding: '1px 6px', borderRadius: 999,
                    background: 'hsl(0 72% 51% / 0.22)',
                    color: 'hsl(0 65% 78%)',
                    fontWeight: 600,
                  }}
                >
                  {badgeCount[badge]}
                </span>
              )}
            </NavLink>

            {/* Sub-itens de Planos — renderizados imediatamente após o item pai */}
            {to === '/plans' && (
              <div style={{ marginLeft: 14, paddingLeft: 10, borderLeft: '1px solid var(--side-border)', display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
                {planSubItems.map(({ to: subTo, icon: SubIcon, label: subLabel }) => (
                  <NavLink
                    key={subTo}
                    to={subTo}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 6,
                      fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'var(--side-active-text)' : 'var(--side-text-2)',
                      background: isActive ? 'var(--side-active-bg)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'background 80ms, color 80ms',
                    })}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget
                      if (!el.getAttribute('aria-current')) {
                        el.style.background = 'var(--side-bg-2)'
                        el.style.color = 'var(--side-text)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget
                      if (!el.getAttribute('aria-current')) {
                        el.style.background = 'transparent'
                        el.style.color = 'var(--side-text-2)'
                      }
                    }}
                  >
                    <SubIcon />
                    <span>{subLabel}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* System section */}
      <div style={{ padding: '16px 14px 6px', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--side-text-2)' }}>
        Sistema
      </div>
      <nav style={{ padding: '4px 10px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            fontSize: 13.5, fontWeight: 500,
            color: 'var(--side-text-2)', cursor: 'pointer',
          }}
        >
          <CogIcon />
          <span>Configurações</span>
        </div>
      </nav>

      {/* User footer */}
      {user && (
        <div
          className="flex items-center gap-2.5"
          style={{ borderTop: '1px solid var(--side-border)', padding: 12 }}
        >
          <UserAvatar name={user.name} size={32} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: '16px', color: 'var(--side-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--side-text-2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500, marginTop: 2 }}>
              {user.role.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
