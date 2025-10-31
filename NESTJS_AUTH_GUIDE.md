# NestJS 認證 API 實作指南

本文件說明如何在 NestJS 中從零開始實作完整的使用者註冊和登入功能。

## 目錄

1. [架構概覽](#架構概覽)
2. [必要依賴](#必要依賴)
3. [資料庫設定](#資料庫設定)
4. [實作步驟](#實作步驟)
5. [測試 API](#測試-api)

---

## 架構概覽

NestJS 認證系統的核心組件：

```
┌─────────────────────────────────────────────────────────┐
│                      前端應用                            │
└────────────┬────────────────────────────────────────────┘
             │
             │ HTTP Requests
             │
┌────────────▼────────────────────────────────────────────┐
│                   Auth Controller                        │
│  • POST /auth/register  註冊                            │
│  • POST /auth/login     登入                            │
│  • GET  /auth/me        取得用戶資訊（需要 JWT）         │
└────────────┬────────────────────────────────────────────┘
             │
             │ 調用服務層
             │
┌────────────▼────────────────────────────────────────────┐
│                    Auth Service                          │
│  • register()      - 處理註冊邏輯                        │
│  • login()         - 驗證並生成 JWT                      │
│  • validateUser()  - 驗證用戶身份                        │
└────────────┬────────────────────────────────────────────┘
             │
             │ 資料庫操作
             │
┌────────────▼────────────────────────────────────────────┐
│                   Prisma Service                         │
│  • user.create()   - 創建新用戶                          │
│  • user.findUnique() - 查詢用戶                          │
└─────────────────────────────────────────────────────────┘
             │
             │
┌────────────▼────────────────────────────────────────────┐
│                   PostgreSQL 資料庫                      │
└─────────────────────────────────────────────────────────┘

Protected Routes 保護機制：

┌─────────────────────────────────────────────────────────┐
│  請求 → JwtAuthGuard → JwtStrategy → 驗證 Token          │
│           │               │                              │
│           │               └─ 解碼 JWT payload            │
│           │                                              │
│           └─ 注入用戶資訊到 req.user                      │
└─────────────────────────────────────────────────────────┘
```

---

## 必要依賴

### 1. 安裝套件

```bash
# NestJS 認證相關
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt

# 密碼加密
pnpm add bcrypt

# 資料驗證
pnpm add class-validator class-transformer

# 環境變數管理
pnpm add @nestjs/config

# Prisma ORM
pnpm add @prisma/client
pnpm add -D prisma

# TypeScript 類型定義
pnpm add -D @types/passport-jwt @types/bcrypt
```

### 2. 環境變數設定

創建 `.env` 檔案：

```env
JWT_SECRET=your-secret-key-here
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/database_name
```

---

## 資料庫設定

### 1. Prisma Schema

在 `prisma/schema.prisma` 定義 User 模型：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
}
```

### 2. 生成並執行 Migration

```bash
# 生成 Prisma Client
npx prisma generate

# 創建資料表
npx prisma db push
```

---

## 實作步驟

### 步驟 1：創建 Prisma Module

為了在整個應用程式中共享 Prisma 服務，創建一個全域模組。

#### `src/prisma/prisma.service.ts`

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

#### `src/prisma/prisma.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**為什麼要使用 @Global()？**
- 讓 PrismaService 在所有模組中都可用，不需要重複 import

---

### 步驟 2：創建 DTO (Data Transfer Objects)

DTO 用於驗證和類型檢查輸入資料。

#### `src/auth/dto/register.dto.ts`

```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password must not exceed 100 characters' })
  password: string;
}
```

#### `src/auth/dto/login.dto.ts`

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

**DTO 的作用：**
- 自動驗證請求資料
- 提供清晰的 API 介面
- TypeScript 類型安全

---

### 步驟 3：實作 Auth Service

Service 層包含所有業務邏輯。

#### `src/auth/auth.service.ts`

```typescript
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  /**
   * 註冊新用戶
   */
  async register(dto: RegisterDto) {
    // 1. 檢查 email 是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // 2. 加密密碼（使用 bcrypt，salt rounds = 10）
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // 3. 創建新用戶
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        // 不返回密碼！
      },
    });

    return {
      message: 'User registered successfully',
      user,
    };
  }

  /**
   * 用戶登入
   */
  async login(dto: LoginDto) {
    // 1. 查找用戶
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. 驗證密碼
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. 生成 JWT token
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwt.sign(payload);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  /**
   * 根據 ID 查找用戶（用於驗證 token）
   */
  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });
  }
}
```

**重要概念：**
- **密碼加密**：永遠不要儲存明文密碼，使用 bcrypt.hash()
- **密碼驗證**：使用 bcrypt.compare() 比對加密後的密碼
- **JWT Payload**：通常包含用戶 ID (`sub`) 和 email
- **錯誤處理**：使用 NestJS 內建的 Exception（ConflictException, UnauthorizedException）

---

### 步驟 4：實作 JWT Strategy

Strategy 負責驗證 JWT token 並解析用戶資訊。

#### `src/auth/jwt.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET must be defined in environment variables');
    }

    super({
      secretOrKey: secret,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  /**
   * 驗證 JWT token 後自動調用
   * 返回的資料會被注入到 req.user
   */
  validate(payload: { sub: string; email: string }) {
    return payload; // 會變成 req.user
  }
}
```

**JWT Strategy 運作流程：**
1. 從 HTTP Header 提取 `Authorization: Bearer <token>`
2. 使用 `JWT_SECRET` 驗證 token
3. 如果有效，調用 `validate()` 並返回用戶資訊
4. NestJS 自動將返回值注入到 `req.user`

---

### 步驟 5：創建 Auth Guard

Guard 用於保護需要認證的路由，就像一個"門衛"，檢查訪問 API 的人是否有有效的登入憑證。

#### `src/auth/guards/jwt-auth.guard.ts`

```typescript
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // 調用父類方法，使用 JwtStrategy 驗證 JWT
    return super.canActivate(context);
  }

  handleRequest(err: Error, user: any) {
    // 如果有錯誤或用戶不存在，拋出異常
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
```

**Guard 的作用：**

這個 Guard 是認證系統的"保鏢"，負責：

1. **攔截請求** - 在請求到達 Controller 之前先檢查
2. **提取 Token** - 從 HTTP Header 的 `Authorization: Bearer <token>` 提取 JWT
3. **驗證 Token** - 調用 JwtStrategy 驗證 Token 是否有效
4. **注入用戶資訊** - 驗證成功後，將用戶資訊注入到 `req.user`
5. **拒絕無效請求** - Token 無效時返回 401 Unauthorized

**運作流程：**

```
用戶請求 → JwtAuthGuard → JwtStrategy → 驗證成功/失敗
                                           ↓
                                    成功：req.user = { sub, email }
                                    失敗：401 Unauthorized
```

**使用方式 1：保護單一路由**

```typescript
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('media')
export class MediaController {
  @Get('my-videos')
  @UseGuards(JwtAuthGuard) // 只保護這個路由
  getMyVideos(@Request() req) {
    const userId = req.user.sub; // 從 JWT 取得用戶 ID
    return { userId, videos: [] };
  }

  @Get('public')
  // 沒有 Guard，任何人都可以訪問
  getPublicVideos() {
    return { videos: [] };
  }
}
```

**使用方式 2：保護整個 Controller**

```typescript
@Controller('media')
@UseGuards(JwtAuthGuard) // 整個 Controller 的所有路由都需要登入
export class MediaController {
  @Get('list')
  getList(@Request() req) {
    // 這個需要登入
    return { user: req.user };
  }

  @Post('upload')
  upload(@Request() req) {
    // 這個也需要登入
    return { userId: req.user.sub };
  }
}
```

**測試範例：**

```bash
# 沒有 Token - 失敗
curl http://localhost:4000/media/my-videos
# 回應：401 Unauthorized

# 有效的 Token - 成功
curl http://localhost:4000/media/my-videos \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
# 回應：200 OK，包含用戶資料

# 無效或過期的 Token - 失敗
curl http://localhost:4000/media/my-videos \
  -H "Authorization: Bearer invalid_token"
# 回應：401 Unauthorized
```

**與 JwtStrategy 的關係：**

JwtAuthGuard 和 JwtStrategy 是配合使用的：

- **JwtAuthGuard** - 決定何時檢查認證（在哪些路由上使用）
- **JwtStrategy** - 定義如何檢查認證（驗證 Token 的邏輯）

```
JwtAuthGuard (門衛) → 調用 → JwtStrategy (驗證器)
```

---

### 步驟 6：創建 Auth Controller

Controller 定義 API 端點。

#### `src/auth/auth.controller.ts`

```typescript
import { Body, Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /auth/register
   * 註冊新用戶
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * 用戶登入
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * GET /auth/me
   * 取得當前登入用戶資訊（需要 JWT token）
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    return this.authService.findById(req.user.sub);
  }
}
```

**路由說明：**
- `/auth/register` - 公開，任何人可訪問
- `/auth/login` - 公開，任何人可訪問
- `/auth/me` - 受保護，需要有效的 JWT token

---

### 步驟 7：配置 Auth Module

組裝所有組件。

#### `src/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' }, // Token 有效期 7 天
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

**為什麼使用 `registerAsync()`？**
- 允許動態載入配置（從 ConfigService 讀取環境變數）
- 確保在模組初始化時才讀取配置

---

### 步驟 8：配置 App Module

在根模組中註冊所有模組。

#### `src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 讓 ConfigService 在所有模組可用
    }),
    PrismaModule,
    AuthModule,
  ],
})
export class AppModule {}
```

---

### 步驟 9：啟用全域驗證管道

在 `src/main.ts` 啟用全域輸入驗證：

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 啟用 CORS
  app.enableCors({ origin: 'http://localhost:3000', credentials: true });

  // 啟用全域驗證管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 移除 DTO 中未定義的屬性
      forbidNonWhitelisted: true, // 如果有未定義屬性則拋出錯誤
      transform: true, // 自動轉換類型
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
  console.log(`Server is running on port ${process.env.PORT ?? 4000}`);
}
bootstrap();
```

