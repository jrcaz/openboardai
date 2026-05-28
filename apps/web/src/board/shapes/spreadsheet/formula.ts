// A minimal, dependency-free spreadsheet calculator. It evaluates a sparse map
// of raw cell inputs (numbers, text, or "=" formulas) into displayable values,
// resolving cell references/ranges and a focused set of Excel-like functions.
// Pure functions only — no tldraw/React — so it's trivially unit-testable.

import { type CellMap, cellKey, colLabel, parseRef } from './grid'

export type CellScalar = number | string | boolean
export type CellError =
  | '#CIRCULAR!'
  | '#REF!'
  | '#DIV/0!'
  | '#NAME?'
  | '#VALUE!'
  | '#ERROR!'

const ERROR_CODES: readonly CellError[] = [
  '#CIRCULAR!',
  '#REF!',
  '#DIV/0!',
  '#NAME?',
  '#VALUE!',
  '#ERROR!',
]

export interface EvaluatedCell {
  /** Computed value, or null for an empty cell. */
  value: CellScalar | null
  /** What to render in the grid (formatted value, or the error code). */
  display: string
  /** Set when the cell resolved to an error. */
  error?: CellError
}

export type EvaluatedSheet = Map<string, EvaluatedCell>

/** Thrown internally to short-circuit a formula with a spreadsheet error. */
class FormulaError extends Error {
  constructor(public code: CellError) {
    super(code)
  }
}

const EMPTY: EvaluatedCell = { value: null, display: '' }

/**
 * Evaluate every cell within the given grid bounds (or every non-empty key in
 * `cells` if bounds are omitted). Returns a map keyed by cell address ("A1")
 * with each cell's computed value, display string, and any error. Cells inside
 * a reference cycle resolve to `#CIRCULAR!`.
 *
 * Passing `rows`/`cols` bounds the iteration to the rendered grid so a
 * snapshot with orphan keys (e.g. an out-of-bounds cell from a previous larger
 * grid) doesn't waste cycles on data the UI never shows.
 */
export function evaluateSheet(
  cells: CellMap,
  rows?: number,
  cols?: number,
): EvaluatedSheet {
  const cache: EvaluatedSheet = new Map()
  const visiting = new Set<string>()

  const resolve = (key: string): EvaluatedCell => {
    const cached = cache.get(key)
    if (cached) return cached
    if (visiting.has(key)) {
      const circular: EvaluatedCell = {
        value: null,
        display: '#CIRCULAR!',
        error: '#CIRCULAR!',
      }
      cache.set(key, circular)
      return circular
    }
    const raw = cells[key]
    if (raw == null || raw === '') {
      // Cache the empty result so repeated lookups (e.g. an empty cell inside
      // a range used by many formulas) don't re-hit the map lookup path.
      cache.set(key, EMPTY)
      return EMPTY
    }

    visiting.add(key)
    let result: EvaluatedCell
    try {
      result = raw[0] === '=' ? evalFormula(raw.slice(1), resolve) : parseLiteral(raw)
    } catch (err) {
      const code = err instanceof FormulaError ? err.code : '#ERROR!'
      result = { value: null, display: code, error: code }
    }
    visiting.delete(key)
    cache.set(key, result)
    return result
  }

  if (rows != null && cols != null) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = cellKey(c, r)
        if (cells[key] != null && cells[key] !== '') resolve(key)
      }
    }
  } else {
    for (const key of Object.keys(cells)) {
      if (cells[key] !== '' && cells[key] != null) resolve(key)
    }
  }
  return cache
}

