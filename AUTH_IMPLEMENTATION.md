# Authentication Module Implementation

## Overview

This document provides a comprehensive overview of the authentication system implemented for the Lingua API using NestJS, Prisma, JWT, and bcrypt.

## Architecture

The authentication module follows NestJS best practices with a clean, layered architecture:

```
src/
├── auth/
│   ├── dto/
│   │   ├── register.dto.ts    # Registration validation
│   │   ├── login.dto.ts       # Login validation
│   │   └── index.ts           # DTO barrel export
│   ├── guards/
│   │   └── jwt-auth.guard.ts  # JWT authentication guard
│   ├── auth.controller.ts     # Authentication endpoints
│   ├── auth.service.ts        # Business logic
│   ├── auth.module.ts         # Module configuration
│   └── jwt.strategy.ts        # JWT validation strategy (existing)
└── prisma/
    ├── prisma.service.ts      # Database client
    └── prisma.module.ts       # Global Prisma module
```

## Implementation Details

### 1. DTOs (Data Transfer Objects)

**File: `/Users/kaowilson/lingua-api/src/auth/dto/register.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(100, { message: 'Password must not exceed 100 characters' })
  password: string;
}
```

**File: `/Users/kaowilson/lingua-api/src/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
```

**Validation Rules:**
- Email must be a valid email format
- Password must be at least 8 characters (registration)
- All fields are required
- Automatic validation via global ValidationPipe

### 2. Auth Service

**File: `/Users/kaowilson/lingua-api/src/auth/auth.service.ts`**

**Key Methods:**

#### `register(email: string, password: string)`
- Checks if user already exists (throws ConflictException if exists)
- Hashes password using bcrypt with 10 salt rounds
- Creates new user in database
- Returns user data (excludes password)

**Password Hashing:**
```typescript
const hashedPassword = await bcrypt.hash(password, this.saltRounds);
```

#### `login(email: string, password: string)`
- Finds user by email
- Validates password using bcrypt.compare()
- Generates JWT token with 7-day expiration
- Returns access token and user data

**Password Validation:**
```typescript
const isPasswordValid = await bcrypt.compare(password, user.password);
```

**JWT Token Generation:**
```typescript
const payload = { sub: user.id, email: user.email };
const accessToken = this.jwtService.sign(payload, {
  secret: JWT_SECRET,
  expiresIn: '7d'
});
```

#### `validateUser(userId: string)`
- Used by JWT strategy to validate tokens
- Returns user data by ID
- Throws UnauthorizedException if user not found

### 3. Auth Controller

**File: `/Users/kaowilson/lingua-api/src/auth/auth.controller.ts`**

**Endpoints:**

#### `POST /auth/register`
- Accepts: `{ email: string, password: string }`
- Returns: `{ message: string, user: { id, email, createdAt } }`
- Status Code: 201 Created

**Example Request:**
```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass123"}'
```

#### `POST /auth/login`
- Accepts: `{ email: string, password: string }`
- Returns: `{ access_token: string, user: { id, email } }`
- Status Code: 200 OK

**Example Request:**
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass123"}'
```

**Example Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx123abc",
    "email": "user@example.com"
  }
}
```

#### `GET /auth/me`
- Protected endpoint (requires JWT token)
- Returns current user profile
- Requires: `Authorization: Bearer <token>` header

**Example Request:**
```bash
curl -X GET http://localhost:4000/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 4. JWT Strategy & Guard

**File: `/Users/kaowilson/lingua-api/src/auth/jwt.strategy.ts`** (existing)
- Validates JWT tokens
- Extracts token from Authorization header
- Returns payload for authenticated requests

**File: `/Users/kaowilson/lingua-api/src/auth/guards/jwt-auth.guard.ts`**
- Protects routes requiring authentication
- Usage: `@UseGuards(JwtAuthGuard)`

**Example Protected Route:**
```typescript
@Get('profile')
@UseGuards(JwtAuthGuard)
async getProfile(@Request() req) {
  // req.user contains { sub: userId, email: userEmail }
  return this.userService.findById(req.user.sub);
}
```

### 5. Auth Module

**File: `/Users/kaowilson/lingua-api/src/auth/auth.module.ts`**

**Configuration:**
- Imports PrismaModule for database access
- Configures PassportModule with JWT strategy
- Configures JwtModule with async factory pattern
- Exports AuthService, JwtStrategy, and PassportModule for use in other modules

### 6. Prisma Module

**File: `/Users/kaowilson/lingua-api/src/prisma/prisma.service.ts`**
- Extends PrismaClient for database operations
- Implements lifecycle hooks for connection management
- Connects on module initialization
- Disconnects on module destruction

**File: `/Users/kaowilson/lingua-api/src/prisma/prisma.module.ts`**
- Global module (available everywhere)
- Exports PrismaService for dependency injection

### 7. Global Configuration

**File: `/Users/kaowilson/lingua-api/src/main.ts`**

**ValidationPipe Configuration:**
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // Remove non-whitelisted properties
    forbidNonWhitelisted: true,   // Throw error for unknown properties
    transform: true,              // Auto-transform to DTO instances
  }),
);
```

