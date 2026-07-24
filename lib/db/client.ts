import { PrismaClient } from '@prisma/client';
import { immutableGuardExtension } from './immutable-guard';

// Lazy Prisma singleton with the ledger immutability guard attached. Production
// code and API deps resolve the client through getPrisma(); tests inject a fake
// via setPrismaForTesting so they never touch a real database (test offline
// rule). $extends returns a structurally-extended client; the guard only adds a
// query hook and changes no method shapes, so we surface it as PrismaClient.

let cached: PrismaClient | null = null;
let testOverride: PrismaClient | null = null;

function createGuardedClient(): PrismaClient {
  const base = new PrismaClient();
  return base.$extends(immutableGuardExtension) as unknown as PrismaClient;
}

export function getPrisma(): PrismaClient {
  if (testOverride !== null) {
    return testOverride;
  }
  if (cached === null) {
    cached = createGuardedClient();
  }
  return cached;
}

export function setPrismaForTesting(client: PrismaClient | null): void {
  testOverride = client;
}
