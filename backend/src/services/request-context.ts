import { AsyncLocalStorage } from 'async_hooks';

/**
 * Carries the current request's IP/user-agent down through the call stack
 * without threading them through every controller/service signature, so
 * deep, fire-and-forget writes like audit logging can attribute themselves
 * to a request without every caller having to pass `req` along.
 */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(ctx: RequestContext, fn: () => void): void {
  storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