---

## 測試 API

### 1. 註冊新用戶

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

**成功回應：**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "clx123456789",
    "email": "user@example.com",
    "createdAt": "2025-11-01T00:00:00.000Z"
  }
}
```

### 2. 用戶登入

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

**成功回應：**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx123456789",
    "email": "user@example.com"
  }
}
```

### 3. 取得當前用戶資訊（受保護的路由）

```bash
curl -X GET http://localhost:4000/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**成功回應：**
```json
{
  "id": "clx123456789",
  "email": "user@example.com",
  "createdAt": "2025-11-01T00:00:00.000Z"
}
```

---

## 在其他 Controller 中使用認證

### 保護整個 Controller

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('media')
@UseGuards(JwtAuthGuard) // 整個 Controller 都需要認證
export class MediaController {
  @Get()
  findAll(@Request() req) {
    const userId = req.user.sub; // 取得當前用戶 ID
    // 實作邏輯...
  }
}
```

### 保護單一路由

```typescript
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('posts')
export class PostsController {
  @Get('public')
  getPublicPosts() {
    // 公開端點，不需要認證
    return { posts: [] };
  }

  @UseGuards(JwtAuthGuard) // 只保護這個路由
  @Get('my-posts')
  getMyPosts(@Request() req) {
    const userId = req.user.sub;
    // 返回當前用戶的文章
    return { userId, posts: [] };
  }
}
```

