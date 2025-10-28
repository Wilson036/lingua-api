// src/dev/dev.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevController } from './dev.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '../auth/jwt.strategy';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [DevController],
  providers: [JwtStrategy],
})
export class DevModule {}
