// The one Prisma client the API shares. The underscore keeps Vercel from serving this file as a
// route. A warm function reuses it across requests instead of opening a new pool on every call;
// DATABASE_URL goes through Supabase's pooler (pgbouncer), so a cold start costs one connection.
import { PrismaClient } from '@prisma/client'

const cache = globalThis as unknown as { prisma?: PrismaClient }

/** Whether this deployment has a database at all. */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function db(): PrismaClient {
  cache.prisma ??= new PrismaClient()
  return cache.prisma
}
