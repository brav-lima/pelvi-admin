import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Lock, Unlock } from 'lucide-react'
import { api } from '@/lib/api'
import { roleLabel, type ClinicUserRole } from '@/lib/clinic-roles'
import { formatCPF, getErrorMessage } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

interface ClinicUser {
  organizationUserId: string
  personId: string
  cpf: string
  name: string
  email: string
  phone: string | null
  role: ClinicUserRole
  linkActive: boolean
  personActive: boolean
  createdAt: string
}

interface ResetPasswordInfo {
  userName: string
  cpf: string
  provisionalPassword: string
}

export function ClinicUsersSection({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [resetInfo, setResetInfo] = useState<ResetPasswordInfo | null>(null)

  const { data: users, isLoading } = useQuery<ClinicUser[]>({
    queryKey: ['organization-users', organizationId],
    queryFn: () => api.get(`/organizations/${organizationId}/users`).then((r) => r.data),
    enabled: !!organizationId,
  })

  const toggleActive = useMutation({
    mutationFn: ({ user, active }: { user: ClinicUser; active: boolean }) =>
      api.patch(`/organizations/${organizationId}/users/${user.organizationUserId}`, { active }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['organization-users', organizationId] })
      toast.success(vars.active ? 'Usuário desbloqueado' : 'Usuário bloqueado nesta clínica')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const resetPassword = useMutation({
    mutationFn: (user: ClinicUser) =>
      api
        .post(`/organizations/${organizationId}/users/${user.organizationUserId}/password-resets`)
        .then((r) => ({ data: r.data as { provisionalPassword: string }, user })),
    onSuccess: ({ data, user }) => {
      setResetInfo({
        userName: user.name,
        cpf: user.cpf,
        provisionalPassword: data.provisionalPassword,
      })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const copyPassword = async () => {
    if (!resetInfo) return
    await navigator.clipboard.writeText(resetInfo.provisionalPassword)
    toast.success('Senha copiada')
  }

  return (
    <div className="bg-card border rounded-lg p-4">
      <h2 className="font-semibold text-sm mb-3">Usuários da clínica</h2>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !users || users.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">Nenhum usuário cadastrado nesta clínica.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="text-left pb-2 font-medium text-muted-foreground">Nome</th>
              <th className="text-left pb-2 font-medium text-muted-foreground">CPF</th>
              <th className="text-left pb-2 font-medium text-muted-foreground">Email</th>
              <th className="text-left pb-2 font-medium text-muted-foreground">Papel</th>
              <th className="text-left pb-2 font-medium text-muted-foreground">Status</th>
              <th className="text-right pb-2 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const blocked = !u.linkActive
              return (
                <tr key={u.organizationUserId} className="border-b last:border-0">
                  <td className="py-2">{u.name}</td>
                  <td className="py-2 text-muted-foreground">{formatCPF(u.cpf)}</td>
                  <td className="py-2 text-muted-foreground">{u.email}</td>
                  <td className="py-2">{roleLabel[u.role]}</td>
                  <td className="py-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {blocked ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={toggleActive.isPending}
                        onClick={() => toggleActive.mutate({ user: u, active: blocked })}
                      >
                        {blocked ? (
                          <>
                            <Unlock className="h-3 w-3" /> Desbloquear
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3" /> Bloquear
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resetPassword.isPending}
                        onClick={() => {
                          if (confirm(`Gerar nova senha provisória para ${u.name}? A senha atual será invalidada.`)) {
                            resetPassword.mutate(u)
                          }
                        }}
                      >
                        <KeyRound className="h-3 w-3" /> Resetar senha
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <Dialog open={!!resetInfo} onOpenChange={(open) => !open && setResetInfo(null)}>
        {resetInfo && (
          <DialogContent
            title="Nova senha provisória gerada"
            description="Anote agora — ela não será exibida novamente."
          >
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Usuário:</span> {resetInfo.userName}
                </div>
                <div>
                  <span className="text-muted-foreground">CPF (login):</span> {formatCPF(resetInfo.cpf)}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Senha provisória</Label>
                <div className="flex gap-2">
                  <Input readOnly value={resetInfo.provisionalPassword} className="font-mono" />
                  <Button type="button" variant="outline" onClick={copyPassword}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Envie pelo canal seguro combinado com o usuário. A senha anterior foi invalidada.
                </p>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => setResetInfo(null)}>
                  Entendi, fechar
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