function parseLiteral(raw: string): EvaluatedCell {
  const trimmed = raw.trim()
  if (trimmed !== '' && isNumeric(trimmed)) {
    const n = Number(trimmed)
    return { value: n, display: formatNumber(n) }
  }
  const upper = trimmed.toUpperCase()
  if (upper === 'TRUE') return { value: true, display: 'TRUE' }
  if (upper === 'FALSE') return { value: false, display: 'FALSE' }
  return { value: raw, display: raw }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType = 'num' | 'str' | 'ident' | 'ref' | 'op' | 'lparen' | 'rparen' | 'comma' | 'colon'
interface Token {
  type: TokenType
  value: string
}

const OPS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '=', '<', '>']

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch })
      i++
      continue
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ch })
      i++
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let str = ''
      while (j < input.length && input[j] !== '"') {
        str += input[j]
        j++
      }
      if (j >= input.length) throw new FormulaError('#ERROR!') // unterminated string
      tokens.push({ type: 'str', value: str })
      i = j + 1
      continue
    }
    // number: 123, 1.5, .5, 1e-3
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(input.slice(i))
      if (m) {
        tokens.push({ type: 'num', value: m[0] })
        i += m[0].length
        continue
      }
    }
    // identifier / cell reference: $?A$?1 or SUM
    if (/[A-Za-z$]/.test(ch)) {
      const m = /^\$?[A-Za-z]+\$?\d*/.exec(input.slice(i))!
      const text = m[0]
      // A run that ends in digits and parses as a ref is a cell reference;
      // otherwise it's a function/name identifier (TRUE/FALSE handled in parse).
      tokens.push({ type: parseRef(text) ? 'ref' : 'ident', value: text })
      i += text.length
      continue
    }
    // operators (longest first)
    const op = OPS.find((o) => input.startsWith(o, i))
    if (op) {
      tokens.push({ type: 'op', value: op })
      i += op.length
      continue
    }
    throw new FormulaError('#ERROR!')
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Parser + evaluator (recursive descent). Evaluates against `resolve` to read
// referenced cells lazily. Yields either a scalar or a range (array of cells).
// ---------------------------------------------------------------------------

type Resolver = (key: string) => EvaluatedCell
type EvalValue = { scalar: CellScalar } | { range: CellScalar[] }

