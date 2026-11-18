# Primaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parties hold a primary between a moderate and an ideologue wing before each election; the winner's position shapes the vote, the presidency and the party.

**Architecture:** New `src/engine/primaries.ts` beside `candidates.ts`, called from `nextTerm` in place of `chooseNominees` when `ctx.primaries && ctx.candidateTraits`. Results stored as `Term.primaries`. App gets a Rules switch, link param, tags and a panel.

**Tech Stack:** TypeScript, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-primaries-design.md`

## Global Constraints

- With primaries off (engine default), no random numbers are drawn: the 600-timeline fingerprint in `tests/rules.test.ts` is unchanged (strip `primaries` in `ADDITION_KEYS`).
- App default on; links carry `primaries=0` only when off.
- Primaries need candidate traits; without traits they are ignored.
- Fight costs: Easy 0, Contested 2%, Bitter 6% (relative to the party's support, then all rescaled).
- Party drag: 30% toward the nominee's position if they won the White House, 15% if not.

## Review Focus

- Incumbent challenged and beaten: the challenger is the nominee, and `incumbent` is false on the winning nominee.
- Two wings land in the same name band: contenders still have different names, and no name is shared across parties.
- A party far right of centre: the ideologue is further right, the moderate between it and the centre, both within −10..10.
- Third Party: no primary, nominee chosen as before.
- Old share links without `primaries`: open with primaries on; `primaries=0` turns them off.

---

### Task 1: Engine — `primaries.ts`

**Files:** Create `src/engine/primaries.ts`; modify `src/engine/candidates.ts` (export `pickName`), `types.ts`, `simulate.ts`, `president.ts`. Test `tests/primaries.test.ts`.

**Interfaces (produces):**
- `type Wing = 'moderate' | 'ideologue'`; `type Fight = 'unopposed' | 'easy' | 'contested' | 'bitter'`
- `interface Contender { name; home: string | null; charisma; experience; position: number; wing: Wing; incumbent: boolean }`
- `interface Primary { party: number; contenders: Contender[]; winner: number; share: number; fight: Fight; cost: number }`
- `FIGHT_COST: Record<Fight, number>`, `wingPositions(ideology, center): { moderate: number; ideologue: number }`
- `holdPrimaries(input: NominationInput & { performance: number; potusIdeology: number }, ctx): { nominees: Nominee[]; primaries: Primary[] }`
- `supportAfterPrimaries(support, primaries): number[]`
- `Term.primaries: Primary[] | null`; `Settings.primaries?`, `Context.primaries?`; `Timeline.primaries: boolean`.

- [ ] Tests: off by default and fingerprint unchanged; every supported named party has one primary, Third Party none; winner nominee = primary winner and names unique; wing positions ordered and clamped; bitter primaries cost support; a winning president's `potusIdeology` equals their primary position; party ideology drags toward the nominee.
- [ ] Implement; run `npx vitest run`.

### Task 2: Links, Rules and labels

**Files:** `src/app/presentation.ts`, `App.tsx`, `RuleSettings.tsx`, `saved.ts`, `Finder.tsx`; tests updating locations.

- [ ] `TimelineLocation.primaries`, `primaries=0` param, `additionsText(midterms, traits, primaries)`, Rules switch disabled when traits off, "Primaries" labels.

### Task 3: Display

**Files:** `src/app/presentation.ts` (`traitEffects` gains wing and fight tags), `Election.tsx`, new `src/app/Primaries.tsx`, `styles.css`.

- [ ] Wing and fight tags with pop-ups; Primaries panel under the election layout.
- [ ] Check believability across 300 timelines; check in the browser.
