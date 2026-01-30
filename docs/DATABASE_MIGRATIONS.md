# Database Migration Guide

## The Problem

We have two separate databases:
- **DEV**: `ep-jolly-breeze-ahyfy0l4-pooler` (local development)
- **PROD**: `ep-crimson-pond-ah4ykmjb-pooler` (Vercel production)

When schema changes are made and migrations are created locally, they only apply to the DEV database. The PROD database doesn't receive these changes automatically, causing 500 errors when the code tries to access tables that don't exist.

## Solution: Automated Migration on Build

### 1. Update package.json build script

The build script should run migrations before building:

```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

This ensures:
- `prisma generate` - Generates the Prisma client with latest schema
- `prisma migrate deploy` - Applies any pending migrations to the connected database
- `next build` - Builds the Next.js application

### 2. Ensure Vercel has the correct DATABASE_URL

In Vercel project settings → Environment Variables:
- `DATABASE_URL` should point to the PROD database
- This is already configured, but verify it matches: `ep-crimson-pond-ah4ykmjb-pooler`

## Migration Workflow

### When making schema changes:

1. **Modify the Prisma schema** (`prisma/schema.prisma`)

2. **Create a migration locally**:
   ```bash
   npm run db:migrate
   # or: npx prisma migrate dev --name descriptive_name
   ```

3. **Test locally** to ensure it works

4. **Commit the migration files**:
   ```bash
   git add prisma/migrations/
   git commit -m "feat: add new_feature migration"
   ```

5. **Push to main** - Vercel will:
   - Run `prisma migrate deploy` (applies migrations to PROD)
   - Build and deploy the app

### Manual migration (if needed):

To manually apply migrations to PROD:
```bash
DATABASE_URL="postgresql://...@ep-crimson-pond-ah4ykmjb-pooler.../neondb?sslmode=require" npx prisma migrate deploy
```

## Checklist Before Deploying Schema Changes

- [ ] Migration file created and committed in `prisma/migrations/`
- [ ] Tested locally with dev database
- [ ] Build script includes `prisma migrate deploy`
- [ ] Vercel DATABASE_URL points to PROD database

## Troubleshooting

### "Table does not exist" errors in production
1. Check if migration files exist in `prisma/migrations/`
2. Run `prisma migrate deploy` against PROD database manually
3. Verify Vercel's DATABASE_URL environment variable

### Migration conflicts
1. Never edit existing migration files
2. Create new migrations for fixes
3. Use `prisma migrate resolve` if needed to mark migrations as applied
