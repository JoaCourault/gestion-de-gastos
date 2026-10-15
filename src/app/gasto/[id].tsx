import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'

import { DateField } from '@/components/DateField'
import { TypeSheet } from '@/components/TypeSheet'
import { Button, Chip, Field, Input, Screen, Segmented, Txt } from '@/components/ui'
import { currentPeriod, todayISO } from '@/lib/dates'
import { attempt, confirm } from '@/lib/dialog'
import { parseMoney, toInput } from '@/lib/format'
import { newId } from '@/lib/repo'
import { useData, useStore } from '@/lib/store'
import { space } from '@/lib/theme'
import type { Clase, Expense } from '@/lib/types'

export default function GastoForm() {
  const { id, m } = useLocalSearchParams<{ id: string; m?: string }>()
  const data = useData()
  const { saveExpense, deleteExpense } = useStore()
  const existing = data.expenses.find((e) => e.id === id)
  const isNew = !existing

  // Si se carga desde otro mes, proponer una fecha dentro de ese mes.
  const defaultFecha = m && m !== currentPeriod() ? `${m}-01` : todayISO()

  const [fecha, setFecha] = useState(existing?.fecha ?? defaultFecha)
  const [typeId, setTypeId] = useState(existing?.typeId ?? '')
  const [clase, setClase] = useState<Clase>(existing?.clase ?? 'necesario')
  const [claseTocada, setClaseTocada] = useState(!!existing)
  const [detalle, setDetalle] = useState(existing?.detalle ?? '')
  const [montoStr, setMontoStr] = useState(toInput(existing?.monto))
  const [newType, setNewType] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  const monto = parseMoney(montoStr)
  const errors = {
    tipo: !typeId ? 'Elegí un tipo' : null,
    monto: !(monto > 0) ? 'Ingresá un monto válido' : null,
  }

  const pickType = (tid: string) => {
    setTypeId(tid)
    const tp = data.types.find((x) => x.id === tid)
    if (tp && !claseTocada) setClase(tp.clasePorDefecto)
  }

  // Tipos agrupados por grupo
  const grupos = new Map<string, typeof data.types>()
  for (const tp of data.types) grupos.set(tp.grupo || 'Otros', [...(grupos.get(tp.grupo || 'Otros') ?? []), tp])

  const save = async (otro: boolean) => {
    setTried(true)
    if (errors.tipo || errors.monto) return
    const e: Expense = { id: existing?.id ?? newId(), fecha, typeId, detalle: detalle.trim(), monto, clase }
    setBusy(true)
    const ok = await attempt(() => saveExpense(e))
    setBusy(false)
    if (!ok) return
    if (otro) {
      setDetalle('')
      setMontoStr('')
      setTried(false)
    } else router.back()
  }

  const remove = async () => {
    if (!existing) return
    if (!(await confirm('Eliminar gasto', '¿Eliminar este gasto?', 'Eliminar', true))) return
    if (await attempt(() => deleteExpense(existing.id), 'No se pudo eliminar')) router.back()
  }

  return (
    <Screen>
      <Field label="Monto" error={tried ? errors.monto : null}>
        <Input
          value={montoStr}
          onChangeText={setMontoStr}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0,00"
          autoFocus={isNew}
          style={{ fontSize: 22, fontWeight: '700' }}
          invalid={tried && !!errors.monto}
        />
      </Field>

      <Field label="Tipo" error={tried ? errors.tipo : null}>
        <View style={{ gap: space.md }}>
          {[...grupos.entries()].map(([g, tipos]) => (
            <View key={g} style={{ gap: 6 }}>
              <Txt v="small" muted>
                {g}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {tipos.map((tp) => (
                  <Chip key={tp.id} label={tp.nombre} selected={tp.id === typeId} onPress={() => pickType(tp.id)} />
                ))}
              </View>
            </View>
          ))}
          <Chip label="Nuevo tipo" icon="add" onPress={() => setNewType(true)} />
        </View>
      </Field>

      <Field label="Clase">
        <Segmented
          value={clase}
          onChange={(c) => {
            setClase(c)
            setClaseTocada(true)
          }}
          options={[
            { value: 'necesario', label: 'Necesario' },
            { value: 'innecesario', label: 'Innecesario' },
          ]}
        />
      </Field>

      <Field label="Detalle (opcional)">
        <Input value={detalle} onChangeText={setDetalle} placeholder="Ej. La Porca, yerba y papel…" />
      </Field>

      <Field label="Fecha">
        <DateField value={fecha} onChange={setFecha} />
      </Field>

      <View style={{ gap: space.sm }}>
        <Button title="Guardar" icon="checkmark" onPress={() => save(false)} loading={busy} />
        {isNew && <Button title="Guardar y cargar otro" variant="secondary" onPress={() => save(true)} disabled={busy} />}
        {!isNew && <Button title="Eliminar" variant="danger" icon="trash-outline" onPress={remove} />}
      </View>

      {newType && (
        <TypeSheet
          onClose={() => setNewType(false)}
          onSaved={(tp) => {
            setTypeId(tp.id)
            if (!claseTocada) setClase(tp.clasePorDefecto)
          }}
        />
      )}
    </Screen>
  )
}
