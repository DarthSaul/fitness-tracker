---
name: read-roadmap
description: Print the current project roadmap from CLAUDE.md with phase progress summary.
allowed-tools: ""
---

# Read Roadmap

## Pre-computed context

<roadmap_section>
!`awk '/^## Roadmap$/,/^## [^#]/' CLAUDE.md | head -n -1`
</roadmap_section>

## Instructions

Display a readable roadmap briefing directly to the user. Do NOT call any tools — all the data you need is in `<roadmap_section>` above.

Format your output exactly like this:

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

Keep the output compact — no extra blank lines, no explanations, no tool calls.
