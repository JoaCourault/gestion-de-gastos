import './storage'

// Preferencias del dispositivo (no se sincronizan): cada equipo decide su propio backup.

export interface BackupPrefs {
  activo: boolean
  /** 'HH:MM' */
  hora: string
  /** copias locales a conservar */
  conservar: number
  /** web: además de guardar la copia interna, descargar el archivo */
  descargarWeb: boolean
}

const DEFAULTS: BackupPrefs = { activo: true, hora: '22:00', conservar: 14, descargarWeb: false }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // almacenamiento lleno o bloqueado: la preferencia no se guarda pero la app sigue
  }
}

export const getBackupPrefs = () => read('prefs:backup', DEFAULTS)
export const setBackupPrefs = (p: BackupPrefs) => write('prefs:backup', p)

export const getLastBackup = () => read<{ at: string | null }>('prefs:lastBackup', { at: null }).at
export const setLastBackup = (at: string) => write('prefs:lastBackup', { at })

export function getRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function setRaw(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // ignorado: ver write()
  }
}
