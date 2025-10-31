# NestJS 功能開發標準流程

本文件說明如何在 NestJS 中從零開始開發一個新功能模組的完整流程。

## 目錄

1. [開發流程概覽](#開發流程概覽)
2. [詳細開發步驟](#詳細開發步驟)
3. [實際案例：媒體上傳服務](#實際案例媒體上傳服務)
4. [最佳實踐](#最佳實踐)

---

## 開發流程概覽

### 標準開發順序

```
1. 規劃 & 設計
   ↓
2. 定義資料庫 Schema (Prisma)
   ↓
3. 創建 DTO (Data Transfer Objects)
   ↓
4. 實作 Service (業務邏輯)
   ↓
5. 實作 Controller (API 端點)
   ↓
6. 配置 Module (模組註冊)
   ↓
7. 註冊到 AppModule
   ↓
8. 測試 API
```

### 檔案結構

```
src/
├── feature-name/              # 功能模組目錄
│   ├── dto/                   # 資料傳輸物件
│   │   ├── create-feature.dto.ts
│   │   ├── update-feature.dto.ts
│   │   └── index.ts           # 統一匯出
│   ├── entities/              # 實體定義（可選）
│   │   └── feature.entity.ts
│   ├── feature.controller.ts  # 控制器
│   ├── feature.service.ts     # 服務層
│   └── feature.module.ts      # 模組定義
├── prisma/
│   └── schema.prisma          # 資料庫 Schema
└── app.module.ts              # 根模組
```

---

## 詳細開發步驟

### 步驟 1：規劃 & 設計

在開始寫程式碼前，先規劃：

1. **功能需求**
   - 這個功能要做什麼？
   - 需要哪些 API 端點？
   - 資料如何流動？

2. **資料結構**
   - 需要哪些資料表？
   - 資料表之間的關聯？
   - 需要哪些欄位？

3. **API 設計**
   - RESTful API 路徑
   - HTTP 方法（GET、POST、PUT、DELETE）
   - 請求/回應格式

**範例：媒體上傳功能**

```
需求：
- 用戶可以上傳媒體檔案
- 媒體檔案需要轉寫（transcription）
- 可以查詢自己的媒體列表
- 可以查看單一媒體詳情

API 設計：
POST   /media          - 上傳媒體
GET    /media          - 取得媒體列表
GET    /media/:id      - 取得單一媒體
DELETE /media/:id      - 刪除媒體
PATCH  /media/:id      - 更新媒體資訊
```

---

### 步驟 2：定義資料庫 Schema

在 `prisma/schema.prisma` 中定義資料模型。

```prisma
model Media {
  id        String   @id @default(cuid())
  ownerId   String
  owner     User     @relation(fields: [ownerId], references: [id])
  title     String
  fileUrl   String
  status    MediaStatus @default(queued)
  duration  Int?
  language  String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  sentences TranscriptSentence[]
}

enum MediaStatus {
  queued
  processing
  done
  failed
}

model TranscriptSentence {
  id        String  @id @default(cuid())
  mediaId   String
  media     Media   @relation(fields: [mediaId], references: [id])
  idx       Int
  startSec  Float
  endSec    Float
  text      String
}
```

**執行 Migration：**
```bash
npx prisma db push
# 或
npx prisma migrate dev --name add_media_tables
```

**重新生成 Prisma Client：**
```bash
npx prisma generate
```

---

### 步驟 3：創建 DTO

DTO 用於定義 API 的輸入格式和驗證規則。

#### 3.1 創建目錄結構

```bash
mkdir -p src/media/dto
```

#### 3.2 創建 DTO 檔案

**`src/media/dto/create-media.dto.ts`**

```typescript
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateMediaDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  fileUrl: string;

  @IsOptional()
  @IsString()
  language?: string;
}
```

**`src/media/dto/update-media.dto.ts`**

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateMediaDto } from './create-media.dto';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateMediaDto extends PartialType(CreateMediaDto) {
  @IsOptional()
  @IsEnum(['queued', 'processing', 'done', 'failed'])
  status?: string;
}
```

**使用 `PartialType` 的好處：**
- 自動將所有屬性變為可選
- 繼承原有的驗證規則
- 減少重複程式碼

**`src/media/dto/query-media.dto.ts`**

```typescript
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryMediaDto {
  @IsOptional()
  @IsEnum(['queued', 'processing', 'done', 'failed'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
```

**`src/media/dto/index.ts`** (統一匯出)

```typescript
export * from './create-media.dto';
export * from './update-media.dto';
export * from './query-media.dto';
```

---

### 步驟 4：實作 Service

Service 層包含所有業務邏輯，不處理 HTTP 相關的事情。

**`src/media/media.service.ts`**

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMediaDto, UpdateMediaDto, QueryMediaDto } from './dto';

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService) {}

  /**
   * 創建新媒體
   */
  async create(userId: string, dto: CreateMediaDto) {
    return this.prisma.media.create({
      data: {
        ...dto,
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * 查詢媒體列表（分頁）
   */
  async findAll(userId: string, query: QueryMediaDto) {
    const { status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where = {
      ownerId: userId,
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { sentences: true },
          },
        },
      }),
      this.prisma.media.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 查詢單一媒體
   */
  async findOne(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        sentences: {
          orderBy: { idx: 'asc' },
        },
      },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // 確保只有擁有者可以查看
    if (media.ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return media;
  }

  /**
   * 更新媒體
   */
  async update(userId: string, mediaId: string, dto: UpdateMediaDto) {
    // 先檢查媒體是否存在且屬於該用戶
    await this.findOne(userId, mediaId);

    return this.prisma.media.update({
      where: { id: mediaId },
      data: dto,
    });
  }

  /**
   * 刪除媒體
   */
  async remove(userId: string, mediaId: string) {
    // 先檢查媒體是否存在且屬於該用戶
    await this.findOne(userId, mediaId);

    await this.prisma.media.delete({
      where: { id: mediaId },
    });

    return { message: 'Media deleted successfully' };
  }

  /**
   * 根據狀態統計
   */
  async getStats(userId: string) {
    const stats = await this.prisma.media.groupBy({
      by: ['status'],
      where: { ownerId: userId },
      _count: true,
    });

    return stats.reduce((acc, curr) => {
      acc[curr.status] = curr._count;
      return acc;
    }, {} as Record<string, number>);
  }
}
```

**Service 設計原則：**
- ✅ 單一職責：每個方法只做一件事
- ✅ 可測試：不依賴 HTTP 層
- ✅ 錯誤處理：拋出有意義的 Exception
- ✅ 權限檢查：確保用戶只能操作自己的資料
- ✅ 資料驗證：業務規則驗證

---

### 步驟 5：實作 Controller

Controller 負責處理 HTTP 請求和回應。

**`src/media/media.controller.ts`**

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { CreateMediaDto, UpdateMediaDto, QueryMediaDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('media')
@UseGuards(JwtAuthGuard) // 整個 Controller 都需要認證
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * POST /media
   * 創建新媒體
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req, @Body() dto: CreateMediaDto) {
    const userId = req.user.sub;
    return this.mediaService.create(userId, dto);
  }

  /**
   * GET /media
   * 取得媒體列表（支援分頁和篩選）
   */
  @Get()
  findAll(@Request() req, @Query() query: QueryMediaDto) {
    const userId = req.user.sub;
    return this.mediaService.findAll(userId, query);
  }

  /**
   * GET /media/stats
   * 取得媒體統計
   * 注意：這個路由要放在 :id 前面，否則 'stats' 會被當成 id
   */
  @Get('stats')
  getStats(@Request() req) {
    const userId = req.user.sub;
    return this.mediaService.getStats(userId);
  }

  /**
   * GET /media/:id
   * 取得單一媒體詳情
   */
  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.mediaService.findOne(userId, id);
  }

  /**
   * PATCH /media/:id
   * 更新媒體資訊
   */
  @Patch(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateMediaDto,
  ) {
    const userId = req.user.sub;
    return this.mediaService.update(userId, id, dto);
  }

  /**
   * DELETE /media/:id
   * 刪除媒體
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.mediaService.remove(userId, id);
  }
}
```

**Controller 最佳實踐：**
- ✅ 使用裝飾器清楚定義路由
- ✅ 使用 `@HttpCode()` 指定回應狀態碼
- ✅ 從 `req.user` 取得當前用戶資訊
- ✅ 將業務邏輯委派給 Service
- ✅ 路由順序很重要（具體路徑在前，參數路徑在後）

---

### 步驟 6：配置 Module

Module 負責組織和註冊所有組件。

**`src/media/media.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService], // 如果其他模組需要使用
})
export class MediaModule {}
```

**Module 的作用：**
- 組織相關的 Controller 和 Provider
- 控制依賴注入的範圍
- 定義哪些 Provider 可以被其他模組使用（exports）

---

### 步驟 7：註冊到 AppModule

將新模組註冊到根模組。

**`src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MediaModule } from './media/media.module'; // 新增

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    MediaModule, // 註冊新模組
  ],
})
export class AppModule {}
```

---

### 步驟 8：測試 API

#### 8.1 創建媒體

```bash
curl -X POST http://localhost:4000/media \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "My Video",
    "fileUrl": "https://example.com/video.mp4",
    "language": "zh-TW"
  }'
```

#### 8.2 取得媒體列表

```bash
# 基本查詢
curl -X GET http://localhost:4000/media \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 帶分頁和篩選
curl -X GET "http://localhost:4000/media?status=done&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 8.3 取得單一媒體

```bash
curl -X GET http://localhost:4000/media/MEDIA_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 8.4 更新媒體

```bash
curl -X PATCH http://localhost:4000/media/MEDIA_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Updated Title",
    "status": "done"
  }'
```

#### 8.5 刪除媒體

```bash
curl -X DELETE http://localhost:4000/media/MEDIA_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 8.6 取得統計資訊

```bash
curl -X GET http://localhost:4000/media/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 實際案例：媒體上傳服務

### 完整流程演示

#### 步驟 1：規劃

```
功能：媒體上傳和轉寫管理

需求：
1. 用戶可以上傳媒體檔案
2. 系統自動開始轉寫
3. 用戶可以查看轉寫進度
4. 轉寫完成後可以查看結果

API 端點：
POST   /media         - 上傳媒體
GET    /media         - 查詢列表
GET    /media/:id     - 查詢詳情
PATCH  /media/:id     - 更新資訊
DELETE /media/:id     - 刪除
GET    /media/stats   - 統計資訊
```

#### 步驟 2：Schema

已在前面定義

#### 步驟 3-6：實作

已在前面完成

#### 步驟 7：測試

使用 Postman 或 curl 測試所有端點

---

## 最佳實踐

### 1. 檔案組織

```
✅ 好的結構：
src/
├── feature/
│   ├── dto/
│   │   ├── create-feature.dto.ts
│   │   ├── update-feature.dto.ts
│   │   └── index.ts
│   ├── feature.controller.ts
│   ├── feature.service.ts
│   └── feature.module.ts

❌ 避免：
src/
├── feature.controller.ts      # 所有檔案混在一起
├── feature.service.ts
├── feature-create.dto.ts
└── feature-update.dto.ts
```

### 2. 命名規範

```typescript
// ✅ 好的命名
class CreateMediaDto {}           // DTO
class MediaService {}             // Service
class MediaController {}          // Controller
class MediaModule {}              // Module

// ❌ 避免
class CreateMedia {}              // 不清楚是什麼
class Media {}                    // 太籠統
class MediaServ {}                // 縮寫
```

### 3. DTO 設計

```typescript
// ✅ 好的 DTO：清楚的驗證規則
export class CreateMediaDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsUrl()
  fileUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

// ❌ 避免：沒有驗證
export class CreateMediaDto {
  title: string;
  fileUrl: string;
  language?: string;
}
```

### 4. Service 方法設計

```typescript
// ✅ 好的 Service：單一職責
class MediaService {
  async create(userId: string, dto: CreateMediaDto) {
    return this.prisma.media.create({
      data: { ...dto, ownerId: userId },
    });
  }

  async findAll(userId: string) {
    return this.prisma.media.findMany({
      where: { ownerId: userId },
    });
  }
}

// ❌ 避免：做太多事
class MediaService {
  async createAndNotify(userId: string, dto: CreateMediaDto) {
    // 創建媒體
    // 發送通知
    // 更新統計
    // 寫入日誌
    // ... 太多職責
  }
}
```

### 5. 錯誤處理

```typescript
// ✅ 好的錯誤處理：使用 NestJS Exception
async findOne(id: string) {
  const media = await this.prisma.media.findUnique({
    where: { id },
  });

  if (!media) {
    throw new NotFoundException('Media not found');
  }

  return media;
}

// ❌ 避免：返回 null 或空物件
async findOne(id: string) {
  const media = await this.prisma.media.findUnique({
    where: { id },
  });

  return media || {}; // 不好的做法
}
```

### 6. Controller 裝飾器使用

```typescript
// ✅ 清楚的狀態碼和文件
@Post()
@HttpCode(HttpStatus.CREATED)
@ApiResponse({ status: 201, description: 'Media created successfully' })
create(@Body() dto: CreateMediaDto) {
  return this.service.create(dto);
}

// ❌ 缺少明確的狀態碼
@Post()
create(@Body() dto: CreateMediaDto) {
  return this.service.create(dto);
}
```

### 7. 權限檢查

```typescript
// ✅ 在 Service 層檢查權限
async findOne(userId: string, mediaId: string) {
  const media = await this.prisma.media.findUnique({
    where: { id: mediaId },
  });

  if (!media) {
    throw new NotFoundException('Media not found');
  }

  if (media.ownerId !== userId) {
    throw new ForbiddenException('Access denied');
  }

  return media;
}

// ❌ 沒有權限檢查
async findOne(mediaId: string) {
  return this.prisma.media.findUnique({
    where: { id: mediaId },
  });
}
```

---

## 常見模式總結

### CRUD 操作標準實作

```typescript
// Service
@Injectable()
export class FeatureService {
  constructor(private prisma: PrismaService) {}

  // Create
  async create(userId: string, dto: CreateDto) {
    return this.prisma.feature.create({
      data: { ...dto, userId },
    });
  }

  // Read (列表)
  async findAll(userId: string, query: QueryDto) {
    return this.prisma.feature.findMany({
      where: { userId },
    });
  }

  // Read (單一)
  async findOne(userId: string, id: string) {
    const item = await this.prisma.feature.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException();
    }

    if (item.userId !== userId) {
      throw new ForbiddenException();
    }

    return item;
  }

  // Update
  async update(userId: string, id: string, dto: UpdateDto) {
    await this.findOne(userId, id); // 檢查權限
    return this.prisma.feature.update({
      where: { id },
      data: dto,
    });
  }

  // Delete
  async remove(userId: string, id: string) {
    await this.findOne(userId, id); // 檢查權限
    await this.prisma.feature.delete({
      where: { id },
    });
  }
}
```

---

## 快速檢查清單

開發新功能時，確保完成以下步驟：

- [ ] ✅ 規劃功能需求和 API 設計
- [ ] ✅ 定義 Prisma Schema 並執行 migration
- [ ] ✅ 創建所有必要的 DTO
- [ ] ✅ 實作 Service 層（包含業務邏輯和錯誤處理）
- [ ] ✅ 實作 Controller 層（定義路由）
- [ ] ✅ 配置 Module 並註冊所有組件
- [ ] ✅ 在 AppModule 中註冊新模組
- [ ] ✅ 測試所有 API 端點
- [ ] ✅ 檢查權限控制是否正確
- [ ] ✅ 檢查錯誤處理是否完善

---

## 總結

這個開發流程確保：

✅ **結構清晰** - 每個檔案職責明確
✅ **類型安全** - TypeScript + DTO 驗證
✅ **可維護性** - 遵循 NestJS 最佳實踐
✅ **可測試性** - Service 層獨立於 HTTP
✅ **安全性** - 適當的權限檢查和驗證
✅ **一致性** - 統一的開發模式

遵循這個流程，你可以快速且規範地開發出高品質的 NestJS 功能模組！
