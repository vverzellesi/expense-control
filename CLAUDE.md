# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev           # Start development server
npm run build         # Production build
npm run lint          # Run ESLint

# Database commands
npm run db:generate   # Generate Prisma client after schema changes
npm run db:migrate    # Create and run database migrations
npm run db:push       # Push schema changes directly (no migration)
npm run db:seed       # Seed database with default categories and rules
npm run db:seed-demo  # Seed demo account with sample data
```

## Tech Stack

- **Next.js 14** with App Router
- **TypeScript** with strict mode
- **Prisma** ORM with SQLite (database at `prisma/data/expense-control.db`)
- **Tailwind CSS** + **Radix UI** for styling and components
- **Recharts** for data visualization
- **tesseract.js** for OCR invoice scanning
- **papaparse** for CSV parsing

## Architecture Overview

**MyPocket** is a personal finance management app with smart transaction categorization. The UI uses emerald color branding throughout.

### Route Structure

- `/` - Public landing page (unauthenticated)
- `/dashboard` - Main authenticated dashboard
- `/auth/login`, `/auth/register` - Authentication pages
- All other routes require authentication

### Directory Structure

- `/src/app` - Next.js App Router pages and API routes
- `/src/components` - React components (UI primitives in `/ui`)
- `/src/components/landing` - Landing page sections (HeroSection, FAQ, etc.)
- `/src/lib` - Core utilities: database singleton, formatters, smart categorization
- `/src/types` - TypeScript interfaces for all domain models
- `/prisma` - Database schema and migrations

### Data Models (Prisma)

- **Transaction** - Core entity linked to Category, Installment, RecurringExpense
- **Category** - Expense classification with color coding
- **RecurringExpense** - Automated monthly transaction generation
- **Installment** - Multi-month payment tracking
- **Origin** - Payment method/bank tracking
- **Budget** - Category-level spending limits
- **CategoryRule** - Keyword-based auto-categorization rules

### Smart Features

1. **Auto-Categorization** (`/src/lib/categorizer.ts`) - Rules engine matching descriptions to categories with in-memory caching
2. **Recurring Pattern Detection** - 100+ patterns for subscriptions (Netflix, Spotify, etc.)
3. **Installment Detection** - Parses "3/10" or "PARCELA 3 DE 10" from descriptions
4. **Multi-Bank CSV Import** (`/src/lib/csv-parser.ts`) - Detects and parses C6, Itaú, BTG formats
5. **OCR Invoice Scanning** - PDF/image extraction via tesseract.js

### API Patterns

- RESTful endpoints in `/src/app/api/`
- Query parameters for filtering: `month`, `year`, `categoryId`, `type`, `isFixed`, `isInstallment`
- Transactional operations for linked entities (e.g., installment creation generates multiple transactions)

## Localization

- All UI text is in **Portuguese (Brazil)**
- Currency: **BRL** (Brazilian Real)
- Date format: **DD/MM/YYYY**
- Use `formatCurrency()` and `formatDate()` from `/src/lib/utils.ts`

## Path Alias

TypeScript path alias: `@/*` maps to `./src/*`
