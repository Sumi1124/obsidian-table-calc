const { Plugin, Modal, Setting, Notice } = require("obsidian");

class InsertTableModal extends Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
    this.rows = 4;
    this.cols = 3;
  }
  onOpen() {
    this.contentEl.createEl("h3", { text: "Insert table" });
    new Setting(this.contentEl).setName("Columns").addText((t) =>
      t.setValue("3").onChange((v) => (this.cols = parseInt(v) || 3)));
    new Setting(this.contentEl).setName("Data rows").addText((t) =>
      t.setValue("4").onChange((v) => (this.rows = parseInt(v) || 4)));
    new Setting(this.contentEl).addButton((b) =>
      b.setButtonText("Insert").setCta().onClick(() => {
        this.close();
        this.onSubmit(Math.min(this.cols, 20), Math.min(this.rows, 100));
      }));
  }
  onClose() { this.contentEl.empty(); }
}

function buildTable(cols, rows) {
  const line = (cells) => "| " + cells.join(" | ") + " |";
  const header = Array.from({ length: cols }, (_, i) => (i === 0 ? "Item" : `Col ${i}`));
  const sep = Array(cols).fill("---");
  const body = Array.from({ length: rows }, (_, r) =>
    line(Array.from({ length: cols }, (_, c) => (c === 0 ? `Row ${r + 1}` : ""))));
  return [line(header), line(sep), ...body].join("\n") + "\n";
}

// ---------- calculation logic ----------
const FUNCS = {
  sum: (n) => n.reduce((a, b) => a + b, 0),
  mean: (n) => n.reduce((a, b) => a + b, 0) / n.length,
  average: (n) => FUNCS.mean(n),
  median: (n) => {
    const s = [...n].sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  },
  min: (n) => Math.min(...n),
  max: (n) => Math.max(...n),
  count: (n) => n.length,
  range: (n) => Math.max(...n) - Math.min(...n),
  var: (n) => {
    if (n.length < 2) return NaN;
    const m = FUNCS.mean(n);
    return n.reduce((a, b) => a + (b - m) ** 2, 0) / (n.length - 1);
  },
  stdev: (n) => Math.sqrt(FUNCS.var(n)),
  product: (n) => n.reduce((a, b) => a * b, 1),
};

const FORMULA_RE = /^=\s*([a-z]+)\s*(?:\(\s*\))?$/i;

function parseNumber(text) {
  const t = text.trim().replace(/[,$€£%\s]/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  return parseFloat(t);
}

function format(x) {
  if (!Number.isFinite(x)) return "—";
  return String(Math.round(x * 10000) / 10000);
}

// rows: array of arrays of cell strings (body rows only)
// returns map "r,c" -> result string for formula cells
function evaluateTable(rows) {
  const out = {};
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const m = FORMULA_RE.exec(cell.trim());
      if (!m) return;
      let name = m[1].toLowerCase();
      const isRow = name.startsWith("row");
      if (isRow) name = name.slice(3);
      const fn = FUNCS[name];
      if (!fn) { out[`${r},${c}`] = { error: true, text: `#NAME? (${m[1]})` }; return; }
      const nums = [];
      if (isRow) {
        // across the row: numeric cells to the left (blanks/text skipped)
        for (let j = 0; j < c; j++) {
          const v = parseNumber(row[j] ?? "");
          if (v !== null) nums.push(v);
        }
      } else {
        for (let i = 0; i < r; i++) {
          const v = parseNumber(rows[i][c] ?? "");
          if (v !== null) nums.push(v);
        }
      }
      out[`${r},${c}`] = { error: false, text: nums.length ? format(fn(nums)) : "—" };
    });
  });
  return out;
}

