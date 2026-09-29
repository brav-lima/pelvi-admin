import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  STATUS_LABEL,
  useReplyToTicket,
  useSupportTicket,
  useUpdateTicketNote,
  useUpdateTicketStatus,
} from '@/lib/support'
import { formatDate, getErrorMessage } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import type { SupportTicket, SupportTicketStatus } from '@/types/admin'
import { roleLabel, type ClinicUserRole } from '@/lib/clinic-roles'
import { Skeleton } from '@/components/ui/skeleton'
import { Btn, Card, CardHeader, PageHeader } from '@/components/ui/ds'
import { TicketCategoryTag, TicketStatusPill } from '@/components/support/TicketBadges'

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED']
const NO_EMAIL_TOOLTIP = 'Este chamado não possui e-mail do solicitante'

const textareaStyle: React.CSSProperties = {
  width: '100%', minHeight: 96, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--ds-border)', background: 'var(--surface)', color: 'var(--text)',
  fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'vertical',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  )
}

const dash = (v: string | null | undefined) => (v ? v : '—')

export function SupportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: ticket, isLoading, error } = useSupportTicket(id)

  if (error && !ticket) {
    return <ErrorBanner error={error} />
  }
  if (isLoading || !ticket) {
    return <Skeleton className="h-64 w-full" />
  }
  // `key` resets the local form state when navigating between tickets; refetches
  // of the same ticket deliberately do not clobber in-progress edits.
  return (
    <>
      {error && <ErrorBanner error={error} />}
      <TicketDetail key={ticket.id} ticket={ticket} />
    </>
  )
}

function ErrorBanner({ error }: { error: unknown }) {
  return (
    <div style={{ borderRadius: 8, background: 'var(--danger-soft)', padding: '12px 16px', fontSize: 13, color: 'var(--danger-ink)', marginBottom: 12 }}>
      {getErrorMessage(error)}
    </div>
  )
}

function TicketDetail({ ticket }: { ticket: SupportTicket }) {
  const { toast } = useToast()
  const updateStatus = useUpdateTicketStatus(ticket.id)
  const updateNote = useUpdateTicketNote(ticket.id)
  const reply = useReplyToTicket(ticket.id)

  const [note, setNote] = useState(ticket.internalNote ?? '')
  const [replyBody, setReplyBody] = useState('')

  const noteDirty = note.trim() !== '' && note !== (ticket.internalNote ?? '')
  const canReply = !!ticket.reporterEmail

  const copySentryId = async () => {
    try {
      await navigator.clipboard.writeText(ticket.sentryEventId!)
      toast.success('ID copiado')
    } catch {
      toast.error('Não foi possível copiar o ID')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link to="/support" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
        ‹ Voltar para chamados
      </Link>

      <PageHeader
        title={`Chamado ${ticket.id.slice(0, 8)}`}
        subtitle={<>Aberto em {formatDate(ticket.createdAt)}</>}
        actions={
          <>
            <TicketCategoryTag category={ticket.category} />
            <TicketStatusPill status={ticket.status} />
          </>
        }
      />

      <Card>
        <CardHeader title="Solicitante" />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Field label="Nome">{ticket.reporterName}</Field>
          <Field label="E-mail">{dash(ticket.reporterEmail)}</Field>
          <Field label="Papel">{ticket.reporterRole ? (roleLabel[ticket.reporterRole as ClinicUserRole] ?? ticket.reporterRole) : '—'}</Field>
          <Field label="Organização">
            {ticket.organization ? (
              <Link to={`/organizations/${ticket.organization.id}`}>{ticket.organization.name}</Link>
            ) : '—'}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Descrição" />
        <div style={{ padding: 16, fontSize: 13.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text)' }}>{ticket.description}</div>
      </Card>

      <Card>
        <CardHeader title="Contexto capturado" />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <Field label="Rota">{ticket.context.route}</Field>
          <Field label="URL">{ticket.context.url}</Field>
          <Field label="Navegador">{ticket.context.userAgent}</Field>
          <Field label="Versão do app">{ticket.context.appVersion}</Field>
          <Field label="Sessão">{dash(ticket.context.sessionId)}</Field>
          <Field label="Ocorrido em">{formatDate(ticket.context.occurredAt)}</Field>
          <Field label="Sentry event ID">
            {ticket.sentryEventId ? (
              <span className="flex items-center gap-2">
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ticket.sentryEventId}</code>
                <Btn size="sm" onClick={copySentryId}>Copiar</Btn>
              </span>
            ) : '—'}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Status" />
        <div style={{ padding: 16 }} className="flex items-center gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <Btn
              key={s}
              size="sm"
              disabled={ticket.status === s || updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate(s, {
                  onSuccess: () => toast.success(`Status alterado para ${STATUS_LABEL[s]}`),
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              Marcar como {STATUS_LABEL[s]}
            </Btn>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Nota interna" subtitle="Visível apenas para o time de suporte" />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea aria-label="Nota interna" style={textareaStyle} value={note} onChange={(e) => setNote(e.target.value)} />
          <div>
            <Btn
              variant="primary"
              size="sm"
              disabled={!noteDirty || updateNote.isPending}
              onClick={() =>
                updateNote.mutate(note, {
                  onSuccess: () => toast.success('Nota salva'),
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              Salvar nota
            </Btn>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Resposta por e-mail" subtitle={canReply ? `Será enviada para ${ticket.reporterEmail}` : undefined} />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ticket.emailRepliedAt && ticket.emailReplyBody && (
            <div style={{ borderRadius: 8, background: 'var(--surface-2)', padding: '10px 12px', fontSize: 13 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                Última resposta enviada em {formatDate(ticket.emailRepliedAt)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ticket.emailReplyBody}</div>
            </div>
          )}
          <span title={canReply ? undefined : NO_EMAIL_TOOLTIP} style={{ display: 'contents' }}>
            <textarea
              aria-label="Resposta por e-mail"
              style={{ ...textareaStyle, opacity: canReply ? 1 : 0.6 }}
              value={replyBody}
              disabled={!canReply}
              onChange={(e) => setReplyBody(e.target.value)}
            />
          </span>
          <span title={canReply ? undefined : NO_EMAIL_TOOLTIP} style={{ alignSelf: 'flex-start' }}>
            <Btn
              variant="primary"
              size="sm"
              disabled={!canReply || replyBody.trim() === '' || reply.isPending}
              onClick={() =>
                reply.mutate(replyBody, {
                  onSuccess: () => {
                    toast.success('Resposta enviada por e-mail')
                    setReplyBody('')
                  },
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              Responder por e-mail
            </Btn>
          </span>
        </div>
      </Card>
    </div>
  )
}
