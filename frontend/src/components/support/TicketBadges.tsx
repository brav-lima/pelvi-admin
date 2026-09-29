import { StatusPill } from '@/components/ui/ds'
import { CATEGORY_LABEL, STATUS_LABEL } from '@/lib/support'
import type { SupportTicketCategory, SupportTicketStatus } from '@/types/admin'

const STATUS_DOT: Record<SupportTicketStatus, string> = {
  OPEN: '🔴',
  IN_PROGRESS: '🟡',
  RESOLVED: '🟢',
}

const STATUS_TONE = { OPEN: 'danger', IN_PROGRESS: 'warn', RESOLVED: 'ok' } as const

export function TicketStatusPill({ status }: { status: SupportTicketStatus }) {
  return (
    <StatusPill tone={STATUS_TONE[status]}>
      <span aria-hidden="true">{STATUS_DOT[status]}</span> {STATUS_LABEL[status]}
    </StatusPill>
  )
}

export function TicketCategoryTag({ category }: { category: SupportTicketCategory }) {
  return <StatusPill tone="muted">{CATEGORY_LABEL[category]}</StatusPill>
}