// ---------- plugin ----------
module.exports = class TableCalcPlugin extends Plugin {
  async onload() {
    // Render formulas in Reading view
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll("table").forEach((table) => {
        const trs = Array.from(table.querySelectorAll("tbody tr"));
        const rows = trs.map((tr) =>
          Array.from(tr.children).map((td) => td.textContent ?? ""));
        const results = evaluateTable(rows);
        for (const key of Object.keys(results)) {
          const [r, c] = key.split(",").map(Number);
          const td = trs[r].children[c];
          const res = results[key];
          td.setAttribute("title", rows[r][c].trim());
          td.textContent = res.text;
          td.addClass(res.error ? "table-calc-error" : "table-calc-result");
        }
      });
    });

    // Commands: add a calculation row to the table at the cursor
    for (const fn of ["sum", "mean", "median", "min", "max", "count", "stdev"]) {
      const label = fn[0].toUpperCase() + fn.slice(1);
      this.addCommand({
        id: `add-${fn}-row`,
        name: `Add ${label} row to table`,
        editorCallback: (editor) => this.addRow(editor, fn, label),
      });
    }

    // Right-click menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) =>
          item.setTitle("Insert table…").setIcon("table").onClick(() =>
            new InsertTableModal(this.app, (cols, rows) =>
              editor.replaceSelection(buildTable(cols, rows))).open()));
        if (editor.getLine(editor.getCursor().line).trim().startsWith("|")) {
          menu.addItem((item) =>
            item.setTitle("Table: fill this column with row Mean").setIcon("calculator")
              .onClick(() => this.fillColumn(editor, "mean")));
          menu.addItem((item) =>
            item.setTitle("Table: add Mean column").setIcon("calculator")
              .onClick(() => this.addColumn(editor, "mean", "Mean")));
          for (const fn of ["sum", "mean", "median", "min", "max", "count", "stdev"]) {
            const label = fn[0].toUpperCase() + fn.slice(1);
            menu.addItem((item) =>
              item.setTitle(`Table: add ${label} row`).setIcon("calculator")
                .onClick(() => this.addRow(editor, fn, label)));
          }
        }
      })
    );

    this.addCommand({
      id: "fill-column-row-mean",
      name: "Fill this column with row Mean",
      editorCallback: (editor) => this.fillColumn(editor, "mean"),
    });
    this.addCommand({
      id: "add-mean-column",
      name: "Add Mean column to table",
      editorCallback: (editor) => this.addColumn(editor, "mean", "Mean"),
    });

    this.addCommand({
      id: "insert-table",
      name: "Insert table with Mean/Sum rows",
      editorCallback: (editor) => {
        editor.replaceSelection(
          "| Item | Value | Score |\n| --- | --- | --- |\n| A | 10 | 4.5 |\n| B | 20 | 3.0 |\n| C | 30 | 5.0 |\n| Sum | =sum | =sum |\n| Mean | =mean | =mean |\n"
        );
      },
    });
  }

  tableRange(editor) {
    const isRow = (l) => l.trim().startsWith("|");
    const line = editor.getCursor().line;
    if (!isRow(editor.getLine(line))) { new Notice("Place the cursor inside a table."); return null; }
    let start = line, end = line;
    while (start > 0 && isRow(editor.getLine(start - 1))) start--;
    while (end + 1 < editor.lineCount() && isRow(editor.getLine(end + 1))) end++;
    return { start, end };
  }

  splitRow(l) { return l.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim()); }

  // Add a new last column: header = label, body cells = =row<fn>
  addColumn(editor, fn, label) {
    const t = this.tableRange(editor); if (!t) return;
    for (let n = t.start; n <= t.end; n++) {
      const cells = this.splitRow(editor.getLine(n));
      cells.push(n === t.start ? label : n === t.start + 1 ? "---" : `=row${fn}`);
      editor.setLine(n, "| " + cells.join(" | ") + " |");
    }
  }

  // Put =row<fn> in the cursor's column for every body row
  fillColumn(editor, fn) {
    const t = this.tableRange(editor); if (!t) return;
    const cur = editor.getCursor();
    const before = editor.getLine(cur.line).slice(0, cur.ch);
    const col = Math.max(0, (before.match(/\|/g) || []).length - 1);
    for (let n = t.start + 2; n <= t.end; n++) {
      const cells = this.splitRow(editor.getLine(n));
      while (cells.length <= col) cells.push("");
      cells[col] = `=row${fn}`;
      editor.setLine(n, "| " + cells.join(" | ") + " |");
    }
  }

  addRow(editor, fn, label) {
    const isRow = (l) => l.trim().startsWith("|");
    let line = editor.getCursor().line;
    if (!isRow(editor.getLine(line))) return new Notice("Place the cursor inside a table.");
    let end = line;
    while (end + 1 < editor.lineCount() && isRow(editor.getLine(end + 1))) end++;
    const cols = editor.getLine(end).trim().replace(/^\||\|$/g, "").split("|").length;
    const cells = [label, ...Array(cols - 1).fill(`=${fn}`)];
    const row = "| " + cells.join(" | ") + " |";
    const endLen = editor.getLine(end).length;
    editor.replaceRange("\n" + row, { line: end, ch: endLen });
  }
};

module.exports.evaluateTable = evaluateTable;
