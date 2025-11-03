// src/upload/upload.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import * as fs from 'node:fs';
import { TranscribeService } from '../auth/transcribe/transcribe.service';
@Controller()
export class UploadController {
  constructor(private readonly transcribeService: TranscribeService) {}
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads'); // ⬅ Nest 專案根目錄下 /uploads
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const id = crypto.randomUUID();
          cb(null, id + extname(file.originalname).toLowerCase());
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('audio/'))
          return cb(new BadRequestException('ONLY_AUDIO'), false);
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('NO_FILE');
    const url = `/uploads/${file.filename}`; // ⬅ 相對路徑；前端要補上主機
    const text = await this.transcribeService.transcribeLocalFile(file.filename);
    return { ok: true, url, text };
  }
}