function evalFormula(expr: string, resolve: Resolver): EvaluatedCell {
  const tokens = tokenize(expr)
  const parser = new Parser(tokens, resolve)
  const result = parser.parseExpression()
  parser.expectEnd()
  const scalar = asScalar(result)
  return scalarToCell(scalar)
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[], private resolve: Resolver) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }
  expectEnd(): void {
    if (this.pos !== this.tokens.length) throw new FormulaError('#ERROR!')
  }

  // expression := comparison
  parseExpression(): EvalValue {
    return this.parseComparison()
  }

  private parseComparison(): EvalValue {
    let left = this.parseAdditive()
    const t = this.peek()
    if (t?.type === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.value)) {
      this.next()
      const right = this.parseAdditive()
      return { scalar: compare(t.value, asScalar(left), asScalar(right)) }
    }
    return left
  }

  private parseAdditive(): EvalValue {
    let left = this.parseMultiplicative()
    while (true) {
      const t = this.peek()
      if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.next()
        const right = this.parseMultiplicative()
        const a = asNumber(asScalar(left))
        const b = asNumber(asScalar(right))
        left = { scalar: t.value === '+' ? a + b : a - b }
      } else break
    }
    return left
  }

  private parseMultiplicative(): EvalValue {
    let left = this.parsePower()
    while (true) {
      const t = this.peek()
      if (t?.type === 'op' && (t.value === '*' || t.value === '/')) {
        this.next()
        const right = this.parsePower()
        const a = asNumber(asScalar(left))
        const b = asNumber(asScalar(right))
        if (t.value === '/') {
          if (b === 0) throw new FormulaError('#DIV/0!')
          left = { scalar: a / b }
        } else {
          left = { scalar: a * b }
        }
      } else break
    }
    return left
  }

  // power is right-associative: 2^3^2 = 2^(3^2)
  private parsePower(): EvalValue {
    const left = this.parseUnary()
    const t = this.peek()
    if (t?.type === 'op' && t.value === '^') {
      this.next()
      const right = this.parsePower()
      return { scalar: Math.pow(asNumber(asScalar(left)), asNumber(asScalar(right))) }
    }
    return left
  }

  private parseUnary(): EvalValue {
    const t = this.peek()
    if (t?.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.next()
      const v = asNumber(asScalar(this.parseUnary()))
      return { scalar: t.value === '-' ? -v : v }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): EvalValue {
    const t = this.next()
    if (!t) throw new FormulaError('#ERROR!')

    if (t.type === 'num') return { scalar: Number(t.value) }
    if (t.type === 'str') return { scalar: t.value }

    if (t.type === 'lparen') {
      const inner = this.parseExpression()
      const close = this.next()
      if (close?.type !== 'rparen') throw new FormulaError('#ERROR!')
      return inner
    }

    if (t.type === 'ref') {
      // Range? A1:B5
      if (this.peek()?.type === 'colon') {
        this.next()
        const end = this.next()
        if (end?.type !== 'ref') throw new FormulaError('#REF!')
        return { range: this.readRange(t.value, end.value) }
      }
      return { scalar: this.readRef(t.value) }
    }

    if (t.type === 'ident') {
      const upper = t.value.toUpperCase()
      if (upper === 'TRUE') return { scalar: true }
      if (upper === 'FALSE') return { scalar: false }
      // function call
      if (this.peek()?.type === 'lparen') {
        this.next()
        const args = this.parseArgs()
        return { scalar: callFunction(upper, args) }
      }
      throw new FormulaError('#NAME?')
    }

    throw new FormulaError('#ERROR!')
  }

  private parseArgs(): EvalValue[] {
    const args: EvalValue[] = []
    if (this.peek()?.type === 'rparen') {
      this.next()
      return args
    }
    while (true) {
      args.push(this.parseExpression())
      const t = this.next()
      if (t?.type === 'rparen') break
      if (t?.type !== 'comma') throw new FormulaError('#ERROR!')
    }
    return args
  }

  private readRef(ref: string): CellScalar {
    const pos = parseRef(ref)
    if (!pos) throw new FormulaError('#REF!')
    const cell = this.resolve(cellKey(pos.col, pos.row))
    if (cell.error) throw new FormulaError(cell.error)
    return cell.value == null ? 0 : cell.value
  }

  private readRange(start: string, end: string): CellScalar[] {
    const a = parseRef(start)
    const b = parseRef(end)
    if (!a || !b) throw new FormulaError('#REF!')
    const minCol = Math.min(a.col, b.col)
    const maxCol = Math.max(a.col, b.col)
    const minRow = Math.min(a.row, b.row)
    const maxRow = Math.max(a.row, b.row)
    const out: CellScalar[] = []
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.resolve(cellKey(c, r))
        if (cell.error) throw new FormulaError(cell.error)
        if (cell.value != null) out.push(cell.value)
      }
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

function callFunction(name: string, args: EvalValue[]): CellScalar {
  switch (name) {
    case 'SUM':
      return numbersFrom(args).reduce((s, n) => s + n, 0)
    case 'AVERAGE': {
      const nums = numbersFrom(args)
      if (nums.length === 0) throw new FormulaError('#DIV/0!')
      return nums.reduce((s, n) => s + n, 0) / nums.length
    }
    case 'MIN': {
      const nums = numbersFrom(args)
      return nums.length ? Math.min(...nums) : 0
    }
    case 'MAX': {
      const nums = numbersFrom(args)
      return nums.length ? Math.max(...nums) : 0
    }
    case 'COUNT':
      return numbersFrom(args).length
    case 'IF': {
      if (args.length < 2) throw new FormulaError('#ERROR!')
      const cond = asScalar(args[0]!)
      const truthy =
        typeof cond === 'boolean' ? cond : typeof cond === 'number' ? cond !== 0 : cond !== ''
      if (truthy) return asScalar(args[1]!)
      return args.length >= 3 ? asScalar(args[2]!) : false
    }
    case 'CONCAT':
    case 'CONCATENATE':
      return scalarsFrom(args)
        .map((v) => scalarToString(v))
        .join('')
    case 'ROUND': {
      const n = asNumber(asScalar(args[0]!))
      const digits = args.length >= 2 ? asNumber(asScalar(args[1]!)) : 0
      const f = Math.pow(10, digits)
      return Math.round(n * f) / f
    }
    case 'ABS':
      return Math.abs(asNumber(asScalar(args[0]!)))
    default:
      throw new FormulaError('#NAME?')
  }
}

/** Flatten args (scalars + ranges) into numbers, ignoring blanks/non-numeric. */
function numbersFrom(args: EvalValue[]): number[] {
  const out: number[] = []
  for (const arg of args) {
    if ('range' in arg) {
      for (const v of arg.range) if (typeof v === 'number') out.push(v)
    } else {
      const v = arg.scalar
      if (typeof v === 'number') out.push(v)
      else if (typeof v === 'boolean') out.push(v ? 1 : 0)
      else if (typeof v === 'string' && isNumeric(v.trim())) out.push(Number(v))
    }
  }
  return out
}

/** Flatten args (scalars + ranges) into scalars, preserving order. */
function scalarsFrom(args: EvalValue[]): CellScalar[] {
  const out: CellScalar[] = []
  for (const arg of args) {
    if ('range' in arg) out.push(...arg.range)
    else out.push(arg.scalar)
  }
  return out
}

// ---------------------------------------------------------------------------
// Coercion + formatting helpers
// ---------------------------------------------------------------------------

function asScalar(v: EvalValue): CellScalar {
  if ('range' in v) {
    // A range used where a single value is expected: collapse a 1×1 range to
    // its single element; reject anything wider with #VALUE!. (Excel always
    // rejects ranges in scalar position via implicit intersection — we accept
    // the trivial 1-cell case as a minor convenience.)
    if (v.range.length === 1) return v.range[0]!
    throw new FormulaError('#VALUE!')
  }
  return v.scalar
}

function asNumber(v: CellScalar): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return 0
    if (isNumeric(t)) return Number(t)
  }
  throw new FormulaError('#VALUE!')
}

