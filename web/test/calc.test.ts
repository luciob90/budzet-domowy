import { describe, expect, it } from 'vitest'
import { evaluate, pressKey, pretty, sanitize } from '../src/lib/calc'

function typeKeys(keys: string[]): string {
  return keys.reduce(pressKey, '')
}

describe('evaluate', () => {
  it('handles a plain amount', () => {
    expect(evaluate('12,5')).toEqual({ value: 12.5, terms: 1 })
  })
  it('adds and subtracts several items', () => {
    expect(evaluate('12,50+3,99+7-2')).toEqual({ value: 21.49, terms: 4 })
  })
  it('rounds to grosze', () => {
    expect(evaluate('0,1+0,2').value).toBe(0.3)
  })
  it('rejects incomplete expressions', () => {
    expect(evaluate('12+').value).toBeNaN()
    expect(evaluate('').value).toBeNaN()
    expect(evaluate('+5').value).toBeNaN()
    expect(evaluate('1,234').value).toBeNaN()
  })
})

describe('pressKey', () => {
  it('builds an expression from keys', () => {
    expect(typeKeys(['1', '2', ',', '5', '+', '3'])).toBe('12,5+3')
  })
  it('does not allow a leading operator', () => {
    expect(typeKeys(['+', '5'])).toBe('5')
  })
  it('replaces a repeated operator', () => {
    expect(typeKeys(['5', '+', '-', '2'])).toBe('5-2')
  })
  it('limits decimals and commas per number', () => {
    expect(typeKeys(['1', ',', '2', '3', '4', ','])).toBe('1,23')
    expect(typeKeys(['1', '+', ',', '5'])).toBe('1+0,5')
  })
  it('replaces a leading zero', () => {
    expect(typeKeys(['0', '7'])).toBe('7')
  })
  it('supports backspace and clear', () => {
    expect(typeKeys(['1', '2', '⌫'])).toBe('1')
    expect(typeKeys(['1', '+', '2', 'C'])).toBe('')
  })
})

describe('pretty / sanitize', () => {
  it('round-trips the display format', () => {
    const shown = pretty('12,5+3-1')
    expect(shown).toBe('12,5 + 3 − 1')
    expect(sanitize(shown)).toBe('12,5+3-1')
  })
  it('accepts a dot as decimal separator', () => {
    expect(sanitize('4.99 + 1')).toBe('4,99+1')
  })
})
