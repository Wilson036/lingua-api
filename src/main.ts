import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3000', credentials: true });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap()
  .then(() => {
    console.log('Server is running on port ' + (process.env.PORT ?? 4000));
  })
  .catch((error) => {
    console.error(error);
  });
