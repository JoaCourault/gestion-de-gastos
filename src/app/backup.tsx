import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'

import { Button, ChipSelect, Field, IconButton, Input, Panel, Row, Screen, SectionTitle, Stepper, SwitchRow, Txt } from '@/components/ui'
import { createSnapshot } from '@/lib/backup'
import { canDownload, deleteSnapshot, listSnapshots, pickBackupText, readSnapshot, scheduleReminder, shareSnapshot, type Snapshot } from '@/lib/backupFiles'
import { fmtDateTime } from '@/lib/dates'
import { attempt, confirm, notify } from '@/lib/dialog'
import { getBackupPrefs, getLastBackup, setBackupPrefs, type BackupPrefs } from '@/lib/prefs'
import { parseBackupFile, type BackupFile } from '@/lib/repo'
import { useStore } from '@/lib/store'
import { space, useTheme } from '@/lib/theme'

const HORAS = ['20:00', '21:00', '22:00', '23:00']

function safeList(): Snapshot[] {
  try {
    return listSnapshots()
  } catch {
    return []
  }
}
const isWeb = Platform.OS === 'web'

export default function Backup() {
  const t = useTheme()
  const { data, offline, restore } = useStore()
  const { compartir } = useLocalSearchParams<{ compartir?: string }>()
  const [prefs, setPrefs] = useState<BackupPrefs>(getBackupPrefs)
  const [hora, setHora] = useState(prefs.hora)
  const [snaps, setSnaps] = useState<Snapshot[]>(safeList)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(getLastBackup())
  const shared = useRef(false)

  const refresh = useCallback(() => {
    setSnaps(safeList())
    setLast(getLastBackup())
  }, [])

  const updatePrefs = async (p: BackupPrefs) => {
    setPrefs(p)
    setBackupPrefs(p)
    const ok = await scheduleReminder(p).catch(() => false)
    if (!ok && p.activo) notify('Notificaciones desactivadas', 'Habilitá las notificaciones de la app para recibir el recordatorio diario.')
  }

  const exportNow = useCallback(async () => {
    if (!data || offline) return notify('Sin conexión', 'Conectate para exportar los datos actualizados.')
    setBusy(true)
    await attempt(async () => {
      const name = createSnapshot(data, getBackupPrefs())
      refresh()
      await shareSnapshot(name)
    }, 'No se pudo exportar')
    setBusy(false)
  }, [data, offline, refresh])

  // Llegada desde la notificación diaria: guardar y abrir "Compartir" directamente.
  useEffect(() => {
    if (compartir && !shared.current && data) {
      shared.current = true
      exportNow()
    }
  }, [compartir, data, exportNow])

  const doRestore = async (file: BackupFile, origen: string) => {
    const d = file.data
    const ok = await confirm(
      'Restaurar backup',
      `${origen}\nCopia del ${fmtDateTime(file.exportedAt)}: ${d.cards.length} tarjetas, ${d.card_expenses.length} consumos, ${d.expenses.length} gastos.\n\nSe REEMPLAZAN todos los datos actuales (antes se guarda una copia de seguridad en este dispositivo).`,
      'Restaurar',
      true,
    )
    if (!ok) return
    setBusy(true)
    const done = await attempt(async () => {
      if (data && !offline) createSnapshot(data, getBackupPrefs())
      await restore(d)
    }, 'No se pudo restaurar')
    setBusy(false)
    refresh()
    if (done) notify('Listo', 'Los datos se restauraron correctamente.')
  }

  const fromFile = async () => {
    let text: string | null
    try {
      text = await pickBackupText()
    } catch (e) {
      console.error('[Restaurar] no se pudo leer el archivo', e)
      return notify('No se pudo leer el archivo', (e as Error).message)
    }
    if (!text) return
    try {
      await doRestore(parseBackupFile(text), 'Desde archivo.')
    } catch (e) {
      console.error('[Restaurar] archivo inválido', e)
      notify('Archivo inválido', (e as Error).message)
    }
  }

  const fromSnapshot = async (s: Snapshot) => {
    try {
      await doRestore(parseBackupFile(await readSnapshot(s.name)), 'Copia del dispositivo.')
    } catch (e) {
      console.error('[Restaurar] copia ilegible', e)
      notify('No se pudo leer la copia', (e as Error).message)
    }
  }

  const removeSnapshot = async (s: Snapshot) => {
    if (!(await confirm('Eliminar copia', s.name, 'Eliminar', true))) return
    deleteSnapshot(s.name)
    refresh()
  }

  const horaValida = /^([01]\d|2[0-3]):[0-5]\d$/.test(hora)

  return (
    <Screen>
      <Panel style={{ gap: space.sm }}>
        <Txt v="h2">Copia manual</Txt>
        <Txt muted>
          {isWeb
            ? 'Descarga un archivo .json con todos tus datos. Subilo a Google Drive o guardalo en la carpeta de Drive para escritorio.'
            : 'Guarda un archivo .json con todos tus datos y abre el menú Compartir: elegí Drive para subirlo.'}
        </Txt>
        <Txt v="small" muted>
          Última copia: {last ? fmtDateTime(last) : 'nunca'}
        </Txt>
        <Button title={isWeb ? 'Descargar copia' : 'Guardar y compartir a Drive'} icon="cloud-upload-outline" onPress={exportNow} loading={busy} />
      </Panel>

      <SectionTitle>Copia automática diaria</SectionTitle>
      <Panel>
        <SwitchRow
          label="Activada"
          value={prefs.activo}
          onChange={(v) => updatePrefs({ ...prefs, activo: v })}
          hint={
            isWeb
              ? 'Se guarda una copia en este navegador a la hora elegida (o al abrir la app si estaba cerrada).'
              : 'A la hora elegida te llega una notificación: tocala y mandá la copia a Drive. Además se guarda una copia en el celular al abrir la app.'
          }
        />
        {prefs.activo && (
          <>
            <Field label="Hora" error={horaValida ? null : 'Formato HH:MM (ej. 22:00)'}>
              <Row style={{ flexWrap: 'wrap' }}>
                <Input
                  value={hora}
                  onChangeText={setHora}
                  onBlur={() => horaValida && updatePrefs({ ...prefs, hora })}
                  maxLength={5}
                  style={{ width: 96, textAlign: 'center' }}
                  invalid={!horaValida}
                />
                <ChipSelect
                  options={HORAS.map((h) => ({ value: h, label: h }))}
                  value={prefs.hora}
                  onChange={(h) => {
                    setHora(h)
                    updatePrefs({ ...prefs, hora: h })
                  }}
                />
              </Row>
            </Field>
            <Field label="Copias a conservar en el dispositivo">
              <Stepper value={prefs.conservar} onChange={(n) => updatePrefs({ ...prefs, conservar: n })} min={1} max={60} />
            </Field>
            {canDownload && (
              <SwitchRow
                label="Además descargar el archivo"
                hint="Útil si la carpeta de descargas se sincroniza con Drive."
                value={prefs.descargarWeb}
                onChange={(v) => updatePrefs({ ...prefs, descargarWeb: v })}
              />
            )}
          </>
        )}
      </Panel>

      <SectionTitle>Restaurar</SectionTitle>
      <Panel style={{ gap: space.sm }}>
        <Txt muted>Elegí un archivo de backup (por ejemplo, descargado de Drive). Reemplaza todos los datos actuales.</Txt>
        <Button title="Restaurar desde archivo" variant="secondary" icon="folder-open-outline" onPress={fromFile} disabled={busy} />
      </Panel>

      <SectionTitle>Copias en este dispositivo</SectionTitle>
      <Panel style={{ padding: 0 }}>
        {snaps.length === 0 && (
          <Txt muted style={{ padding: space.lg }}>
            Todavía no hay copias.
          </Txt>
        )}
        {snaps.map((s) => (
          <Row key={s.name} style={{ paddingVertical: 8, paddingHorizontal: space.md, borderTopWidth: 0.5, borderColor: t.border }}>
            <View style={{ flex: 1 }}>
              <Txt>{s.date ? fmtDateTime(s.date) : s.name}</Txt>
              <Txt v="small" muted>
                {(s.size / 1024).toFixed(0)} KB
              </Txt>
            </View>
            <IconButton icon={isWeb ? 'download-outline' : 'share-outline'} label="Compartir" onPress={() => attempt(() => shareSnapshot(s.name), 'No se pudo compartir')} />
            <IconButton icon="refresh-circle-outline" label="Restaurar" onPress={() => fromSnapshot(s)} />
            <IconButton icon="trash-outline" label="Eliminar" color={t.danger} onPress={() => removeSnapshot(s)} />
          </Row>
        ))}
      </Panel>
    </Screen>
  )
}
