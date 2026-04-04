# BOR2 — Business Operations Review (Rewrite)

Operational intelligence platform built with Go/Fiber API and Next.js frontend.

## Architecture

- **Backend**: Go 1.21 + Fiber v2 (Railway)
- **Frontend**: Next.js 16.2 + React Query + Tailwind CSS (Vercel)
- **Database**: PostgreSQL (Railway)
- **Storage**: Supabase (Premium Storage Inventory)
- **Auth**: Better Auth

## Local Setup

### Prerequisites
- Go 1.21+
- Node.js 20+
- PostgreSQL 15+

### API Setup

```bash
cd BOR2/apps/api

# Copy environment variables
cp .env.example .env

# Update .env with local database URL and secrets
# Example: DATABASE_URL=postgresql://postgres:password@localhost:5432/bor2_dev

# Run migrations
go run ./cmd/datamigrate2/main.go

# Start server
go run ./cmd/api/main.go
```

Server will run on `http://localhost:8080`

### Frontend Setup

```bash
cd BOR2/apps/web

# Copy environment variables
cp .env.example .env.local

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend will run on `http://localhost:3000`

## Pages Implemented (17 total)

### Dashboard
- `GET /dashboard` — Overview with key metrics

### Operational Efficiency
- `GET /monthly-execution` — Project execution by month
- `GET /workforce` — Labor productivity and hours tracking
- `GET /subcontractors` — Subcontractor performance

### Forecast & Metrics
- `GET /forecast` — Project forecast management (CRUD)
- `GET /ofi` — Operational Forecast Index

### Inventory & Control
- `GET /inventory` — Premium Storage integration (consumption vs limits)
- `GET /permits` — Permit tracking and management
- `GET /data-control` — Data forecast control panel

### Operations
- `GET /service-requests` — Service request tracking
- `GET /project-monitoring` — HVAC monitoring
- `GET /accounting` — Financial tracking (companies: HVAC, Framing, PCG)
- `GET /fuel` — Fuel consumption (Samsara, Wex integrations)
- `GET /timesheet` — Timesheet management
- `GET /takeoff` — Framing takeoff works (DWG → Assembly stages)
- `GET /upload-timesheet` — CSV upload for bulk timesheet entry
- `GET /settings` — User permissions and screen access control

## API Endpoints

### Auth
- `POST /api/v1/auth/login` — Login
- `POST /api/v1/auth/logout` — Logout
- `GET /api/v1/auth/me` — Current user
- `POST /api/v1/auth/change-password` — Change password

### Protected Routes (require auth)
- `/api/v1/forecast/*` — CRUD operations
- `/api/v1/accounting/*` — Financial data
- `/api/v1/permits/*` — Permit management
- `/api/v1/service-requests/*` — Service requests
- `/api/v1/timesheets/*` — Timesheet data
- `/api/v1/inventory` — Premium Storage proxy
- `/api/v1/settings/screens` — List available screens
- `/api/v1/settings/users` — User permission management

## Deployment

### Railway (API)

1. Create Railway project
2. Add PostgreSQL plugin
3. Link GitHub repo (BOR2/apps/api)
4. Set environment variables:
   ```
   DATABASE_URL=<railway-postgres-url>
   API_PORT=8080
   APP_ENV=production
   BETTER_AUTH_SECRET=<generate-secret>
   BETTER_AUTH_URL=https://your-api-domain.railway.app
   ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app
   GMAIL_USER=<your-gmail>
   GMAIL_APP_PASSWORD=<app-password>
   PREMIUM_STORAGE_URL=<supabase-url>
   PREMIUM_STORAGE_KEY=<supabase-key>
   ```
5. Deploy (Dockerfile will be used automatically)

### Vercel (Frontend)

1. Create Vercel project
2. Link GitHub repo (BOR2/apps/web)
3. Set build settings:
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Root Directory: `BOR2/apps/web`
4. Set environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-api-domain.com
   ```
5. Deploy

## Testing

### Manual Testing
```bash
# Test API health
curl http://localhost:8080/health

# Test frontend build
npm run build

# Test API endpoints
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/v1/settings/screens
```

### Mock Data
Pages automatically fall back to mock data when API returns empty. This enables UI testing without a fully functional backend.

## Database Migrations

Migrations are auto-applied on startup using Flyway-style naming:
- `000001_init.up.sql` — Initial schema
- `000013_seed_telas.up.sql` — Screen definitions (18 screens)

Run manually if needed:
```bash
go run ./cmd/datamigrate2/main.go
```

## Environment Variables

See `.env.example` files in each app directory for all required variables.

**Critical Variables:**
- `DATABASE_URL` — PostgreSQL connection string (API)
- `NEXT_PUBLIC_API_URL` — Backend URL (Frontend)
- `PREMIUM_STORAGE_URL` & `PREMIUM_STORAGE_KEY` — Supabase access
- `BETTER_AUTH_SECRET` — Authentication secret (min 32 chars)

## Support

For issues or questions, refer to the AGENTS.md file in BOR2/apps/web.
