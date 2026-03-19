import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock recharts to render testable elements
vi.mock('recharts', () => {
  const MockPie = ({ data, onClick, children }: { data?: Array<{ name: string; categoryId: string }>; onClick?: (data: unknown, index: number) => void; children?: React.ReactNode }) => (
    <div data-testid="pie">
      {data?.map((entry, index) => (
        <div
          key={index}
          data-testid={`pie-slice-${index}`}
          onClick={() => onClick?.(entry, index)}
        >
          {entry.name}
        </div>
      ))}
      {children}
    </div>
  )

  return {
    PieChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
    Pie: MockPie,
    Cell: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: () => null,
    Legend: () => null,
  }
})

vi.mock('@/lib/hooks', () => ({
  useMediaQuery: () => false,
}))

import { CategoryPieChart } from './CategoryPieChart'

const mockData = [
  { categoryId: 'cat-1', categoryName: 'Alimentação', categoryColor: '#ef4444', total: 500, percentage: 50 },
  { categoryId: 'cat-2', categoryName: 'Transporte', categoryColor: '#3b82f6', total: 300, percentage: 30 },
  { categoryId: 'cat-3', categoryName: 'Lazer', categoryColor: '#8b5cf6', total: 200, percentage: 20 },
]

describe('CategoryPieChart', () => {
  it('renders all categories', () => {
    render(<CategoryPieChart data={mockData} />)
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
    expect(screen.getByText('Lazer')).toBeInTheDocument()
  })

  it('calls onCategoryClick with correct categoryId when a slice is clicked', () => {
    const handleClick = vi.fn()
    render(<CategoryPieChart data={mockData} onCategoryClick={handleClick} />)

    fireEvent.click(screen.getByTestId('pie-slice-0'))
    expect(handleClick).toHaveBeenCalledWith('cat-1')

    fireEvent.click(screen.getByTestId('pie-slice-2'))
    expect(handleClick).toHaveBeenCalledWith('cat-3')
  })

  it('does not throw when clicked without onCategoryClick', () => {
    render(<CategoryPieChart data={mockData} />)
    expect(() => fireEvent.click(screen.getByTestId('pie-slice-0'))).not.toThrow()
  })
})
