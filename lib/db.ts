import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prevents exhausting DB connections from hot-reload creating a new
// PrismaClient on every file change in dev.
export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
