# table-stats-calc (Obsidian plugin)

Put a formula in any table cell; it calculates over the numbers above it in the same column.

| Item | Value |
| --- | --- |
| A | 10 |
| B | 20 |
| Mean | =mean |

Functions: `sum mean average median min max count range var stdev product`

- Results render in **Reading view** (the formula text stays in your note).
- Right-click in the editor → "Insert table…" (asks columns/rows); inside a table you also get "Table: add Mean row" etc.
- Commands (palette): "Add Mean row to table", Sum, Median, Min, Max, Count, Stdev, and "Insert table with Mean/Sum rows".
- Numbers may include `,` `$` `%`.

## Install
Copy this folder to `<your vault>/.obsidian/plugins/table-stats-calc/`, then Settings → Community plugins → enable "Table Stats Calc".

## Row formulas (e.g. average across a row)
Prefix a function with `row`: `=rowmean`, `=rowsum`, `=rowmax`... It averages the numbers to the left in the same row; blank cells are ignored, and an all-blank row shows `—`.
Right-click in a table → "Table: fill this column with row Mean" fills the whole column for you.
