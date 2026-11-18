# Primaries and nomination fights — design

Idea 2 from "Election System Depth Ideas". Approved 2026-11-17.

## Why

A party's choice of nominee should matter: a moderate pulls the party toward
the centre, an ideologue away from it, and a long bitter fight costs the
nominee support in November, as 1912 and 1968 did. Builds on candidate traits.

## Goals

- Before each election, every party with support (except Third Party) holds a
  primary between a moderate and an ideologue wing.
- The winner's position is what voters see this election, what a winning
  president governs from, and pulls the party's long-run ideology toward it.
- A close fight between distant wings costs national support.

## Non-goals

- Spoiler or breakaway candidates (idea 4), multi-wing factions (idea 18).
- Changes to the written story page.

## Anti-goals

- Changing timelines when the addition is off (proved by the 600-timeline
  fingerprint test).

## Approaches

1. **New `engine/primaries.ts` beside `candidates.ts` (chosen).** Same pattern
   as midterms and traits: an optional Addition, no random draws when off.
2. Fold it into `candidates.ts`: one file doing two jobs, harder to follow.
3. Full party factions (idea 18): bigger; can build on this later.

## Design

**Wings.** Party ideology I, electorate centre C. Moderate sits halfway from I
to C. Ideologue sits further out: I + sign(I − C) × (1.5 + 0.25 × |I − C|),
capped at 3 points and clamped to −10..10. Names come from the candidate list
at each wing's band, no name shared across the field; traits as for nominees.

**Primary vote.** Moderate's chance starts at 50%, ±8 points per charisma step
of difference and ±4 per experience level of difference, kept to 15–85%. A
roll sets the moderate's primary share around that chance; over 50% wins.

**Fight.** Margin under 10 points with wings at least 2 apart is Bitter (−6%
national support for the party, relative); margin under 25 is Contested (−2%);
otherwise Easy (none). Applied with the trait appeal, then all parties rescaled
to the same total.

**Incumbent.** Unopposed when running again, unless their term's performance
was negative: then a 50% chance the other wing challenges. The incumbent's
chance in a challenge is 70%. Losing renomination makes the challenger the
nominee (Franklin Pierce, 1856).

**Reach (user's choice: "also moves the party").**
- This election: the nominee's position replaces the party's shown ideology
  for the state vote and Congress.
- Presidency: a winner governs from the nominee's position (`potusIdeology`).
- Party: at the next election the party moves 30% of the way toward the
  nominee's position if they won the White House, 15% if they lost.

**Switch.** "Primaries" in Rules → Additions, on by default, `primaries=0` in
share links when off. Requires candidate traits; the switch is disabled when
traits are off, and the engine ignores primaries without traits.

**Display.** Winner tags gain a wing tag (Moderate / Ideologue / Unopposed)
and a fight tag (Bitter primary / Contested primary), with hover pop-ups. A
Primaries panel under the election lists each race: winner and position, loser
and position, primary vote, fight and cost. Saved timelines and the finder
show "Primaries".

## Left to the builder

Exact panel layout and wording; numbers above may be tuned so that bitter
fights are uncommon (roughly 1 in 6 contested races) and moderates win a bit
more often than ideologues across many timelines.