**File: `/Users/kaowilson/lingua-api/src/app.module.ts`**
- Imports PrismaModule (global)
- Imports AuthModule
- ConfigModule is global (JWT_SECRET available everywhere)

## Security Features

### Password Security
- Passwords hashed using bcrypt with 10 salt rounds
- Plain text passwords never stored
- Passwords excluded from API responses

### JWT Security
- Tokens expire after 7 days
- Secret loaded from environment variables
- Tokens validated on every protected request
- Invalid/expired tokens throw UnauthorizedException

### Input Validation
- Email format validation
- Password length requirements (8-100 characters)
- Automatic sanitization via whitelist
- Unknown properties rejected

### Error Handling
- User-friendly error messages
- No sensitive information leaked
- Proper HTTP status codes:
  - 201: Registration success
  - 200: Login success
  - 401: Invalid credentials
  - 409: User already exists

## Environment Variables

**File: `/Users/kaowilson/lingua-api/.env`**

Required variables:
```env
JWT_SECRET=change-me-dev      # Change in production!
DATABASE_URL=postgresql://...
PORT=4000
```

**Important:** Change `JWT_SECRET` to a strong, random string in production.

## Database Schema

**File: `/Users/kaowilson/lingua-api/prisma/schema.prisma`**

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  medias    Media[]
}
```

## Usage Examples

### 1. User Registration Flow

```typescript
// Frontend code example
const register = async (email: string, password: string) => {
  const response = await fetch('http://localhost:4000/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
};
```

### 2. User Login Flow

```typescript
const login = async (email: string, password: string) => {
  const response = await fetch('http://localhost:4000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  // Store token (e.g., localStorage, sessionStorage, or cookie)
  localStorage.setItem('access_token', data.access_token);

  return data;
};
```

### 3. Authenticated Request

```typescript
const getProfile = async () => {
  const token = localStorage.getItem('access_token');

  const response = await fetch('http://localhost:4000/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return await response.json();
};
```

### 4. Protecting Routes in Other Modules

```typescript
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('media')
export class MediaController {
  @Get()
  @UseGuards(JwtAuthGuard)
  async getUserMedia(@Request() req) {
    // req.user.sub contains the user ID
    const userId = req.user.sub;
    return this.mediaService.findByUserId(userId);
  }
}
```

## Testing

### Unit Tests

Example test for AuthService:

```typescript
describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        // ... other mocks
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should hash password before storing', async () => {
    const result = await service.register('test@test.com', 'password123');
    expect(result.user.password).not.toBe('password123');
  });
});
```

### E2E Tests

Example test for auth endpoints:

```typescript
describe('AuthController (e2e)', () => {
  it('/auth/register (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@test.com', password: 'password123' })
      .expect(201)
      .expect((res) => {
        expect(res.body.user.email).toBe('test@test.com');
        expect(res.body.user.password).toBeUndefined();
      });
  });
});
```

## Migration Checklist

If you need to run migrations:

```bash
# Generate Prisma client
npx prisma generate

# Create and run migrations
npx prisma migrate dev --name add_auth

# Or push schema directly (development only)
npx prisma db push
```

## Common Issues & Solutions

### Issue: JWT_SECRET not defined
**Solution:** Ensure `.env` file has `JWT_SECRET=your-secret-key`

### Issue: Prisma Client not generated
**Solution:** Run `npx prisma generate`

### Issue: Validation not working
**Solution:** Ensure ValidationPipe is configured globally in `main.ts`

### Issue: 401 Unauthorized on protected routes
**Solution:** Ensure token is sent in `Authorization: Bearer <token>` header

## Next Steps

Recommended enhancements:

1. **Email Verification**: Add email confirmation flow
2. **Password Reset**: Implement forgot password functionality
3. **Refresh Tokens**: Add refresh token mechanism
4. **Rate Limiting**: Add throttling to prevent brute force attacks
5. **2FA**: Add two-factor authentication
6. **OAuth**: Add social login (Google, GitHub, etc.)
7. **Role-Based Access Control**: Add user roles and permissions
8. **Password Strength**: Add password strength requirements
9. **Account Lockout**: Lock account after failed attempts
10. **Audit Logging**: Log authentication events

## Dependencies

All required dependencies are already installed:

```json
{
  "@nestjs/jwt": "^11.0.1",
  "@nestjs/passport": "^11.0.5",
  "bcrypt": "^6.0.0",
  "class-validator": "^0.14.2",
  "class-transformer": "^0.5.1",
  "passport": "^0.7.0",
  "passport-jwt": "^4.0.1"
}
```

## Summary

The authentication module provides:
- Secure user registration with password hashing
- JWT-based login system
- Protected routes using guards
- Input validation with DTOs
- Proper error handling
- Integration with Prisma ORM
- Production-ready architecture following NestJS best practices

All endpoints are now available at:
- `POST http://localhost:4000/auth/register`
- `POST http://localhost:4000/auth/login`
- `GET http://localhost:4000/auth/me` (protected)
