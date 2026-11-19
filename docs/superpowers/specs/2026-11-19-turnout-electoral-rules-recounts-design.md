# Turnout, electoral rules and recounts — design

Ideas 6, 7 and 8 from "Election System Depth Ideas". 2026-11-19.

Each ships as its own Addition in Rules, on by default; with them off,
timelines are unchanged (fingerprint test). Ideas 7 and 8 need the state
popular vote.

## Idea 8: close states and recounts

- A state won by under half a point goes to a recount. Flip chance falls from
  25% at a zero margin to 5% at half a point.
- A recount is contested when giving that state to the other side would change
  who wins the presidency. The winner then starts 5 points lower on day-one
  approval.
- Display: recount line in map hover text and the state panel; "Contested
  result" tag on the results; a story sentence.

## Idea 7: other electoral rules (user chose "both")

- Methods: winner-take-all (default, unchanged), by district (2 electors to the
  state winner, the rest split by vote share with a leader's bonus, standing in
  for districts), proportional, national popular vote (plurality wins).
- Rules picks the method the timeline uses (changes history).
- Every election shows "Under other rules": who would have won under each
  method from the same votes (changes nothing).
- Faithless electors (switch): rare named ones in a state, replacing the
  spreadsheet's anonymous roll.

## Idea 6: turnout and suffrage

- Each of the seven ideology blocs has a turnout each election (about 30–85%):
  up for a close last election and a party near the bloc; down for the
  president's side after a bad term, and for blocs with no party near them.
  Turnout scales what parties can win from a bloc, so it moves support.
- Suffrage widenings add new voters with a tilt and low first turnout: 1872
  Black men (left), 1920 women (even), 1968 Voting Rights Act (left), 1972
  18-year-olds (left).
- Display: turnout in the results; a Turnout chart in Trends with the
  widenings marked; story sentences. Vote counts still use real turnout.