---

## 錯誤處理

### 常見錯誤回應

#### 1. 驗證失敗（400 Bad Request）

```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request"
}
```

#### 2. Email 已被使用（409 Conflict）

```json
{
  "statusCode": 409,
  "message": "Email already in use",
  "error": "Conflict"
}
```

#### 3. 登入失敗（401 Unauthorized）

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

#### 4. Token 無效或過期（401 Unauthorized）

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

## 安全最佳實踐

### 1. 密碼安全
- ✅ 使用 bcrypt 加密密碼（salt rounds ≥ 10）
- ✅ 永遠不要在 API 回應中返回密碼
- ✅ 強制密碼最小長度（建議 8 個字元以上）

### 2. JWT Token 安全
- ✅ 使用強壯的 JWT_SECRET（至少 32 個字元）
- ✅ 設定合理的 token 過期時間（例如 7 天）
- ✅ 只在 HTTPS 上傳輸 token
- ✅ 在前端安全地儲存 token（httpOnly cookie 或 secure storage）

### 3. 輸入驗證
- ✅ 使用 DTO 和 class-validator 驗證所有輸入
- ✅ 啟用 `whitelist` 和 `forbidNonWhitelisted` 防止額外屬性

### 4. 錯誤訊息
- ✅ 登入失敗時不要透露是 email 還是密碼錯誤
- ✅ 使用統一的錯誤訊息："Invalid credentials"

### 5. 速率限制（建議）
```bash
pnpm add @nestjs/throttler
```

---

## 總結

這個實作涵蓋了：

✅ **用戶註冊** - 密碼加密、Email 唯一性檢查
✅ **用戶登入** - 密碼驗證、JWT token 生成
✅ **路由保護** - JWT Guard 保護敏感端點
✅ **輸入驗證** - DTO 和 class-validator
✅ **資料庫整合** - Prisma ORM
✅ **環境變數管理** - ConfigModule
✅ **錯誤處理** - NestJS Exception Filters

這是一個生產環境等級的認證系統基礎架構，可以根據需求進一步擴展（例如：忘記密碼、Email 驗證、Refresh Token、OAuth 整合等）。
