# Fix: Use `$ref` component schemas for OpenAPI docs

## Context
The `[id].get.ts` route has a deeply nested inline OpenAPI schema (Program → weeks → days → exerciseGroups → exercises → sets) that causes Scalar UI to show "[Max Depth Exceeded]" for the deepest levels. Inline schemas don't scale for nested data.

Nitro supports a `$global` property in `defineRouteMeta` that injects shared `components.schemas` into the OpenAPI spec. Routes can then use `{ $ref: '#/components/schemas/Foo' }` instead of inline definitions.

## Approach

### 1. Create `server/api/_schemas.ts` — centralized schema definitions

Define all reusable OpenAPI component schemas here using `$global`. Each Prisma model gets its own flat schema that references children via `$ref`:

```
Program         → $ref ProgramWeek
ProgramWeek     → $ref ProgramDay
ProgramDay      → $ref ExerciseGroup
ExerciseGroup   → $ref ProgramExercise
ProgramExercise → $ref ExerciseSet
ExerciseSet     → (leaf, no children)
ProgramSummary  → (flat, used by list endpoint with _count)
```

The handler returns nothing meaningful — the file exists purely for schema registration. It won't appear in docs since it has no `tags`/`summary`.

### 2. Simplify `server/api/programs/index.get.ts`

Replace the inline 200 response schema with:
```typescript
schema: { type: 'array', items: { $ref: '#/components/schemas/ProgramSummary' } }
```

### 3. Simplify `server/api/programs/[id].get.ts`

Replace the deeply nested inline 200 response schema with:
```typescript
schema: { $ref: '#/components/schemas/ProgramDetail' }
```

Where `ProgramDetail` is the Program schema with `weeks` included (using `$ref` to `ProgramWeek`, etc.).

## Files to modify
- **Create** `server/api/_schemas.ts` — all component schemas
- **Edit** `server/api/programs/index.get.ts` — replace inline schema with `$ref`
- **Edit** `server/api/programs/[id].get.ts` — replace inline schema with `$ref`

## Verification
1. `pnpm dev`
2. Fetch `/_openapi.json` and confirm `components.schemas` contains all defined schemas
3. Confirm both program routes use `$ref` in their 200 responses
4. Open `/api/docs` in browser — verify no "[Max Depth Exceeded]" and response bodies render fully
5. Stop dev server
