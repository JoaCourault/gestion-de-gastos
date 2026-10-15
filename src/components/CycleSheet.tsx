import { useState } from 'react'
import { View } from 'react-native'

import { DateField } from '@/components/DateField'
import { Sheet } from '@/components/Sheet'
import { Button, Chip, Field, Panel, Row, Txt } from '@/components/ui'
import { cycleOf } from '@/lib/calc'
import { addPeriods, fmtDate, parseISO, periodLong, toISO } from '@/lib/dates'
import { attempt, confirm, notify } from '@/lib/dialog'
import { useStore } from '@/lib/store'
import { space, useTheme } from '@/lib/theme'
import type { Card, ISODate, Period } from '@/lib/types'

const nextDay = (iso: ISODate) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + 1)
  return toISO(d)
}

/**
 * Carga las fechas reales de cierre y vencimiento de un resumen.
 * Se monta solo mientras está abierto.
 */
export function CycleSheet({ card, period, onClose }: { card: Card; period: Period; onClose: () => void }) {
  const t = useTheme()
  const { saveCycle, resetCycle } = useStore()
  const actual = cycleOf(card, period)
  const prev = cycleOf(card, addPeriods(period, -1))
  const next = cycleOf(card, addPeriods(period, 1))
  const [cierre, setCierre] = useState(actual.cierre)
  const [venc, setVenc] = useState(actual.vencimiento)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (venc < cierre) return notify('Fechas inválidas', 'El vencimiento no puede ser anterior al cierre.')
    if (cierre <= prev.cierre || cierre >= next.cierre) {
      const ok = await confirm(
        'Revisá la fecha',
        `El cierre ${fmtDate(cierre)} no queda entre el cierre anterior (${fmtDate(prev.cierre)}) y el siguiente (${fmtDate(next.cierre)}). ¿Guardar igual?`,
        'Guardar',
      )
      if (!ok) return
    }
    setBusy(true)
    const ok = await attempt(() => saveCycle(card.id, period, cierre, venc))
    setBusy(false)
    if (ok) onClose()
  }

  const reset = async () => {
    setBusy(true)
    const ok = await attempt(() => resetCycle(card.id, period))
    setBusy(false)
    if (ok) onClose()
  }

  const desde = nextDay(prev.cierre)

  return (
    <Sheet visible title={`${card.nombre} · resumen ${periodLong(period)}`} onClose={onClose}>
      <Txt v="small" muted style={{ marginBottom: space.md }}>
        Cierre anterior: {fmtDate(prev.cierre)}
        {prev.ajustado ? '' : ' (estimado)'}
      </Txt>
      <Field label="Fecha de cierre">
        <DateField value={cierre} onChange={setCierre} />
      </Field>
      <Field label="Fecha de vencimiento">
        <DateField value={venc} onChange={setVenc} />
      </Field>

      <Panel style={{ backgroundColor: t.primarySoft, borderColor: t.primary, marginBottom: space.lg }}>
        <Txt v="small">
          {cierre >= desde
            ? `Entran las compras del ${fmtDate(desde)} al ${fmtDate(cierre)}.`
            : `El cierre es anterior al cierre del resumen pasado (${fmtDate(prev.cierre)}).`}
        </Txt>
      </Panel>

      <Row style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
        <Chip
          label="Usar días habituales"
          icon="refresh"
          onPress={() => {
            const est = cycleOf({ ...card, ciclos: {} }, period)
            setCierre(est.cierre)
            setVenc(est.vencimiento)
          }}
        />
      </Row>
      <View style={{ gap: space.sm }}>
        <Button title="Guardar fechas" icon="checkmark" onPress={save} loading={busy} />
        {actual.ajustado && (
          <Button title="Quitar ajuste (volver a estimado)" variant="secondary" onPress={reset} disabled={busy} />
        )}
      </View>
    </Sheet>
  )
}
