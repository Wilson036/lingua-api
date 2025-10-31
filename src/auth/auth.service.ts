import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Register a new user with email and password
   * Hashes the password using bcrypt before storing in database
   */
  async register(email: string, password: string) {
    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, this.saltRounds);

      // Create the user
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      });

      return {
        message: 'User registered successfully',
        user,
      };
    } catch (error) {
      // Re-throw known errors
      if (error instanceof ConflictException) {
        throw error;
      }

      // Handle unexpected errors
      throw new InternalServerErrorException('Failed to register user');
    }
  }

  /**
   * Login with email and password
   * Validates credentials and returns JWT access token
   */
  async login(email: string, password: string) {
    try {
      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        throw new UnauthorizedException('Password is incorrect');
      }

      // Generate JWT token
      const payload = {
        sub: user.id,
        email: user.email,
      };

      const secret = this.config.get<string>('JWT_SECRET');
      if (!secret) {
        throw new InternalServerErrorException('JWT configuration error');
      }

      const accessToken = this.jwtService.sign(payload, {
        secret,
        expiresIn: '7d', // Token expires in 7 days
      });

      return {
        access_token: accessToken,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      // Handle unexpected errors
      throw new InternalServerErrorException('Failed to login');
    }
  }

  /**
   * Validate user by ID (used by JWT strategy)
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
