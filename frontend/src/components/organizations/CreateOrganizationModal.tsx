import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Plus } from 'lucide-react'

const schema = z
  .object({
    organizationType: z.enum(['CLINIC_PJ', 'SOLO_PF']).default('CLINIC_PJ'),
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    document: z.string().optional(),
    email: z.string().email('Email inválido'),
    phone: z.string().optional(),
    clinicExternalId: z.string().optional(),
    ownerName: z.string().optional(),
    ownerCpf: z.string().optional(),
    ownerEmail: z.string().optional(),
    ownerPhone: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.clinicExternalId) return

    if (!data.ownerName || data.ownerName.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['ownerName'], message: 'Nome do responsável obrigatório' })
    }
    if (!data.ownerCpf || !/^\d{11}$/.test(data.ownerCpf)) {
      ctx.addIssue({ code: 'custom', path: ['ownerCpf'], message: 'CPF deve ter 11 dígitos' })
    }
    if (!data.ownerEmail || !/^\S+@\S+\.\S+$/.test(data.ownerEmail)) {
      ctx.addIssue({ code: 'custom', path: ['ownerEmail'], message: 'Email inválido' })
    }

    if (data.organizationType === 'CLINIC_PJ') {
      if (!data.document || !/^\d{14}$/.test(data.document)) {
        ctx.addIssue({ code: 'custom', path: ['document'], message: 'CNPJ deve ter 14 dígitos' })
      }
    }
  })

type FormData = z.infer<typeof schema>

interface AvailableClinic {
  id: string
  name: string
}

interface OwnerCreatedInfo {
  ownerName: string
  ownerEmail: string
  cpf: string
  provisionalPassword: string
}

