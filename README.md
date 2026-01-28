# MyPocket

A personal finance management app with smart transaction categorization, built with Next.js and Prisma.

## Features

- **Smart Auto-Categorization** - Rules engine that automatically categorizes transactions based on descriptions
- **Multi-Bank CSV Import** - Supports C6, Itaú, and BTG bank statement formats
- **Recurring Expense Tracking** - Detects and manages subscription patterns (Netflix, Spotify, etc.)
- **Installment Management** - Tracks multi-month payments and parses installment info from descriptions
- **Budget Monitoring** - Set category-level spending limits with alerts
- **OCR Invoice Scanning** - Extract transaction data from PDF/image invoices
- **Financial Reports** - Visualize spending patterns with charts and breakdowns

## Tech Stack

- **Next.js 14** with App Router
- **TypeScript** with strict mode
- **Prisma** ORM with SQLite
- **Tailwind CSS** + **Radix UI**
- **Recharts** for data visualization
- **NextAuth.js** for authentication

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Seed default categories and rules
npm run db:seed

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Demo Account

To seed a demo account with sample data:

```bash
npm run db:seed-demo
```

## Project Structure

```
src/
├── app/                 # Next.js App Router pages and API routes
│   ├── api/            # REST API endpoints
│   ├── auth/           # Authentication pages
│   ├── dashboard/      # Main dashboard
│   └── ...             # Other feature pages
├── components/
│   ├── landing/        # Landing page sections
│   ├── ui/             # Reusable UI primitives
│   └── ...             # Feature components
├── lib/                # Core utilities
│   ├── categorizer.ts  # Auto-categorization engine
│   ├── csv-parser.ts   # Multi-bank CSV parser
│   └── utils.ts        # Formatters and helpers
└── types/              # TypeScript interfaces
```

## Localization

The app is localized for Brazilian Portuguese:
- Currency: BRL (Brazilian Real)
- Date format: DD/MM/YYYY

## License

Private project.
