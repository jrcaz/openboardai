// Address + data utilities for the spreadsheet shape. Pure, no tldraw/React
// deps so the formula engine can reuse them and they stay trivially testable.

/** Hard caps so a runaway AI tool call (or paste) can't balloon the snapshot. */
export const MAX_ROWS = 200
export const MAX_COLS = 26 // A–Z keeps headers single-letter for the "minimal" grid.

/** 0-based column index -> spreadsheet label. 0->A, 25->Z, 26->AA. */
export function colLabel(index: number): string {
  let i = index + 1
  let out = ''
  while (i > 0) {
    const rem = (i - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    i = Math.floor((i - 1) / 26)
  }
  return out
}

/** Inverse of colLabel. "A"->0, "Z"->25, "AA"->26. Case-insensitive. */
export function colIndex(label: string): number {
  let n = 0
  for (const ch of label.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) return -1
    n = n * 26 + (code - 64)
  }
  return n - 1
}

/** 0-based (col,row) -> "A1" (rows are shown 1-based). */
export function cellKey(col: number, row: number): string {
  return `${colLabel(col)}${row + 1}`
}

/**
 * Parse "A1" / "$A$1" -> 0-based {col,row}, or null if malformed. Tokens like
 * "A0" return null because rows are 1-based in spreadsheet notation; the
 * formula tokenizer then treats them as identifiers and the parser surfaces
 * `#NAME?` (matching Excel's behaviour for unknown names rather than `#REF!`).
 */
export function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref.trim())
  if (!m) return null
  const col = colIndex(m[1]!)
  const row = parseInt(m[2]!, 10) - 1
  if (col < 0 || row < 0) return null
  return { col, row }
}

export type CellMap = Record<string, string>

/**
 * Convert a 2D array of raw cell strings (the AI tool payload) into a sparse
 * cell map plus the grid dimensions, clamped to MAX_ROWS/MAX_COLS.
 */
export function dataToCells(data: string[][]): {
  cells: CellMap
  rows: number
  cols: number
} {
  const cells: CellMap = {}
  const rows = Math.min(data.length, MAX_ROWS)
  let cols = 0
  for (let r = 0; r < rows; r++) {
    const row = data[r] ?? []
    const c = Math.min(row.length, MAX_COLS)
    cols = Math.max(cols, c)
    for (let ci = 0; ci < c; ci++) {
      const raw = row[ci]
      if (raw != null && String(raw).trim() !== '') {
        cells[cellKey(ci, r)] = String(raw)
      }
    }
  }
  return { cells, rows: Math.max(rows, 1), cols: Math.max(cols, 1) }
}
