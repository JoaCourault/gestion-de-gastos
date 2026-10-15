// Formato argentino: punto de miles, coma decimal. Sin depender de Intl.

export function fmtNumber(n: number, decimals = 2): string {
  const neg = n < 0
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.')
  const miles = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}${miles}${dec ? ',' + dec : ''}`
}

/** '$ 1.234,56'  ·  compact: '$ 1,2 M' */
export function fmtMoney(n: number, opts: { moneda?: 'ARS' | 'USD'; compact?: boolean; decimals?: number } = {}) {
  const sym = opts.moneda === 'USD' ? 'US$' : '$'
  const neg = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (opts.compact && a >= 1e6) return `${neg}${sym} ${fmtNumber(a / 1e6, 1)} M`
  if (opts.compact && a >= 1e4) return `${neg}${sym} ${fmtNumber(a / 1e3, 0)} k`
  return `${neg}${sym} ${fmtNumber(a, opts.decimals ?? (Number.isInteger(a) ? 0 : 2))}`
}

/** Acepta '24.999,91', '24999.91', '24999,91', '$ 1.000'. Devuelve NaN si no es número. */
export function parseMoney(s: string): number {
  let t = s.replace(/[^\d.,-]/g, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  else if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', '') // '1.500' = mil quinientos
  return t === '' ? NaN : Number(t)
}

/** Para precargar inputs: 24999.91 → '24999,91' */
export const toInput = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? '' : String(Math.round(n * 100) / 100).replace('.', ',')
