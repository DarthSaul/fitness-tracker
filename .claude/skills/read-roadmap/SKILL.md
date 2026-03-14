---
name: read-roadmap
description: Print the current project roadmap from CLAUDE.md with phase progress summary.
allowed-tools: "Read"
---

# Read Roadmap

## Arguments

- `with detail` (optional) — When provided, print the detailed view instead of the summary view.

## Instructions

1. Use the Read tool to read `CLAUDE.md`.
2. Extract the `## Roadmap` section (everything from `## Roadmap` up to the next `##` heading).
3. Check whether the user passed `with detail` as an argument. If so, use the **Detailed format**. Otherwise, use the **Summary format**.

### Summary format (default)

1. **Header** — print the current phase from the `**Current phase:**` line.

2. **Phase table** — for each phase, print a single summary line:

   ```
   Phase 0 — Init           3/3  ✅
   Phase 1 — Foundation     6/7  🔄
   Phase 2 — Observability  0/4
   ```

   Calculate counts by tallying `- [x]` (done) vs total checkboxes (`- [x]` + `- [ ]`) per phase. Use `✅` for fully complete phases and `🔄` for the active phase.

3. **Next up** — print the first unchecked (`- [ ]`) item from the active phase, prefixed with `-->`.

4. **Remaining items** — if the active phase has more than one unchecked item, list the rest as a simple bulleted list under a "Also remaining:" label.

### Detailed format (`with detail`)

1. **Header** — print the current phase from the `**Current phase:**` line.

2. **Full phase breakdown** — for each phase, print the phase heading with its progress count and status icon, then list every item with its checkbox state:

   ```
   Phase 0 — Init  3/3  ✅
     [x] Scaffold Nuxt 4 PWA (TypeScript, pnpm, Vercel deploy target)
     [x] Configure PWA manifest and @vite-pwa/nuxt
     [x] Set up AI harness: CLAUDE.md, subagents, PR template

   Phase 1 — Foundation  5/6  🔄
     [x] Initialize Prisma schema with full domain model (9 models)
     [x] Prisma client singleton (server/utils/prisma.ts)
     [x] ExerciseGroup model, warmUp field, Brick House seed data
     [x] OAuth routes (Google + Apple) via nuxt-auth-utils
     [x] Auth middleware (server/middleware/auth.ts)
     [ ] Deploy to Vercel (initial production environment)

   Phase 2 — Observability  0/4
     [ ] pino structured logging middleware
     [ ] Sentry error tracking (client + server)
     ...
   ```

   Use `[x]` for completed items and `[ ]` for incomplete items. Mark the active phase with `🔄` and completed phases with `✅`.

3. **Next up** — print the first unchecked (`- [ ]`) item from the active phase, prefixed with `-->`.

Keep the output compact — no extra blank lines, no explanations, no tool calls.
