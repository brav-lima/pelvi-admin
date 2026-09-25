import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [activeOrgs, trialOrgs, suspendedOrgs, overdueInvoices, mrrResult, openSupportTicketsCount] =
      await Promise.all([
        this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscription.count({ where: { status: 'TRIAL' } }),
        this.prisma.organization.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
        this.prisma.$queryRaw<[{ mrr: string }]>`
          SELECT COALESCE(SUM(p.price_monthly), 0)::text AS mrr
          FROM subscriptions s
          JOIN plans p ON p.id = s.plan_id
          WHERE s.status = 'ACTIVE'
        `,
        this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      ])

    const mrr = Number(mrrResult[0]?.mrr ?? 0)

    return { mrr, activeOrgs, trialOrgs, suspendedOrgs, overdueInvoices, openSupportTicketsCount }
  }

  async getRevenueByYear(year: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59),
        },
      },
      select: { amount: true, paidAt: true },
      take: 10000,
    })

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      revenue: 0,
    }))

    for (const invoice of invoices) {
      const month = invoice.paidAt!.getMonth()
      monthly[month].revenue += Number(invoice.amount)
    }

    return monthly
  }

  async getConversionFunnel(days: number) {
    const now = new Date()
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const prevPeriodStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000)

    const [currentSubs, prevSubs] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where: { startDate: { gte: periodStart, lte: now } },
        select: {
          status: true,
          invoices: { where: { status: 'PAID' }, select: { id: true } },
        },
      }),
      this.prisma.subscription.findMany({
        where: { startDate: { gte: prevPeriodStart, lt: periodStart } },
        select: { status: true },
      }),
    ])

    const trialsStarted = currentSubs.length
    const converted = currentSubs.filter((s) => s.status === 'ACTIVE').length
    const withRecurringPayment = currentSubs.filter((s) => s.invoices.length >= 2).length

    const prevTrialsStarted = prevSubs.length
    const prevConverted = prevSubs.filter((s) => s.status === 'ACTIVE').length

    const conversionRate = trialsStarted > 0 ? (converted / trialsStarted) * 100 : 0
    const prevConversionRate = prevTrialsStarted > 0 ? (prevConverted / prevTrialsStarted) * 100 : 0
    const deltaConversionRate = conversionRate - prevConversionRate

    return {
      periodDays: days,
      trialsStarted,
      onboardingCompleted: null,
      converted,
      withRecurringPayment,
      conversionRate: Math.round(conversionRate * 10) / 10,
      deltaConversionRate: Math.round(deltaConversionRate * 10) / 10,
    }
  }

  async getKpiTrends(months: number) {
    const now = new Date()
    // Slot 0 = oldest, slot N-1 = most recent (current month)
    const slots = Array.from({ length: months }, (_, i) => {
      const offset = months - 1 - i
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999)
      return { start, end }
    })

    const windowStart = slots[0].start

    const [revenueRows, newOrgsRows, newTrialsRows, overdueRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ year: number; month: number; revenue: string }>>`
        SELECT
          EXTRACT(YEAR FROM paid_at)::int  AS year,
          EXTRACT(MONTH FROM paid_at)::int AS month,
          SUM(amount)::text                AS revenue
        FROM invoices
        WHERE status = 'PAID' AND paid_at >= ${windowStart}
        GROUP BY year, month
        ORDER BY year, month
      `,
      this.prisma.$queryRaw<Array<{ year: number; month: number; count: string }>>`
        SELECT
          EXTRACT(YEAR FROM created_at)::int  AS year,
          EXTRACT(MONTH FROM created_at)::int AS month,
          COUNT(*)::text                      AS count
        FROM organizations
        WHERE created_at >= ${windowStart}
        GROUP BY year, month
        ORDER BY year, month
      `,
      this.prisma.$queryRaw<Array<{ year: number; month: number; count: string }>>`
        SELECT
          EXTRACT(YEAR FROM start_date)::int  AS year,
          EXTRACT(MONTH FROM start_date)::int AS month,
          COUNT(*)::text                      AS count
        FROM subscriptions
        WHERE start_date >= ${windowStart}
        GROUP BY year, month
        ORDER BY year, month
      `,
      this.prisma.$queryRaw<Array<{ year: number; month: number; count: string }>>`
        SELECT
          EXTRACT(YEAR FROM due_date)::int  AS year,
          EXTRACT(MONTH FROM due_date)::int AS month,
          COUNT(*)::text                    AS count
        FROM invoices
        WHERE status = 'OVERDUE' AND due_date >= ${windowStart}
        GROUP BY year, month
        ORDER BY year, month
      `,
    ])

    const slotOf = (year: number, month: number) =>
      slots.findIndex(
        (s) => s.start.getFullYear() === year && s.start.getMonth() + 1 === month,
      )

    const mrr = Array<number>(months).fill(0)
    for (const row of revenueRows) {
      const i = slotOf(row.year, row.month)
      if (i >= 0) mrr[i] = Number(row.revenue)
    }

    const trialOrgs = Array<number>(months).fill(0)
    for (const row of newTrialsRows) {
      const i = slotOf(row.year, row.month)
      if (i >= 0) trialOrgs[i] = Number(row.count)
    }

    const overdueInvoices = Array<number>(months).fill(0)
    for (const row of overdueRows) {
      const i = slotOf(row.year, row.month)
      if (i >= 0) overdueInvoices[i] = Number(row.count)
    }

    // cumulative count of new orgs in window up to each slot's end (mirrors original behavior)
    const activeOrgs = Array<number>(months).fill(0)
    let cumOrgs = 0
    for (let i = 0; i < months; i++) {
      const s = slots[i]
      const row = newOrgsRows.find(
        (r) => r.year === s.start.getFullYear() && r.month === s.start.getMonth() + 1,
      )
      cumOrgs += row ? Number(row.count) : 0
      activeOrgs[i] = cumOrgs
    }

    const last = months - 1
    const prev = months - 2

    const delta = (arr: number[], i: number, j: number) => arr[j] - arr[i]
    const pctDelta = (arr: number[], i: number, j: number) =>
      arr[i] === 0 ? 0 : Math.round(((arr[j] - arr[i]) / arr[i]) * 1000) / 10

    return {
      months,
      mrr,
      activeOrgs,
      trialOrgs,
      // suspendedOrgs is a snapshot metric; not derivable from createdAt alone
      suspendedOrgs: Array(months).fill(0) as number[],
      overdueInvoices,
      mrrDelta: pctDelta(mrr, prev, last),
      activeOrgsDelta: delta(activeOrgs, prev, last),
      trialOrgsDelta: delta(trialOrgs, prev, last),
      suspendedOrgsDelta: 0,
      overdueInvoicesDelta: delta(overdueInvoices, prev, last),
    }
  }

  async getOrganizationsByPeriod(period: 'week' | 'month' | 'year' = 'month') {
    const now = new Date()
    const ranges = {
      week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      month: new Date(now.getFullYear(), now.getMonth() - 11, 1),
      year: new Date(now.getFullYear() - 1, 0, 1),
    }

    return this.prisma.organization.findMany({
      where: { createdAt: { gte: ranges[period] } },
      select: { id: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
  }
}
