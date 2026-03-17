/**
 * Global type declarations for Nuxt/H3/nuxt-auth-utils auto-import globals
 * that are stubbed via vi.stubGlobal() in vitest.setup.ts.
 *
 * These mirror the runtime shapes the Nuxt transform pipeline would inject,
 * allowing TypeScript to accept bare global references in test files.
 */
import type { PrismaClient } from '@prisma/client'

declare global {
  // ── H3 ────────────────────────────────────────────────────────────────────
  const defineEventHandler: (fn: (event: unknown) => unknown) => unknown
  const createError: (opts: { statusCode: number; statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
  const sendRedirect: (event: unknown, location: string) => Promise<void>

  // ── nuxt-auth-utils ───────────────────────────────────────────────────────
  const getUserSession: (event: unknown) => Promise<{ user?: unknown } | null>
  const setUserSession: (event: unknown, data: unknown) => Promise<void>
  const clearUserSession: (event: unknown) => Promise<void>
  const defineOAuthGoogleEventHandler: (config: unknown) => unknown
  const defineOAuthAppleEventHandler: (config: unknown) => unknown

  // ── Prisma (server auto-import) ───────────────────────────────────────────
  const prisma: PrismaClient

  // ── Nuxt client composables / utilities ───────────────────────────────────
  const useUserSession: () => {
    loggedIn: unknown
    user: unknown
    session: unknown
    fetch: () => Promise<void>
  }
  const navigateTo: (path: string, opts?: { external?: boolean }) => Promise<void>
  const $fetch: (url: string, opts?: Record<string, unknown>) => Promise<unknown>

  // ── Nuxt page / route macros ──────────────────────────────────────────────
  const defineNuxtRouteMiddleware: (
    fn: (to: { path: string }) => unknown,
  ) => (to: { path: string }) => unknown
  const definePageMeta: (meta: Record<string, unknown>) => void
  const useFetch: <T = unknown>(
    url: string,
    opts?: Record<string, unknown>,
  ) => { data: { value: T | null }; status: { value: string }; error: { value: unknown } }
}

export {}
