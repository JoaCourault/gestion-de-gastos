import { useState } from 'react'

import { openPeriod } from './calc'
import { currentPeriod, todayISO } from './dates'
import type { AppData, Period } from './types'

/** Período "actual": el primer resumen todavía abierto entre las tarjetas activas. */
export function todayPeriod(data: AppData): Period {
  const today = todayISO()
  const open = [...data.cards, ...data.shared.cards].filter((c) => c.activa).map((c) => openPeriod(c, today))
  return open.length ? open.sort()[0] : currentPeriod()
}

export function usePeriodState(data: AppData, initial?: string | string[]) {
  const today = todayPeriod(data)
  const start = typeof initial === 'string' && /^\d{4}-\d{2}$/.test(initial) ? initial : today
  const [period, setPeriod] = useState<Period>(start)
  return { period, setPeriod, today }
}