function compare(op: string, a: CellScalar, b: CellScalar): boolean {
  // Numeric comparison when both coerce to numbers; otherwise string compare.
  let x: number | string
  let y: number | string
  if (isComparableNumber(a) && isComparableNumber(b)) {
    x = asNumber(a)
    y = asNumber(b)
  } else {
    x = scalarToString(a)
    y = scalarToString(b)
  }
  switch (op) {
    case '=':
      return x === y
    case '<>':
      return x !== y
    case '<':
      return x < y
    case '>':
      return x > y
    case '<=':
      return x <= y
    case '>=':
      return x >= y
    default:
      throw new FormulaError('#ERROR!')
  }
}

function isComparableNumber(v: CellScalar): boolean {
  return typeof v === 'number' || typeof v === 'boolean'
}

function isNumeric(s: string): boolean {
  if (s === '') return false
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)
}

function scalarToCell(v: CellScalar): EvaluatedCell {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { value: null, display: '#ERROR!', error: '#ERROR!' }
    return { value: v, display: formatNumber(v) }
  }
  if (typeof v === 'boolean') return { value: v, display: v ? 'TRUE' : 'FALSE' }
  return { value: v, display: v }
}

function scalarToString(v: CellScalar): string {
  if (typeof v === 'number') return formatNumber(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return v
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  // Trim floating-point noise (e.g. 0.1+0.2) without forcing trailing zeros.
  return String(parseFloat(n.toFixed(10)))
}

// ---------------------------------------------------------------------------
// Context serialization (for feeding a selected sheet to the AI)
// ---------------------------------------------------------------------------

export function isErrorDisplay(display: string): boolean {
  return (ERROR_CODES as readonly string[]).includes(display)
}

/**
 * Render the sheet as a TSV-ish block of computed values for AI context. Empty
 * trailing rows/cols are omitted. `maxChars` caps the output.
 */
export function sheetToText(
  cells: CellMap,
  rows: number,
  cols: number,
  maxChars = 2000,
): string {
  const evaluated = evaluateSheet(cells, rows, cols)
  const lines: string[] = []
  for (let r = 0; r < rows; r++) {
    const row: string[] = []
    for (let c = 0; c < cols; c++) {
      row.push(evaluated.get(cellKey(c, r))?.display ?? '')
    }
    // Drop fully-empty rows so the model isn't fed a wall of blanks.
    if (row.some((v) => v !== '')) {
      lines.push(`${r + 1}\t${row.join('\t')}`)
    }
  }
  const header = '\t' + Array.from({ length: cols }, (_, c) => colLabel(c)).join('\t')
  const text = [header, ...lines].join('\n')
  if (text.length <= maxChars) return text
  // Truncate at the last full line break so the model never sees a half-cell
  // value (e.g. a number sliced mid-digit).
  const cutAt = text.lastIndexOf('\n', maxChars)
  return text.slice(0, cutAt > 0 ? cutAt : maxChars) + '\n…(truncated)'
}
