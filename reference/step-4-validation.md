# Step 4 engine validation

Run the checks from the project folder.

```powershell
npm test
npm run build
npm run seeds -- 10000 1 reference/sheet-refreshes.csv
```

Last run 2026-11-12: 68 tests pass, the build succeeds, and all 10,000 engine timelines pass the invariants.

The frozen XLSX contains one timeline. The workbook tests read its cached cells and feed the engine the relevant sheet inputs. Term rows 4–72 align with state rows 89–157. Urbanization is one row lower, and the 2065 inauguration is in rows 73 and 158. Numeric comparisons allow for the export's rounded cached values.

## Workbook and pinned draws

- Check the fixed 1792 row, prior-row approval and stability, national support and election-day approval, bloc sizes and shares, all 14 parties' votes by bloc, nonvoters, territory, state totals and winners, Electoral College shares, congressional seats, Supreme Court averages, and the summary panel.
- Reproduce all three presidential decision paths from cached inputs. Seven elections in the snapshot went to Congress.
- For random workbook outputs, test admissible branches or the allowed range of draws. The workbook does not retain the individual RAND values. The pinned suite exercises cutoffs and outcomes across the presidency, territory, voting, electors, Congress, the court, and party evolution.
- Google Sheets can leave a positive congressional remainder near machine precision even when Third Party has zero raw seats. The cached XLSX can store the remainder as zero while retaining the corresponding nonzero closeness score. The test checks both valid scores for this case and uses cached closeness when replaying the contingent decision.

## Recorded sheet runs

The CSV contains 149 recalculations from a private Drive copy of the live workbook ("Election History Generator - Step 4 validation sample"). The copy retains the sampling formulas in B186:AA186 of each tab. The scratch row reads the summary counts, the 1796 performance value, election averages and rates, and each party's share of wins. Each recorded 1796 performance value was distinct. Election rates and averages exclude the fixed 1792 election. The engine sample uses seeds 1–10,000 and the same election window.

- Refreshes 0–49: one tab, recalculated by editing an unused scratch cell.
- Refreshes 50–148 (added 2026-11-12): the copy has nine duplicate tabs (S2–S10) of the generator, each an independent timeline. Pasting each tab's sampling row into the `Log` tab triggers the next recalculation, so ten timelines are recorded per round. One of the 100 new runs was dropped (see below).

| Metric | Google Sheets (149) | Engine (10,000) |
|---|---:|---:|
| Dictatorships per timeline | 0.68 | 0.77 |
| Civil wars per timeline | 1.02 | 1.05 |
| Expansions per timeline | 2.70 | 2.70 |
| Governing parties per timeline | 7.00 | 7.00 |
| Weirdness | 11.06 | 11.14 |
| Winner's average electoral share | 68.21% | 68.34% |
| Winner's average popular share | 53.43% | 53.95% |
| Contingent elections | 13.29% | 13.27% |
| Elections with seceded electors | 1.46% | 1.38% |

The approximate 95% intervals for engine minus sheet means include zero for every metric, including each party's win rate. The runner prints the sample means, 10th–90th percentile ranges and intervals, and omits intervals when a sample has zero observed variation.

The first 50 runs averaged 1.10 dictatorships per timeline, the gap noted earlier. The next 99 averaged 0.46, so that gap was sampling noise: dictatorships cluster in a few timelines. Timelines with five or more dictatorships: sheet 4 of 149 (2.7%), engine 562 of 10,000 (5.6%). That difference is not statistically significant at this sample size (about 8 would be expected in the sheet).

One new sheet run was a "USA is dead" timeline: every state seceded, the sheet's averages became `#DIV/0!`, and 33 elections had no voting states. It cannot be compared field by field, so it is excluded from the CSV. The engine reaches an election with no voting states 7 times in 680,000 elections, then recovers instead of staying in an error state. One dead timeline in 150 sheet runs is too few to say whether the sheet reaches that state more often.

All 10,000 engine timelines passed the invariants. Seven of 680,000 simulated elections had no eligible electors. The engine records zero electoral shares and applies the contingent rules. The sheet's formulas divide by zero in that case. The workbook also applies the state lean adjustment after the bloc size floor, so the invariant checks allow signed bloc values and still require the shares to sum to one.
