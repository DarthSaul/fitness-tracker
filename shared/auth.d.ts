import type { User as PrismaUser } from '@prisma/client'

declare module '#auth-utils' {
  interface User extends Pick<PrismaUser, 'id' | 'email' | 'name' | 'avatarUrl'> {}
}

export {}
