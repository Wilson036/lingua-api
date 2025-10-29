import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { join } from 'node:path';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3000', credentials: true });
  // ⬇ 讓 http://localhost:4000/uploads/** 能被直接存取
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap()
  .then(() => {
    console.log('Server is running on port ' + (process.env.PORT ?? 4000));
  })
  .catch((error) => {
    console.error(error);
  });
