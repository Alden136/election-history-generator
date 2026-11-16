# Election History Generator

A standalone web app that generates an alternate history of American presidential elections, 1792 to 2064. It rebuilds **WWH's Election History Generator** spreadsheet as a program: every timeline comes from a seed, so any history can be replayed and shared by link.

**Try it online: <https://alden136.github.io/election-history-generator/>**

Based on WWH's *Election History Generator* Google Sheets spreadsheet. All credit for the simulation design goes to WWH.

## What it does

- Simulates 69 elections: ideology blocs, 14 parties plus third parties, presidents and their terms, Congress, the Supreme Court, territorial expansion and secession.
- Shows an electoral map for any year, the full political history, trends over time and statistics across thousands of timelines.
- Offers a **Faithful** mode that reproduces the spreadsheet exactly, quirks included, and a **Corrected** mode with 15 individual fixes.

## Running it

No install is needed to use the app: open the link above. To run it on your own computer:

Requires [Node.js](https://nodejs.org/) 20 or later.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm test` | Run the test suite |
| `npm run build` | Build the static site into `dist/` |
| `npm run seeds -- 10000 1 reference/sheet-refreshes.csv` | Run 10,000 timelines and compare them with recorded spreadsheet runs |
| `npm run extract` | Re-extract the data files from the frozen spreadsheet snapshot |
| `npm run build-map` | Rebuild the map shapes |

## Publishing

Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages ([workflow](.github/workflows/deploy.yml)).

## How it was checked

The engine is tested against a frozen copy of the spreadsheet and compared with 149 real spreadsheet recalculations. Details are in [reference/step-4-validation.md](reference/step-4-validation.md).

## Map data

State and province borders come from [Natural Earth](https://www.naturalearthdata.com/) (public domain), via the `sane-topojson` package and an extract of Natural Earth's 10m admin-1 file.
