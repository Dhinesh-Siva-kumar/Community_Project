// Augment Express Request with authenticated user payload
declare namespace Express {
  interface Request {
    user?: {
      sub: string;        // UUID — preserved from existing Prisma schema (users.id is UUID)
      userName: string;
      role: string;
      roleLevel: number;
    };
  }
}