export function CreateOrganizationModal() {
  const [open, setOpen] = useState(false)
  const [ownerCreated, setOwnerCreated] = useState<OwnerCreatedInfo | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { organizationType: 'CLINIC_PJ' } })

  const organizationType = watch('organizationType')
  const selectedClinic = watch('clinicExternalId')
  const linkingExisting = Boolean(selectedClinic)
  const isSolo = organizationType === 'SOLO_PF'

  const { data: availableClinics } = useQuery<AvailableClinic[]>({
    queryKey: ['available-clinics'],
    queryFn: () => api.get('/organizations/available-clinics').then((r) => r.data),
    enabled: open,
  })

  const createOrg = useMutation({
    mutationFn: async (data: FormData) => {
      if (data.clinicExternalId) {
        const res = await api.post('/organizations', {
          name: data.name,
          document: data.document,
          email: data.email,
          phone: data.phone || undefined,
          clinicExternalId: data.clinicExternalId,
        })
        return { mode: 'linked' as const, data: res.data }
      }

      const res = await api.post('/organizations', {
        organizationType: data.organizationType,
        name: data.name,
        ...(data.organizationType === 'CLINIC_PJ' && { document: data.document }),
        email: data.email,
        phone: data.phone || undefined,
        owner: {
          name: data.ownerName!,
          cpf: data.ownerCpf!,
          email: data.ownerEmail!,
          phone: data.ownerPhone || undefined,
        },
      })
      return { mode: 'created' as const, data: res.data, form: data }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })

      if (result.mode === 'created' && result.data.provisionalPassword) {
        setOwnerCreated({
          ownerName: result.form.ownerName!,
          ownerEmail: result.form.ownerEmail!,
          cpf: result.form.ownerCpf!,
          provisionalPassword: result.data.provisionalPassword,
        })
        toast.success('Organização e responsável criados')
      } else if (result.mode === 'created' && result.data.owner?.reused) {
        toast.success('Organização criada — responsável já existia; use a senha atual dele.')
        reset()
        setOpen(false)
      } else {
        toast.success('Organização criada com sucesso')
        reset()
        setOpen(false)
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const handleClose = () => {
    setOwnerCreated(null)
    reset()
    setOpen(false)
  }

  const copyPassword = async () => {
    if (!ownerCreated) return
    await navigator.clipboard.writeText(ownerCreated.provisionalPassword)
    toast.success('Senha copiada')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nova Organização
        </Button>
      </DialogTrigger>

      {ownerCreated ? (
        <DialogContent
          title="Senha provisória gerada"
          description="Anote agora — ela não será exibida novamente."
        >
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Responsável:</span> {ownerCreated.ownerName}</div>
              <div><span className="text-muted-foreground">CPF (login):</span> {ownerCreated.cpf}</div>
              <div><span className="text-muted-foreground">Email:</span> {ownerCreated.ownerEmail}</div>
            </div>

            <div className="space-y-1.5">
              <Label>Senha provisória</Label>
              <div className="flex gap-2">
                <Input readOnly value={ownerCreated.provisionalPassword} className="font-mono" />
                <Button type="button" variant="outline" onClick={copyPassword}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Um e-mail de boas-vindas com o link de acesso foi enviado para{' '}
                <strong>{ownerCreated.ownerEmail}</strong>. Esta senha é o backup manual — envie por
                um canal seguro caso o e-mail não chegue.
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={handleClose}>Entendi, fechar</Button>
            </div>
          </div>
        </DialogContent>
      ) : (
        <DialogContent title="Nova Organização" description="Preencha os dados da organização cliente">
          <form onSubmit={handleSubmit((d) => createOrg.mutate(d))} className="space-y-4">

            {/* Toggle PJ / PF */}
            <div className="flex rounded-md border overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setValue('organizationType', 'CLINIC_PJ')}
                className={`flex-1 py-2 text-center transition-colors ${
                  organizationType === 'CLINIC_PJ'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                Clínica / PJ
              </button>
              <button
                type="button"
                onClick={() => setValue('organizationType', 'SOLO_PF')}
                className={`flex-1 py-2 text-center transition-colors ${
                  organizationType === 'SOLO_PF'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                Profissional Solo / PF
              </button>
            </div>

            {isSolo && (
              <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
                No modo solo, o CPF do profissional é usado como documento da organização. O nome da organização é o nome do consultório.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name">{isSolo ? 'Nome do consultório *' : 'Nome *'}</Label>
              <Input
                id="name"
                placeholder={isSolo ? 'Consultório Dra. Maria Silva' : 'Clínica Saúde Total'}
                {...register('name')}
                error={errors.name?.message}
              />
            </div>

            {!isSolo && (
              <div className="space-y-1.5">
                <Label htmlFor="document">CNPJ * (somente números)</Label>
                <Input
                  id="document"
                  placeholder="00000000000000"
                  maxLength={14}
                  {...register('document')}
                  error={errors.document?.message}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" placeholder="contato@clinica.com" {...register('email')} error={errors.email?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" placeholder="(11) 99999-9999" {...register('phone')} />
            </div>

            {!isSolo && availableClinics && availableClinics.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="clinicExternalId">Vincular a clínica existente</Label>
                <select
                  id="clinicExternalId"
                  {...register('clinicExternalId')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Criar nova clínica automaticamente</option>
                  {availableClinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Ao vincular a uma clínica existente, os usuários dela são mantidos — não é necessário informar responsável.
                </p>
              </div>
            )}

            {!linkingExisting && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-medium">
                  {isSolo ? 'Dados do profissional' : 'Responsável (acesso inicial)'}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ownerName">Nome *</Label>
                  <Input id="ownerName" placeholder="Maria Silva" {...register('ownerName')} error={errors.ownerName?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ownerCpf">CPF * (somente números — login{isSolo ? ' e documento' : ''})</Label>
                  <Input id="ownerCpf" placeholder="00000000000" maxLength={11} {...register('ownerCpf')} error={errors.ownerCpf?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ownerEmail">Email *</Label>
                  <Input id="ownerEmail" type="email" placeholder="profissional@exemplo.com" {...register('ownerEmail')} error={errors.ownerEmail?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ownerPhone">Telefone</Label>
                  <Input id="ownerPhone" placeholder="(11) 99999-9999" {...register('ownerPhone')} />
                </div>

                <p className="text-xs text-muted-foreground">
                  Uma senha provisória será gerada e exibida uma única vez após o cadastro. Se o CPF já existir em outra clínica, reutilizamos a pessoa e a senha atual dela é preservada.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createOrg.isPending}>
                {createOrg.isPending ? 'Criando...' : 'Criar Organização'}
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
