import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TransactionForm } from './TransactionForm'

// Mock ResizeObserver for Radix UI
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Mock useToast
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

const defaultProps = {
  categories: [
    { id: 'cat-1', name: 'Alimentação', color: '#ff0000', icon: null, userId: 'u1', spaceId: null },
  ] as any[],
  origins: [
    { id: 'org-1', name: 'Nubank', userId: 'u1', spaceId: null, createdAt: new Date(), updatedAt: new Date() },
  ] as any[],
  transaction: null,
  onSuccess: vi.fn(),
  onCancel: vi.fn(),
}

describe('TransactionForm - isPrivate toggle', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should show privacy toggle when user has spaces', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'm1', spaceId: 's1', space: { id: 's1', name: 'Família' } }],
    })

    render(<TransactionForm {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Transação privada')).toBeInTheDocument()
    })
  })

  it('should NOT show privacy toggle when user has no spaces', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    render(<TransactionForm {...defaultProps} />)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/spaces')
    })

    expect(screen.queryByLabelText('Transação privada')).not.toBeInTheDocument()
  })

  it('should default isPrivate to false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'm1', spaceId: 's1', space: { id: 's1', name: 'Família' } }],
    })

    render(<TransactionForm {...defaultProps} />)

    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: 'Transação privada' })
      expect(toggle).toBeInTheDocument()
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })
  })
})
