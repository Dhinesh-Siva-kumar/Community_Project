import { Request, Response, NextFunction } from 'express';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from './auth.dto';
import * as authService from './auth.service';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = RegisterDto.parse(req.body);
    const result = await authService.register(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = LoginDto.parse(req.body);
    const result = await authService.login(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function adminLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = LoginDto.parse(req.body);
    const result = await authService.adminLogin(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function checkUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const username = req.params['username'] as string;
    const result = await authService.checkUsername(username);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function forgotPasswordSendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = ForgotPasswordDto.parse(req.body);
    const result = await authService.forgotPasswordSendOtp(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = ResetPasswordDto.parse(req.body);
    const result = await authService.resetPasswordVerify(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = RefreshTokenDto.parse(req.body);
    const result = await authService.refreshToken(body.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      await authService.logout(req.user.sub);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const result = await authService.getProfile(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
