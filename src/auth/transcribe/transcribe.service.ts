import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import FormData from 'form-data';
import axios from 'axios';

@Injectable()
export class TranscribeService {
  async transcribeLocalFile(filename: string): Promise<string> {
    // 1. 準備檔案路徑
    const filePath = join(process.cwd(), 'uploads', filename);
    const stream = createReadStream(filePath);

    // 2. 組 form-data 給 OpenAI
    const form = new FormData();
    form.append('file', stream, filename);
    // 你可以選：'whisper-1' 或 'gpt-4o-mini-transcribe'
    form.append('model', 'whisper-1');
    form.append('language', 'en'); // 強制使用英文

    // 3. 呼叫 OpenAI Whisper API（使用 axios 支援 form-data）
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            ...form.getHeaders(),
          },
        },
      );
      // response.data.text 就是整段轉譯後的文字
      return response.data.text as string;
    } catch (error) {
      console.error('Transcribe error:', error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('Transcribe error:', error.response.data);
        throw new InternalServerErrorException(
          error.response.data?.error?.message ?? 'Transcription failed',
        );
      }
      console.error('Transcribe error:', error);
      throw new InternalServerErrorException('Transcription failed');
    }
  }
}
