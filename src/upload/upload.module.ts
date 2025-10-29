// src/upload/upload.module.ts
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
@Module({ controllers: [UploadController] })
export class UploadModule {}
// app.module.ts -> imports: [UploadModule]
