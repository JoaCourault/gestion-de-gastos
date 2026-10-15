import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

import { canDownload, deleteSnapshot, downloadText, listSnapshots, scheduleReminder, writeSnapshot } from './backupFiles'
import { todayISO } from './dates'
import { getBackupPrefs, getLastBackup, setLastBackup, type BackupPrefs } from './prefs'
import { makeBackupFile } from './repo'
import { useStore } from './store'
import type { AppData } from './types'

export { useBackupNotificationTap } from './backupFiles'

const pad = (n: number) => String(n).padStart(2, '0')

export function snapshotName(d = new Date()) {
  return `gastos-${todayISO()}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
}

/** Guarda una copia en el dispositivo, borra las más viejas y devuelve el nombre del archivo. */
export function createSnapshot(data: AppData, prefs: BackupPrefs = getBackupPrefs()): string {
  const name = snapshotName()
  const text = JSON.stringify(makeBackupFile(data), null, 1)
  writeSnapshot(name, text)
  for (const old of listSnapshots().slice(Math.max(1, prefs.conservar))) deleteSnapshot(old.name)
  setLastBackup(new Date().toISOString())
  return name
}

/** Momento de hoy en que corresponde el backup automático. */
function dueToday(hora: string) {
  const [h, m] = hora.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

/** true si ya pasó la hora de hoy y todavía no se hizo la copia desde entonces. */
export function backupDue(prefs: BackupPrefs, last: string | null, now = new Date()) {
  if (!prefs.activo) return false
  const due = dueToday(prefs.hora)
  if (now < due) return false
  return !last || new Date(last) < due
}

/**
 * Copia automática diaria: mientras la app está abierta revisa cada minuto, y al volver a
 * primer plano. Si a la hora elegida la app estaba cerrada, la copia se hace al abrirla.
 * En el celular además programa una notificación diaria para compartir la copia a Drive.
 */
export function useAutoBackup() {
  const { data, offline } = useStore()
  const dataRef = useRef<AppData | null>(null)
  useEffect(() => {
    dataRef.current = offline ? null : data
  }, [data, offline])

  useEffect(() => {
    scheduleReminder(getBackupPrefs()).catch(() => {})
  }, [])

  useEffect(() => {
    const check = () => {
      const d = dataRef.current
      const prefs = getBackupPrefs()
      if (!d || !backupDue(prefs, getLastBackup())) return
      try {
        const name = createSnapshot(d, prefs)
        if (canDownload && prefs.descargarWeb) downloadText(name, JSON.stringify(makeBackupFile(d), null, 1))
      } catch {
        // sin espacio o almacenamiento bloqueado: se reintenta en el próximo chequeo
      }
    }
    check()
    const timer = setInterval(check, 60_000)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [data])
}
