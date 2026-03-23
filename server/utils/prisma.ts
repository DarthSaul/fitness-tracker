/** Shared PrismaClient singleton — reuses the global instance in development to survive hot reloads. */
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient();

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
	prismaGlobal: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prismaGlobal = prisma;
}
