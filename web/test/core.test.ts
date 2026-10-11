import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const core = require('../../apps-script/Core.js')

describe('appendAmount', () => {
  it('writes a plain number into an empty cell', () => {
    expect(core.appendAmount('', '', 12.5)).toEqual({ value: 12.5 })
  })
  it('turns an existing number into a formula', () => {
    expect(core.appendAmount('', 137.06, 20)).toEqual({ formula: '=137.06+20' })
  })
  it('appends to an existing formula', () => {
    expect(core.appendAmount('=10+5.2', 15.2, 3.99)).toEqual({ formula: '=10+5.2+3.99' })
  })
  it('appends negative amounts as subtraction', () => {
    expect(core.appendAmount('', 50, -10)).toEqual({ formula: '=50-10' })
  })
  it('handles a negative existing value', () => {
    expect(core.appendAmount('', -60, 5)).toEqual({ formula: '=-60+5' })
  })
  it('rounds floating point noise', () => {
    expect(core.appendAmount('', 0.1 + 0.2, 0.005)).toEqual({ formula: '=0.3+0.01' })
  })
  it('uses a comma decimal separator for comma locales', () => {
    expect(core.appendAmount('', 12.34, 5.5, ',')).toEqual({ formula: '=12,34+5,5' })
    expect(core.appendAmount('=10+5,2', 15.2, 3, ',')).toEqual({ formula: '=10+5,2+3' })
  })
  it('refuses to overwrite text', () => {
    expect(core.appendAmount('', 'DO TĄD', 10).error).toMatch(/tekst/)
  })
})

describe('removeAmount', () => {
  it('clears a cell holding exactly the amount', () => {
    expect(core.removeAmount('', 12.5, 12.5)).toEqual({ value: '' })
  })
  it('strips the trailing term and collapses to a number', () => {
    expect(core.removeAmount('=137.06+20', 157.06, 20)).toEqual({ value: 137.06 })
  })
  it('strips the trailing term and keeps a formula', () => {
    expect(core.removeAmount('=10+5.2+3.99', 19.19, 3.99)).toEqual({ formula: '=10+5.2' })
  })
  it('reverts a negative entry', () => {
    expect(core.removeAmount('=50-10', 40, -10)).toEqual({ value: 50 })
  })
  it('strips terms written with a comma separator', () => {
    expect(core.removeAmount('=12,34+5,5', 17.84, 5.5)).toEqual({ value: 12.34 })
    expect(core.removeAmount('=10+5,2+3,99', 19.19, 3.99, ',')).toEqual({ formula: '=10+5,2' })
  })
  it('falls back to subtraction when the term is not last', () => {
    expect(core.removeAmount('=10+20+5', 35, 20)).toEqual({ formula: '=10+20+5-20' })
  })
})

describe('toNum', () => {
  it('parses Polish currency strings', () => {
    expect(core.toNum('1 234,56 zł')).toBe(1234.56)
    expect(core.toNum('-7 648,00 zł')).toBe(-7648)
    expect(core.toNum('')).toBeNull()
    expect(core.toNum('abc')).toBeNull()
    expect(core.toNum(3)).toBe(3)
  })
})

/** Builds a sheet row: col B = name, cols I.. = day numbers when `header`. */
function row(name: string, header = false): unknown[] {
  const r: unknown[] = ['', name, '', '', '', '', '', '']
  if (header) for (let d = 1; d <= 31; d++) r.push(d)
  else r.push('', '')
  return r
}

describe('parseMonthValues', () => {
  const values = [
    row('', true), // day header at the top of the sheet
    row('Planowane przychody'),
    row('Przychody'),
    row('Kategoria'),
    row('SUMA:'),
    row('Całkowite przychody', true),
    row('Wynagrodzenie Lucka'),
    row('800+'),
    row('.'),
    row(' '),
    row('Wydatki'),
    row('Kategoria'),
    row('SUMA:'),
    row('Jedzenie', true),
    row('Jedzenie dom'),
    row('Inne'),
    row('.'),
    row('Transport', true),
    row('Paliwo do auta'),
    row('Inne'),
    row('IMPREZY', true),
    row('.'),
    row('', true),
    row('SUMA'),
    row('Ignored after end'),
  ]
  const s = core.parseMonthValues(values)

  it('finds income groups and items', () => {
    expect(s.income).toEqual([
      { name: 'Całkowite przychody', row: 6, items: [{ name: 'Wynagrodzenie Lucka', row: 7 }, { name: '800+', row: 8 }] },
    ])
  })
  it('keeps duplicate item names apart by group', () => {
    const names = s.expense.map((g: { name: string }) => g.name)
    expect(names).toEqual(['Jedzenie', 'Transport', 'IMPREZY'])
    expect(s.expense[0].items.find((i: { name: string }) => i.name === 'Inne').row).toBe(16)
    expect(s.expense[1].items.find((i: { name: string }) => i.name === 'Inne').row).toBe(20)
  })
  it('skips placeholder rows and stops at SUMA', () => {
    expect(s.expense[2].items).toEqual([])
  })
})

describe('findLabelValue', () => {
  it('returns the first number after the label', () => {
    const values = [['', 'Rzeczywiste wydatki', '', 1234.5], ['', 'Inne', 5]]
    expect(core.findLabelValue(values, 'Rzeczywiste wydatki')).toBe(1234.5)
    expect(core.findLabelValue(values, 'Brak')).toBeNull()
  })
})

describe('accountColumns', () => {
  it('maps month names and infers missing ones by position', () => {
    // matches the real STAN KONT header: Styczeń/Kwiecień cells are not plain text
    const header = ['', 'Nazwa konta', 'Stan kont na koniec 2025', '', 42, 'Luty', 'Marzec', null, 'Maj',
      'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
    const c = core.accountColumns(header)
    expect(c.start).toBe(2)
    expect(c.months).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })
  it('accepts Date headers', () => {
    const header = ['', 'Nazwa konta', 'Stan', new Date(2026, 0, 31), new Date(2026, 1, 28)]
    expect(core.accountColumns(header).months.slice(0, 3)).toEqual([3, 4, 5])
  })
})

describe('parseAccountsValues', () => {
  it('splits assets and debts', () => {
    const values = [
      ['', 'STAN KONT'],
      ['', 'Nazwa konta', 'Stan'],
      ['', 'Gotówka', 10],
      ['', '', 0],
      ['', 'SUMA:', 10],
      ['', 'Lista wszystkich długów'],
      ['', 'Nazwa konta'],
      ['', 'Kredyt', 5],
      ['', 'SUMA:', 5],
    ]
    const r = core.parseAccountsValues(values)
    expect(r.assets).toEqual([{ name: 'Gotówka', row: 3 }])
    expect(r.debts).toEqual([{ name: 'Kredyt', row: 8 }])
    expect(r.header[2]).toBe('Stan')
  })
})
