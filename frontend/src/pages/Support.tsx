import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupportTickets } from '@/lib/support'
import { formatDate } from '@/lib/utils'
import type { SupportTicketStatus } from '@/types/admin'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, FilterChip, OrgAvatar, PageHeader, TableFooter } from '@/components/ui/ds'
import { TicketCategoryTag, TicketStatusPill } from '@/components/support/TicketBadges'

const PAGE_SIZE = 20
const COLUMNS = 6

type StatusFilter = SupportTicketStatus | 'all'

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'OPEN', label: 'Abertos' },
  { key: 'IN_PROGRESS', label: 'Em análise' },
  { key: 'RESOLVED', label: 'Resolvidos' },
]

function excerpt(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

export function SupportPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useSupportTickets({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: PAGE_SIZE,
  })
  const tickets = data?.data ?? []
  const total = data?.total ?? 0

  const changeFilter = (next: StatusFilter) => {
    setStatusFilter(next)
    setPage(1)
  }

  if (error) {
    return (
      <div style={{ borderRadius: 8, background: 'var(--danger-soft)', padding: '12px 16px', fontSize: 13, color: 'var(--danger-ink)' }}>
        Falha ao carregar chamados. Tente novamente.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Suporte" subtitle="Chamados reportados pelas clínicas" />

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(({ key, label }) => (
          <FilterChip key={key} label={label} active={statusFilter === key} onClick={() => changeFilter(key)} />
        ))}
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="pa-tbl">
            <thead>
              <tr>
                <th>Status</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Solicitante</th>
                <th>Organização</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: COLUMNS }).map((_, j) => (
                      <td key={j}><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : tickets.map((t) => (
                <tr key={t.id}>
                  <td><TicketStatusPill status={t.status} /></td>
                  <td><TicketCategoryTag category={t.category} /></td>
                  <td style={{ maxWidth: 360 }}>
                    <Link to={`/support/${t.id}`} style={{ color: 'var(--text)', fontWeight: 500, textDecoration: 'none' }}>
                      {excerpt(t.description)}
                    </Link>
                  </td>
                  <td>{t.reporterName}</td>
                  <td>
                    {t.organization ? (
                      <Link to={`/organizations/${t.organization.id}`} aria-label={t.organization.name} className="flex items-center gap-2" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                        <OrgAvatar name={t.organization.name} size={24} />
                        <span style={{ fontWeight: 500 }}>{t.organization.name}</span>
                      </Link>
                    ) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatDate(t.createdAt)}</td>
                </tr>
              ))}
              {!isLoading && tickets.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhum chamado encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TableFooter showing={tickets.length} total={total} page={page} limit={PAGE_SIZE} onPageChange={setPage} />
      </Card>
    </div>
  )
}
