export type ClinicUserRole = 'ADMIN' | 'PROFESSIONAL' | 'RECEPTIONIST'

export const roleLabel: Record<ClinicUserRole, string> = {
  ADMIN: 'Admin',
  PROFESSIONAL: 'Profissional',
  RECEPTIONIST: 'Recepção',
}
