// src/dev/dev.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';

@Controller()
export class DevController {
  constructor(private jwt: JwtService) {}

  @Post('auth/dev-login')
  devLogin(@Body() body: { email: string }) {
    const email = body?.email?.toLowerCase() || 'dev@example.com';
    // ⬜ 你也可以在這裡暫時生成一個假的 userId
    const token = this.jwt.sign({ sub: 'dev-user-id', email });
    return { access_token: token };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('whoami')
  whoami(@Req() req: { user: { sub: string; email: string } }) {
    return { user: req.user }; // { sub, email, iat, exp }
  }
  @Get('dev/test')
  test() {
    return { message: 'Hello World' };
  }
}
