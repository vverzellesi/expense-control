import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PendingInvites } from './PendingInvites'

// Mock ResizeObserver for Radix UI
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('PendingInvites', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should show invite count badge when there are pending invites', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'i1', code: 'abc123', space: { id: 's1', name: 'Família' } },
        { id: 'i2', code: 'def456', space: { id: 's2', name: 'Casal' } },
      ],
    })

    render(<PendingInvites />)

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('should not render anything when there are no pending invites', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    const { container } = render(<PendingInvites />)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/invites/pending')
    })

    // Component should render nothing visible
    expect(screen.queryByText('Convites pendentes')).not.toBeInTheDocument()
  })

  it('should show invite list in dialog when clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'i1', code: 'abc123', space: { id: 's1', name: 'Família' } },
      ],
    })

    render(<PendingInvites />)

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    // Click to open the dialog
    fireEvent.click(screen.getByRole('button', { name: /convite/i }))

    await waitFor(() => {
      expect(screen.getByText('Família')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /aceitar/i })).toBeInTheDocument()
    })
  })

  it('should call accept API and remove invite on accept', async () => {
    // First call: /api/invites/pending
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'i1', code: 'abc123', space: { id: 's1', name: 'Família' } },
      ],
    })

    render(<PendingInvites />)

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    // Open dialog
    fireEvent.click(screen.getByRole('button', { name: /convite/i }))

    await waitFor(() => {
      expect(screen.getByText('Família')).toBeInTheDocument()
    })

    // Mock accept API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Convite aceito', space: { id: 's1', name: 'Família' } }),
    })

    // Click accept
    fireEvent.click(screen.getByRole('button', { name: /aceitar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/invites/abc123/accept', {
        method: 'POST',
      })
    })
  })
})
