export const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']

const money = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })

export function fmtMoney(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : money.format(n)
}

/** Local date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function today(): string {
  return isoDate(new Date())
}

export function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return isoDate(d)
}

export function currentMonth(): number {
  return new Date().getMonth() + 1
}

/** "12,50" / "12.5" / "1 200" → number; invalid → NaN. */
export function parseAmount(s: string): number {
  const clean = s.replace(/[\s ]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return NaN
  return Number(clean)
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}.${m}`
}
