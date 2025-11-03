// src/upload/upload.module.ts
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { TranscribeService } from '../auth/transcribe/transcribe.service';

@Module({
  controllers: [UploadController],
  providers: [TranscribeService],
})
export class UploadModule {}
// app.module.ts -> imports: [UploadModule]
