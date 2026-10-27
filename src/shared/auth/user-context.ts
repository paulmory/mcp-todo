import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<string>();
export const LOCAL_USER_ID = "local";

export function currentUserId(): string {
  return context.getStore() ?? LOCAL_USER_ID;
}

export function withUser<T>(userId: string, operation: () => T): T {
  return context.run(userId, operation);
}
