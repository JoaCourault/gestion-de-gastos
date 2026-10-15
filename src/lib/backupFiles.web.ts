// Archivos de backup en el navegador: las copias automáticas se guardan en localStorage
// y el botón "Descargar" baja el .json (para subirlo a Drive o guardarlo en la carpeta de Drive para escritorio).

import type { BackupPrefs } from './prefs'

export interface Snapshot {
  name: string
  date: string
  size: number
}

const INDEX = 'backups:index'
const key = (name: string) => `backups:file:${name}`

function index(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? '[]')
  } catch {
    return []
  }
}
const saveIndex = (names: string[]) => localStorage.setItem(INDEX, JSON.stringify(names))

export function writeSnapshot(name: string, text: string) {
  localStorage.setItem(key(name), text)
  saveIndex([...new Set([name, ...index()])])
}

export function listSnapshots(): Snapshot[] {
  return index()
    .map((name) => ({ name, date: dateFromName(name), size: localStorage.getItem(key(name))?.length ?? 0 }))
    .filter((s) => s.size > 0)
    .sort((a, b) => b.name.localeCompare(a.name))
}

export async function readSnapshot(name: string) {
  const text = localStorage.getItem(key(name))
  if (text === null) throw new Error('La copia ya no existe.')
  return text
}

export function deleteSnapshot(name: string) {
  localStorage.removeItem(key(name))
  saveIndex(index().filter((n) => n !== name))
}

export const canDownload = true
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function shareSnapshot(name: string) {
  downloadText(name, await readSnapshot(name))
}

export function pickBackupText(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // El input tiene que estar en el documento: si queda suelto, algunos navegadores lo
    // descartan antes de disparar 'change' y la selección del archivo se pierde en silencio.
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const f = input.files?.[0]
      input.remove()
      if (!f) return resolve(null)
      f.text().then(resolve, reject)
    })
    input.addEventListener('cancel', () => {
      input.remove()
      resolve(null)
    })
    input.click()
  })
}

// En web no hay notificaciones programadas: la copia se hace sola si la app está abierta (o al abrirla).
export async function scheduleReminder(_prefs: BackupPrefs) {
  return true
}
export function useBackupNotificationTap() {}

export function dateFromName(name: string) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})/)
  return m ? `${m[1]}T${m[2]}:${m[3]}` : ''
}
