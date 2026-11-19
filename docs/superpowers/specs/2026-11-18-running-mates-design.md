# Running mates and succession — design

Idea 3 from "Election System Depth Ideas". Approved 2026-11-18.

## Why

Presidents sometimes don't finish their terms. Giving each ticket a running
mate, and a small chance each term that the vice president takes over, adds
unelected presidents and a new kind of turning point to each history.

## Goals

- Every nominee picks a running mate; the winner's becomes vice president.
- Each term, a small chance of death, assassination or resignation puts the
  vice president in office for the rest of the term.
- The successor is the sitting president at the next election, and the cause
  moves election-day approval (user's choice: "incumbent + mood").

## Non-goals

- The successor governing differently for the rest of the term; a successor
  choosing a new vice president; real ages; impeachment (idea 16).

## Anti-goals

- Changing timelines when the addition is off (fingerprint test).

## Approaches

1. **New `engine/succession.ts`, an Addition needing candidate traits (chosen).**
   Same pattern as primaries.
2. Running mates without traits: no names, home states or traits to pick from.
3. Succession that re-rolls the rest of the term: the user chose not to.

## Design

**Running mates.** For each nominee: when their party held a contested
primary, a 50% chance the loser is the running mate (unity ticket). Otherwise
the party's list band, skipping names already running, preferring a home state
other than the nominee's. Traits as for nominees. A running mate's home state
leans 1 point toward the ticket (half the nominee's 2).

**Succession**, rolled each term from the first term with a vice president:
death 5% (+2% when the president is a veteran); assassination 2%, tripled after
Chaos, Riots or Civil War; resignation 15% after a Scandal, 10% after a
Depression, Lost War or Major War Loss. The year is the term's second, third or
fourth, so both presidents serve at least a year of it.

**After it.** The vice president is the sitting president at the next
election (the usual re-run odds apply, so 70% to seek a full term).
Election-day approval: +4 points after a death, +8 after an assassination,
−6 after a resignation. The term's events stay as rolled.

**Switch.** "Running mates" in Rules → Additions, on by default, `vp=0` in
links when off, needs candidate traits.

**Display.** Tickets in the results table and the winner card; the term card
notes a succession; the Presidents page lists the successor as their own
presidency from the year they took over; the story mentions successions.
