import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    const user = request['user'] as Record<string, unknown> | undefined;
    if (!user) {
      return null;
    }
    return data ? user[data] : user;
  },
);
