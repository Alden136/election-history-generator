# A real state-by-state popular vote — design

Idea 5 from "Election System Depth Ideas". Approved 2026-11-18.

## Why

States pick a winner outright today and the national popular vote is a blend
of Electoral College share and national support. A real count per state makes
margins, close states and popular/electoral splits possible, and is the
foundation for turnout, other electoral rules, recounts and election night.

## Goals

- Every voting state gets a vote share for each party; the plurality wins it
  (user's choice: "votes decide").
- The national popular vote is the sum of the state votes.
- Long-run results stay close to today's (flip rate, party win rates,
  landslides); typical state margins of 10–20 points; popular/electoral splits
  in roughly 1 election in 12.

## Non-goals

- Map shading by margin (idea 9); turnout that varies by state (idea 6).

## Anti-goals

- Changing timelines when the addition is off (fingerprint test).

## Approaches

1. **Votes decide (chosen).** Shares from a softmax over today's state score,
   plus loyalty and noise; the plurality wins.
2. Shares follow the winner: history unchanged, but votes never decide.

## Design

**Shares.** For a voting state and each party with support, utility =
−(|position − lean| − support × Party victory boost − home bonuses)
+ loyalty pull (Party loyalty dial × a constant) for last time's winner
+ noise. Shares = softmax(utility / spread). Secession and civil war run first,
unchanged.

**National vote.** Each voting state weighs its electoral votes minus two (at
least one), standing in for population. `winnerPopularShare` becomes the
winner's share of that count.

**Switch.** "State popular vote" in Rules → Additions, on by default, `pv=0`
in links when off; works without candidate traits.

**Display.** Real popular shares in the results and history; a "Lost the
popular vote" tag; state shares and margin in map hover text and the state
panel; the story notes popular/electoral splits.

## Left to the builder

The spread, loyalty and noise constants, tuned against 300 timelines.
