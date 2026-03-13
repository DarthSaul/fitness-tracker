import type { User as PrismaUser } from '@prisma/client'

declare module '#auth-utils' {
  type User = Pick<PrismaUser, 'id' | 'email' | 'name' | 'avatarUrl'>
}

export {}
