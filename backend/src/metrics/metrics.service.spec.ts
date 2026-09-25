import { MetricsService } from './metrics.service'
import { PrismaService } from '../prisma/prisma.service'

describe('MetricsService.getSummary', () => {
  it('includes openSupportTicketsCount alongside the existing summary fields', async () => {
    const prisma = {
      organization: { count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2) },
      subscription: { count: jest.fn().mockResolvedValue(3) },
      invoice: { count: jest.fn().mockResolvedValue(1) },
      supportTicket: { count: jest.fn().mockResolvedValue(4) },
      $queryRaw: jest.fn().mockResolvedValue([{ mrr: '1000' }]),
    } as unknown as PrismaService
    const sut = new MetricsService(prisma)

    const result = await sut.getSummary()

    expect(result).toEqual({
      mrr: 1000,
      activeOrgs: 5,
      trialOrgs: 3,
      suspendedOrgs: 2,
      overdueInvoices: 1,
      openSupportTicketsCount: 4,
    })
    expect(prisma.supportTicket.count).toHaveBeenCalledWith({ where: { status: 'OPEN' } })
  })
})
