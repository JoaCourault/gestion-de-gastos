// Archivos de backup en Android/iOS. La variante web está en backupFiles.web.ts (misma interfaz).

import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useEffect } from 'react'

import type { BackupPrefs } from './prefs'

export interface Snapshot {
  name: string
  /** ISO de creación (sale del nombre del archivo) */
  date: string
  size: number
}

const dir = () => {
  const d = new Directory(Paths.document, 'backups')
  d.create({ intermediates: true, idempotent: true })
  return d
}

export function writeSnapshot(name: string, text: string) {
  const f = new File(dir(), name)
  if (!f.exists) f.create()
  f.write(text)
}

export function listSnapshots(): Snapshot[] {
  return dir()
    .list()
    .filter((x): x is File => x instanceof File && x.name.endsWith('.json'))
    .map((f) => ({ name: f.name, date: dateFromName(f.name), size: f.size ?? 0 }))
    .sort((a, b) => b.name.localeCompare(a.name))
}

export const readSnapshot = (name: string) => new File(dir(), name).text()
export const deleteSnapshot = (name: string) => new File(dir(), name).delete()

/** Abre el menú "Compartir" del sistema (Drive, mail, WhatsApp…). */
export async function shareSnapshot(name: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartir no está disponible en este dispositivo.')
  await Sharing.shareAsync(new File(dir(), name).uri, { mimeType: 'application/json', dialogTitle: 'Guardar backup', UTI: 'public.json' })
}

/** Elige un archivo .json y devuelve su contenido (null si se canceló). */
export async function pickBackupText(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true })
  if (res.canceled || !res.assets?.[0]) return null
  return new File(res.assets[0].uri).text()
}

export const canDownload = false
export function downloadText(_name: string, _text: string) {}

// ───────────── Recordatorio diario ─────────────

const CHANNEL = 'backup'

/** Programa (o cancela) la notificación diaria a la hora elegida. */
export async function scheduleReminder(prefs: BackupPrefs): Promise<boolean> {
  await Notifications.cancelAllScheduledNotificationsAsync()
  if (!prefs.activo) return true
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Backup diario',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
  let { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted') return false
  const [hour, minute] = prefs.hora.split(':').map(Number)
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Backup de gastos',
      body: 'Tocá para guardar la copia del día en Drive.',
      data: { url: '/backup?compartir=1' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL },
  })
  return true
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/** Al tocar la notificación, abrir la pantalla de backup lista para compartir. */
export function useBackupNotificationTap() {
  useEffect(() => {
    const go = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url
      if (typeof url === 'string') router.push(url as never)
    }
    const last = Notifications.getLastNotificationResponse()
    if (last?.notification) go(last.notification)
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification))
    return () => sub.remove()
  }, [])
}

// 'gastos-2026-10-14-2200.json' → '2026-10-14T22:00'
export function dateFromName(name: string) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})/)
  return m ? `${m[1]}T${m[2]}:${m[3]}` : ''
}
