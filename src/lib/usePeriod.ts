import { useState, useSyncExternalStore } from 'react'

import { nextDueMonth, openPeriod, type Agrupacion } from './calc'
import { currentPeriod, todayISO } from './dates'
import { getRaw, setRaw } from './prefs'
import type { AppData, Period } from './types'

/** Período "actual": el primer resumen todavía abierto entre las tarjetas activas. */
export function todayPeriod(data: AppData): Period {
  const today = todayISO()
  const open = [...data.cards, ...data.shared.cards].filter((c) => c.activa).map((c) => openPeriod(c, today))
  return open.length ? open.sort()[0] : currentPeriod()
}

/** Mes de pago "actual": el primero en que vence algún resumen todavía no vencido (tarjetas activas). */
export function todayDueMonth(data: AppData): string {
  const today = todayISO()
  const due = [...data.cards, ...data.shared.cards].filter((c) => c.activa).map((c) => nextDueMonth(c, today))
  return due.length ? due.sort()[0] : currentPeriod()
}

// ───────────── Agrupación de resúmenes (preferencia del dispositivo, compartida entre pantallas) ─────────────

const AGRUPACION_KEY = 'prefs:agrupacion'
const listeners = new Set<() => void>()

const getAgrupacion = (): Agrupacion => (getRaw(AGRUPACION_KEY) === 'cierre' ? 'cierre' : 'vencimiento')

function setAgrupacion(modo: Agrupacion) {
  setRaw(AGRUPACION_KEY, modo)
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Agrupar los resúmenes por mes de cierre o de vencimiento. Cambiarlo en una pantalla cambia todas. */
export function useAgrupacion() {
  const modo = useSyncExternalStore(subscribe, getAgrupacion, getAgrupacion)
  return [modo, setAgrupacion] as const
}

/**
 * Mes elegido en pantalla. Según `modo` es el mes de cierre de los resúmenes o el mes en que vencen;
 * al cambiar de modo vuelve al mes "actual" de ese modo.
 */
export function usePeriodState(data: AppData, initial?: string | string[], modo: Agrupacion = 'cierre') {
  const today = modo === 'vencimiento' ? todayDueMonth(data) : todayPeriod(data)
  const start = typeof initial === 'string' && /^\d{4}-\d{2}$/.test(initial) ? initial : today
  const [period, setPeriod] = useState<Period>(start)
  const [prevModo, setPrevModo] = useState(modo)
  if (modo !== prevModo) {
    setPrevModo(modo)
    setPeriod(today)
  }
  return { period, setPeriod, today }
}
