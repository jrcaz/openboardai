import { describe, expect, it } from 'vitest'
import { evaluateSheet, sheetToText } from './formula'
import { cellKey, colIndex, colLabel, dataToCells, parseRef } from './grid'

/** Convenience: evaluate `cells` and return the display string for `key`. */
function display(cells: Record<string, string>, key: string): string {
  return evaluateSheet(cells).get(key)?.display ?? ''
}

describe('grid address helpers', () => {
  it('colLabel maps indices to labels', () => {
    expect(colLabel(0)).toBe('A')
    expect(colLabel(25)).toBe('Z')
    expect(colLabel(26)).toBe('AA')
    expect(colLabel(27)).toBe('AB')
  })

  it('colIndex is the inverse of colLabel', () => {
    for (const i of [0, 1, 25, 26, 51, 700]) {
      expect(colIndex(colLabel(i))).toBe(i)
    }
  })

  it('cellKey and parseRef round-trip', () => {
    expect(cellKey(0, 0)).toBe('A1')
    expect(cellKey(2, 4)).toBe('C5')
    expect(parseRef('C5')).toEqual({ col: 2, row: 4 })
    expect(parseRef('$A$1')).toEqual({ col: 0, row: 0 })
    expect(parseRef('nope')).toBeNull()
  })
})

describe('literals', () => {
  it('parses numbers, booleans, and strings', () => {
    expect(display({ A1: '42' }, 'A1')).toBe('42')
    expect(display({ A1: '3.14' }, 'A1')).toBe('3.14')
    expect(display({ A1: '-5' }, 'A1')).toBe('-5')
    expect(display({ A1: 'TRUE' }, 'A1')).toBe('TRUE')
    expect(display({ A1: 'false' }, 'A1')).toBe('FALSE')
    expect(display({ A1: 'hello world' }, 'A1')).toBe('hello world')
  })
})

describe('arithmetic + precedence', () => {
  it('respects operator precedence and parentheses', () => {
    expect(display({ A1: '=1+2*3' }, 'A1')).toBe('7')
    expect(display({ A1: '=(1+2)*3' }, 'A1')).toBe('9')
    expect(display({ A1: '=2^3^2' }, 'A1')).toBe('512') // right-assoc
    expect(display({ A1: '=10/4' }, 'A1')).toBe('2.5')
    expect(display({ A1: '=-3+5' }, 'A1')).toBe('2')
  })

  it('cleans floating-point noise', () => {
    expect(display({ A1: '=0.1+0.2' }, 'A1')).toBe('0.3')
  })
})

describe('cell references', () => {
  it('resolves single refs and chains', () => {
    const cells = { A1: '10', A2: '20', A3: '=A1+A2', A4: '=A3*2' }
    expect(display(cells, 'A3')).toBe('30')
    expect(display(cells, 'A4')).toBe('60')
  })

  it('treats empty referenced cells as 0', () => {
    expect(display({ A1: '=B1+5' }, 'A1')).toBe('5')
  })

  it('treats row-0 tokens like A0 as an unknown name (Excel rows are 1-based)', () => {
    expect(display({ A1: '=A0' }, 'A1')).toBe('#NAME?')
  })
})

describe('ranges + functions', () => {
  const cells = {
    A1: '10',
    A2: '20',
    A3: '30',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=MIN(A1:A3)',
    B4: '=MAX(A1:A3)',
    B5: '=COUNT(A1:A3)',
  }
  it('SUM/AVERAGE/MIN/MAX/COUNT over a range', () => {
    expect(display(cells, 'B1')).toBe('60')
    expect(display(cells, 'B2')).toBe('20')
    expect(display(cells, 'B3')).toBe('10')
    expect(display(cells, 'B4')).toBe('30')
    expect(display(cells, 'B5')).toBe('3')
  })

  it('IF with comparison conditions', () => {
    expect(display({ A1: '5', B1: '=IF(A1>3,"big","small")' }, 'B1')).toBe('big')
    expect(display({ A1: '1', B1: '=IF(A1>3,"big","small")' }, 'B1')).toBe('small')
  })

  it('CONCAT joins values as strings', () => {
    expect(display({ A1: 'foo', A2: '2', B1: '=CONCAT(A1,A2)' }, 'B1')).toBe('foo2')
  })

  it('ROUND and ABS', () => {
    expect(display({ A1: '=ROUND(3.14159,2)' }, 'A1')).toBe('3.14')
    expect(display({ A1: '=ABS(-7)' }, 'A1')).toBe('7')
  })

  it('SUM ignores non-numeric cells in a range', () => {
    expect(display({ A1: '10', A2: 'text', A3: '5', B1: '=SUM(A1:A3)' }, 'B1')).toBe('15')
  })
})

describe('errors', () => {
  it('division by zero', () => {
    expect(display({ A1: '=1/0' }, 'A1')).toBe('#DIV/0!')
  })

  it('unknown function name', () => {
    expect(display({ A1: '=NOPE(1)' }, 'A1')).toBe('#NAME?')
  })

  it('propagates errors through dependent cells', () => {
    expect(display({ A1: '=1/0', A2: '=A1+1' }, 'A2')).toBe('#DIV/0!')
  })

  it('detects circular references', () => {
    const cells = { A1: '=A2', A2: '=A1' }
    const out = evaluateSheet(cells)
    expect(out.get('A1')?.error).toBe('#CIRCULAR!')
    expect(out.get('A2')?.error).toBe('#CIRCULAR!')
  })

  it('detects self-reference', () => {
    expect(display({ A1: '=A1+1' }, 'A1')).toBe('#CIRCULAR!')
  })
})

describe('dataToCells', () => {
  it('converts a 2D array to a sparse cell map', () => {
    const { cells, rows, cols } = dataToCells([
      ['Item', 'Qty'],
      ['Apples', '3'],
      ['Total', '=SUM(B2:B2)'],
    ])
    expect(rows).toBe(3)
    expect(cols).toBe(2)
    expect(cells.A1).toBe('Item')
    expect(cells.B2).toBe('3')
    expect(cells.B3).toBe('=SUM(B2:B2)')
    expect(cells.C1).toBeUndefined()
  })
})

describe('sheetToText', () => {
  it('serializes computed values with headers', () => {
    const text = sheetToText({ A1: 'Name', B1: 'Score', A2: 'Al', B2: '=10+5' }, 2, 2)
    expect(text).toContain('A\tB')
    expect(text).toContain('Name\tScore')
    expect(text).toContain('Al\t15')
  })
})
