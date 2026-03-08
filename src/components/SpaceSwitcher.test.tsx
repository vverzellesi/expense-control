import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SpaceSwitcher } from './SpaceSwitcher'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock window.location.reload
const mockReload = vi.fn()
Object.defineProperty(window, 'location', {
  value: { reload: mockReload },
  writable: true,
})

const mockMemberships = [
  {
    role: 'ADMIN',
    space: { id: 'space-1', name: 'Família Silva' },
  },
]

describe('SpaceSwitcher', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockReload.mockReset()
  })

  it('renders nothing when user has no spaces', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    const { container } = render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })

  it('renders switcher when user has spaces', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMemberships),
    })

    render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(screen.getByText('Minha Conta')).toBeInTheDocument()
    })
  })

  it('shows personal account as default label', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMemberships),
    })

    render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(screen.getByText('Minha Conta')).toBeInTheDocument()
    })
  })

  it('switches to space when clicked', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemberships),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ activeSpaceId: 'space-1' }),
      })

    render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(screen.getByText('Minha Conta')).toBeInTheDocument()
    })

    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: /minha conta/i }))

    // Click on space
    await waitFor(() => {
      expect(screen.getByText('Família Silva')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Família Silva'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/spaces/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId: 'space-1' }),
      })
    })
  })

  it('handles fetch error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    const { container } = render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })
})
