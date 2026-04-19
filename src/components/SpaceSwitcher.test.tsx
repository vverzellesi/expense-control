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

// The component calls two endpoints in parallel: /api/spaces and
// /api/spaces/active/permissions. Route responses by URL so tests don't
// have to care about resolution order.
function mockSpacesApi(options: {
  spaces?: unknown
  spacesOk?: boolean
  permissions?: unknown
  permissionsOk?: boolean
} = {}) {
  const {
    spaces = mockMemberships,
    spacesOk = true,
    permissions = { isSpaceContext: false, spaceId: null },
    permissionsOk = true,
  } = options

  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/spaces') {
      return Promise.resolve({ ok: spacesOk, json: () => Promise.resolve(spaces) })
    }
    if (url === '/api/spaces/active/permissions') {
      return Promise.resolve({ ok: permissionsOk, json: () => Promise.resolve(permissions) })
    }
    if (url === '/api/spaces/active') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('SpaceSwitcher', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockReload.mockReset()
  })

  it('renders nothing when user has no spaces', async () => {
    mockSpacesApi({ spaces: [] })

    const { container } = render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })

  it('renders switcher when user has spaces', async () => {
    mockSpacesApi()

    render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(screen.getByText('Minha Conta')).toBeInTheDocument()
    })
  })

  it('shows personal account as default label', async () => {
    mockSpacesApi()

    render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(screen.getByText('Minha Conta')).toBeInTheDocument()
    })
  })

  it('switches to space when clicked', async () => {
    mockSpacesApi()

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
    mockSpacesApi({ spacesOk: false, spaces: { error: 'Unauthorized' } })

    const { container } = render(<SpaceSwitcher />)

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })
})
