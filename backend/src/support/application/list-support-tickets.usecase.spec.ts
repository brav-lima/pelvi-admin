import { ListSupportTicketsUseCase } from './list-support-tickets.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'

describe('ListSupportTicketsUseCase', () => {
  it('delegates to the repository with the given filter and returns its result', async () => {
    const paginated = { data: [], total: 0 }
    const repo = { findAll: jest.fn().mockResolvedValue(paginated) } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new ListSupportTicketsUseCase(repo)

    const result = await sut.execute({ status: 'OPEN', page: 2, limit: 10 })

    expect(repo.findAll).toHaveBeenCalledWith({ status: 'OPEN', page: 2, limit: 10 })
    expect(result).toBe(paginated)
  })
})
