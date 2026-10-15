import type { ISODate, Period } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = (): ISODate => toISO(new Date())
export const parseISO = (s: ISODate): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const daysInMonth = (y: number, m1: number) => new Date(y, m1, 0).getDate()

export const periodOf = (iso: ISODate): Period => iso.slice(0, 7)
export const currentPeriod = (): Period => periodOf(todayISO())

export const addPeriods = (p: Period, n: number): Period => {
  const [y, m] = p.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`
}

/** Meses de a hasta b (b - a). */
export const diffPeriods = (a: Period, b: Period): number => {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/** Fecha con el día ajustado al último día del mes si no existe (ej. 31 de febrero → 28/29). */
export const dateInPeriod = (p: Period, day: number): ISODate => {
  const [y, m] = p.split('-').map(Number)
  return `${p}-${pad(Math.min(Math.max(1, day), daysInMonth(y, m)))}`
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** 'OCT-26' */
export const periodShort = (p: Period) => {
  const [y, m] = p.split('-').map(Number)
  return `${MESES[m - 1].slice(0, 3).toUpperCase()}-${String(y).slice(2)}`
}
/** 'Octubre 2026' */
export const periodLong = (p: Period) => {
  const [y, m] = p.split('-').map(Number)
  const s = MESES[m - 1]
  return `${s[0].toUpperCase()}${s.slice(1)} ${y}`
}

/** '14/10/26' */
export const fmtDate = (iso: ISODate | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}
/** '14 oct' */
export const fmtDayMonth = (iso: ISODate) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[m - 1].slice(0, 3)}`
}

export const daysUntil = (iso: ISODate) => {
  const a = parseISO(todayISO()).getTime()
  const b = parseISO(iso).getTime()
  return Math.round((b - a) / 86400000)
}

/** '14/10/26 18:11' (hora local, 24 h) */
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${fmtDate(toISO(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
