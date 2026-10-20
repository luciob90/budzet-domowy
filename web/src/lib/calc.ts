/**
 * Tiny calculator for the amount field: numbers joined with "+" and "-",
 * Polish decimal comma, at most 2 decimals per number.
 */

export interface CalcResult {
  /** Sum rounded to grosze; NaN when the expression is incomplete or invalid. */
  value: number
  /** Number of terms (1 = plain amount). */
  terms: number
}

const NUM = /^\d+(,\d{0,2})?$/

export function evaluate(expr: string): CalcResult {
  const tokens = expr.match(/[+-]|[^+-]+/g) ?? []
  let total = 0
  let terms = 0
  let sign = 1
  let expectNumber = true
  for (const t of tokens) {
    if (t === '+' || t === '-') {
      if (expectNumber) return { value: NaN, terms }
      sign = t === '+' ? 1 : -1
      expectNumber = true
    } else {
      if (!expectNumber || !NUM.test(t)) return { value: NaN, terms }
      total += sign * Number(t.replace(',', '.'))
      terms++
      expectNumber = false
    }
  }
  if (expectNumber) return { value: NaN, terms }
  return { value: Math.round(total * 100) / 100, terms }
}

/** Applies one keypad key to the expression, ignoring keys that would make it invalid. */
export function pressKey(expr: string, key: string): string {
  if (key === 'C') return ''
  if (key === '⌫') return expr.slice(0, -1)
  const last = expr.slice(-1)
  const current = expr.split(/[+-]/).pop() ?? ''
  if (key === '+' || key === '-') {
    if (expr === '') return expr
    if (last === '+' || last === '-') return expr.slice(0, -1) + key
    if (last === ',') return expr.slice(0, -1) + key
    return expr + key
  }
  if (key === ',') {
    if (current.includes(',')) return expr
    return expr + (current === '' ? '0,' : ',')
  }
  if (/^\d$/.test(key)) {
    if (/,\d\d$/.test(current)) return expr
    if (current === '0') return expr.slice(0, -1) + key
    return expr + key
  }
  return expr
}

/** Cleans free-typed text (physical keyboard / paste) into the expression alphabet. */
export function sanitize(text: string): string {
  return text.replace(/\./g, ',').replace(/−/g, '-').replace(/[^\d,+-]/g, '')
}

/** "12,5+3" → "12,5 + 3" for display. */
export function pretty(expr: string): string {
  return expr.replace(/([+-])/g, ' $1 ').replace(/-/g, '−')
}
