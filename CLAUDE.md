# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lingua API is a NestJS-based backend service for media transcription. It manages media uploads, transcription processing, and user authentication. The application uses PostgreSQL (via Prisma ORM) for data persistence and JWT for authentication.

## Development Commands

**Package Manager:** This project uses `pnpm` (not npm/yarn)

```bash
# Install dependencies
pnpm install

# Development server (watch mode)
pnpm run start:dev

# Build
pnpm run build

# Linting
pnpm run lint

# Format code
pnpm run format

# Tests
pnpm run test              # Run all tests
pnpm run test:watch        # Watch mode
pnpm run test:cov          # With coverage
pnpm run test:e2e          # E2E tests

# Prisma commands
npx prisma generate                    # Generate Prisma Client
npx prisma migrate dev --name <name>   # Create and apply migration
npx prisma studio                      # Open Prisma Studio
```

## Architecture

### Application Structure

- **NestJS Framework**: Standard NestJS module-based architecture
- **Port**: Application runs on port 4000 (configurable via `PORT` env variable)
- **CORS**: Configured to allow `http://localhost:3000` with credentials

### Configuration Management

The application uses `@nestjs/config` with global configuration enabled:
- Environment variables are loaded from `.env` file
- `ConfigModule.forRoot({ isGlobal: true })` is set in `AppModule`
- All modules can inject `ConfigService` to access environment variables

**Required Environment Variables:**
- `JWT_SECRET` - Secret for JWT token signing
- `PORT` - Server port (default: 4000)
- `DATABASE_URL` - PostgreSQL connection string

### Authentication

JWT-based authentication using Passport:
- **Dev Login Endpoint**: `POST /auth/dev-login` - Development-only login that generates JWT without password verification
- **Protected Routes**: Use `@UseGuards(AuthGuard('jwt'))` decorator
- **Strategy**: `JwtStrategy` validates JWT tokens and extracts user payload
- **Token Payload**: `{ sub: string, email: string }`

**Important**: When working with `passport-jwt` in this codebase:
- The project uses `tsconfig.json` with `"module": "nodenext"` which can cause type errors with CommonJS libraries like `passport-jwt`
- To avoid TypeScript errors, use explicit type imports and avoid directly passing objects to `super()` in strategies
- Include `eslint-disable` comments for unavoidable type safety warnings from passport-jwt

### Database Schema (Prisma)

**Models:**
- `User` - User accounts with email/password
- `Media` - Media files owned by users, with transcription status tracking
- `TranscriptSentence` - Individual sentences from transcriptions with timing

**Media Status Workflow:**
```
queued → processing → done (or failed)
```

**Key Relationships:**
- User has many Media (one-to-many)
- Media has many TranscriptSentence (one-to-many)

### Module Organization

**DevModule** (`src/dev/`):
- Development utilities and authentication helpers
- Configures JWT with async registration using `ConfigService`
- Provides `JwtStrategy` for authentication
- **Pattern to follow**: Use `JwtModule.registerAsync()` with `useFactory` to inject `ConfigService` for dynamic configuration

**AppModule** (`src/app.module.ts`):
- Root module that imports `ConfigModule` globally and all feature modules
- **Pattern**: All feature modules should be registered in the `imports` array

## TypeScript Configuration

- Uses modern ESM modules (`"module": "nodenext"`)
- Strict null checks enabled
- Decorators enabled for NestJS
- Target: ES2023
