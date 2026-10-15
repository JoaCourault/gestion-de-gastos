import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { CycleSheet } from '@/components/CycleSheet'
import { Badge, Button, Field, Input, Panel, Row, Screen, SectionTitle, Stepper, SwitchRow, Txt } from '@/components/ui'
import { cycleOf, firstPeriod, openPeriod } from '@/lib/calc'
import { addPeriods, fmtDate, periodShort, todayISO } from '@/lib/dates'
import { attempt, confirm, notify } from '@/lib/dialog'
import { newId } from '@/lib/repo'
import { useData, useStore } from '@/lib/store'
import { CARD_COLORS, space, useTheme } from '@/lib/theme'
import type { Card, Period } from '@/lib/types'

export default function TarjetaForm() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const data = useData()
  const { saveCard, deleteCard, saveCycles } = useStore()
  const existing = data.cards.find((c) => c.id === id)

  const [nombre, setNombre] = useState(existing?.nombre ?? '')
  const [color, setColor] = useState(existing?.color ?? CARD_COLORS[data.cards.length % CARD_COLORS.length])
  const [diaCierre, setDiaCierre] = useState(existing?.diaCierre ?? 25)
  const [diaVenc, setDiaVenc] = useState(existing?.diaVencimiento ?? 5)
  const [activa, setActiva] = useState(existing?.activa ?? true)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!nombre.trim()) return
    const card: Card = {
      id: existing?.id ?? newId(),
      nombre: nombre.trim(),
      color,
      diaCierre,
      diaVencimiento: diaVenc,
      activa,
      ciclos: existing?.ciclos ?? {},
    }
    setBusy(true)
    const ok = await attempt(async () => {
      // Si cambian los días habituales, se fijan las fechas de los resúmenes ya cerrados
      // para que las cuotas pasadas no se muevan de período.
      if (existing && (existing.diaCierre !== diaCierre || existing.diaVencimiento !== diaVenc)) {
        await saveCycles(existing.id, pastCycles(existing, data.cardExpenses.filter((e) => e.cardId === existing.id)))
      }
      await saveCard(card)
    })
    setBusy(false)
    if (!ok) return
    if (existing) router.back()
    else router.replace({ pathname: '/tarjetas/[id]', params: { id: card.id } })
  }

  const remove = async () => {
    if (!existing) return
    const usos = data.cardExpenses.filter((e) => e.cardId === existing.id).length
    if (usos > 0) {
      notify('No se puede eliminar', `${existing.nombre} tiene ${usos} consumos. Podés marcarla como inactiva para ocultarla.`)
      return
    }
    if (!(await confirm('Eliminar tarjeta', `¿Eliminar ${existing.nombre} y sus fechas de cierre?`, 'Eliminar', true))) return
    if (await attempt(() => deleteCard(existing.id), 'No se pudo eliminar')) router.back()
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? existing.nombre : 'Nueva tarjeta' }} />
      <Field label="Nombre">
        <Input value={nombre} onChangeText={setNombre} placeholder="Ej. VISA Galicia" />
      </Field>
      <Field label="Color">
        <Row style={{ flexWrap: 'wrap' }}>
          {CARD_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityLabel={`Color ${c}`}
              style={[styles.swatch, { backgroundColor: c }, c === color && styles.swatchSel]}
            />
          ))}
        </Row>
      </Field>
      <Row style={{ flexWrap: 'wrap', gap: space.xl }}>
        <Field label="Día de cierre habitual">
          <Stepper value={diaCierre} onChange={setDiaCierre} min={1} max={31} />
        </Field>
        <Field label="Día de vencimiento habitual">
          <Stepper value={diaVenc} onChange={setDiaVenc} min={1} max={31} />
        </Field>
      </Row>
      <Txt v="small" muted style={{ marginTop: -space.sm, marginBottom: space.lg }}>
        {diaVenc > diaCierre
          ? 'Vence el mismo mes en que cierra.'
          : 'Vence el mes siguiente al cierre (ej. cierra el 25/10 y vence el 5/11).'}{' '}
        Los períodos se nombran por el mes de cierre.
      </Txt>
      <SwitchRow label="Activa" hint="Las inactivas no aparecen en el resumen ni para cargar consumos." value={activa} onChange={setActiva} />

      <View style={{ gap: space.sm }}>
        <Button title={existing ? 'Guardar cambios' : 'Crear tarjeta'} icon="checkmark" onPress={save} loading={busy} disabled={!nombre.trim()} />
      </View>

      {existing && <Cycles card={existing} />}

      {existing && <Button title="Eliminar tarjeta" variant="danger" icon="trash-outline" onPress={remove} style={{ marginTop: space.xl }} />}
    </Screen>
  )
}

/** Fechas (estimadas o reales) de los resúmenes ya cerrados que tienen consumos. */
function pastCycles(card: Card, expenses: Data['cardExpenses']): Card['ciclos'] {
  const open = openPeriod(card, todayISO())
  const firsts = expenses.map((e) => firstPeriod(e, card))
  const out: Card['ciclos'] = {}
  if (!firsts.length) return out
  for (let p = firsts.sort()[0]; p < open; p = addPeriods(p, 1)) {
    if (!card.ciclos[p]) {
      const { cierre, vencimiento } = cycleOf(card, p)
      out[p] = { cierre, vencimiento }
    }
  }
  return out
}
type Data = ReturnType<typeof useData>

function Cycles({ card }: { card: Card }) {
  const t = useTheme()
  const open = openPeriod(card, todayISO())
  const [desde, setDesde] = useState(-3)
  const [editing, setEditing] = useState<Period | null>(null)

  const periods = Array.from({ length: 16 - desde }, (_, i) => addPeriods(open, desde + i))

  return (
    <View>
      <SectionTitle>Cierres y vencimientos</SectionTitle>
      <Txt v="small" muted style={{ marginBottom: space.sm }}>
        Tocá un período para cargar las fechas reales que figuran en el resumen.
      </Txt>
      <Panel style={{ padding: 0 }}>
        <Pressable onPress={() => setDesde((d) => d - 6)} style={styles.more}>
          <Txt v="small" color={t.primary} style={{ fontWeight: '700' }}>
            Ver períodos anteriores
          </Txt>
        </Pressable>
        {periods.map((p) => {
          const cy = cycleOf(card, p)
          const actual = p === open
          return (
            <Pressable
              key={p}
              onPress={() => setEditing(p)}
              style={({ pressed }) => [
                styles.cycle,
                { borderColor: t.border },
                actual && { backgroundColor: t.primarySoft },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Txt style={{ width: 64, fontWeight: actual ? '800' : '600' }}>{periodShort(p)}</Txt>
              <View style={{ flex: 1 }}>
                <Txt v="small">Cierre {fmtDate(cy.cierre)}</Txt>
                <Txt v="small" muted>
                  Vence {fmtDate(cy.vencimiento)}
                </Txt>
              </View>
              {cy.ajustado ? <Badge label="Real" tone="ok" /> : <Badge label="Estimado" />}
            </Pressable>
          )
        })}
      </Panel>

      {editing && <CycleSheet card={card} period={editing} onClose={() => setEditing(null)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchSel: { borderWidth: 3, borderColor: '#fff', outlineColor: '#000', outlineWidth: 2, outlineStyle: 'solid' },
  cycle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  more: { padding: space.md, alignItems: 'center' },
})
