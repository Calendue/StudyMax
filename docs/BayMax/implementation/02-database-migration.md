# 02 — Database Migration

Adds the Prisma models spec `03-data-model.md` defines. Read that file's "Prisma additions" section in
full before starting — it has the exact model definitions; this file is the *procedure*, not a
duplicate of the schema.

## Before you start

**Post in the team channel first.** This is a schema change on the one shared remote Supabase instance
all four teammates use — there's no shadow/local DB to test against in isolation (→ `CLAUDE.md`).
Whoever runs this owns it; nobody else should be mid-migration on the same schema at the same time.

## Models to add (from spec `03`, all decisions already resolved there)

In this order, since later ones reference earlier ones:

1. `MaxSettings` (1:1 with `UserInfo`) — phone verification via **real Firebase Phone Auth**, not a
   stub (→ spec `03` decision 6, `11`). Include the raw-SQL partial unique index on verified phone
   numbers.
2. `StudentPreference` — typed preferences. When you copy the preference registry table from spec
   `03` into `src/lib/preferences.ts` (→ `03-planning-and-audit-adapter.md`), **drop the
   `summerWillingness` row** — summer terms are cut for v1.
3. `StudentNote`
4. Relation field additions to **existing** models: `UserInfo` (six new relation fields) and
   `GeneratedPlan` (`version Int @default(1)`, `versions PlanVersion[]`).
5. `PlanVersion` — immutable plan history. `coursesPerTerm` in the snapshot is a ceiling, not an exact
   fill (→ spec `03` decision 5, `03-planning-and-audit-adapter.md`).
6. `Scenario`
7. `MaxCall` — include the raw-SQL "one active call per student" partial unique index.
8. `MaxToolCall`
9. `ConversationSummary`
10. `AuditLog`

## Procedure

1. Edit `prisma/schema.prisma`: add the ten items above verbatim from spec `03` (copy the Prisma
   blocks directly — they're already written to match this codebase's conventions:
   `BigInt @id @default(autoincrement())`, `onDelete: Cascade` to `UserInfo`, `@db.VarChar` for
   enum-like strings).
2. Generate the migration SQL without touching the shared DB yet:
   `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > /tmp/baymax-migration.sql`
   (or use whatever `migrate diff` invocation the repo's existing migrations under `prisma/migrations/`
   used — check `prisma/migrations/20260926191946_init_student_data/migration.sql` for the pattern
   this project already follows).
3. **Review the generated SQL by hand.** Add the two raw-SQL partial unique indexes from spec `03`
   (`max_settings_verified_phone_uq`, `max_call_one_active_uq`) — Prisma's schema language can't express
   them, so they won't be in the auto-generated diff; add them to the migration file directly.
4. Save it as a new migration directory under `prisma/migrations/<timestamp>_add_baymax_tables/migration.sql`,
   matching the existing migrations' folder naming (`YYYYMMDDHHMMSS_description`).
5. Run `npm run db:migrate` (wraps `prisma migrate deploy` — **never `prisma migrate dev`**, per
   `CLAUDE.md`: there's no shadow DB here).
6. Run `npm run db:generate` so `@prisma/client`'s generated types include the new models.
7. Confirm in `npm run db:studio` that all ten new tables exist and the two partial indexes are
   present (`\d MaxSettings` / `\d MaxCall` in `psql`, or check via Studio's table view).

## Backfill

Spec `03` says every existing `GeneratedPlan` needs a `PlanVersion` v1 with `createdBy: "backfill"`.
In practice, check first: since no code writes `GeneratedPlan` yet outside `01-seed-demo-student.md`'s
seed script, there may be zero or very few existing rows. If there are pre-existing `GeneratedPlan`
rows from anyone's testing, write a one-off backfill script; if the table is empty except for the demo
student (who gets `PlanVersion` v1 directly in `01`), skip a separate backfill step entirely.

## Single write path

Per spec `03`: every place that writes `GeneratedPlan` from here on must go through one helper
(`commitPlanVersion(tx, planId, snapshot, meta)` — implemented in `04-scenarios-and-commits.md`) that
bumps `version`, writes the head, and appends a `PlanVersion` in the same transaction. Don't call
`prisma.generatedPlan.update` directly anywhere else, including in `01`'s seed script's normal
re-run path — recompute through the same helper, or accept the seed script as the one deliberate
exception (it creates `PlanVersion` v1 directly, matching `createdBy: "onboarding"`-equivalent
semantics for a script rather than real onboarding).

## Definition of done

- [ ] All ten items from spec `03` exist as migrated tables/columns.
- [ ] Both raw-SQL partial unique indexes are present and enforced (test: try inserting two
      `MaxSettings` rows with the same verified phone number, confirm it's rejected).
- [ ] `npm run db:generate` ran; TypeScript sees the new Prisma types.
- [ ] `npm run build` still passes.
- [ ] Team notified the migration landed.
