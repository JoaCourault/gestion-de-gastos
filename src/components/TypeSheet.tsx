import { useState } from 'react'
import { View } from 'react-native'

import { Sheet } from '@/components/Sheet'
import { Button, Chip, Field, Input, Segmented } from '@/components/ui'
import { attempt, confirm } from '@/lib/dialog'
import { newId } from '@/lib/repo'
import { useData, useStore } from '@/lib/store'
import { space } from '@/lib/theme'
import type { Clase, ExpenseType } from '@/lib/types'

/** Alta / edición de un tipo de gasto. Se monta solo mientras está abierto. */
export function TypeSheet({
  onClose,
  editing,
  onSaved,
}: {
  onClose: () => void
  editing?: ExpenseType | null
  onSaved?: (t: ExpenseType) => void
}) {
  const data = useData()
  const { saveType, deleteType } = useStore()
  const [nombre, setNombre] = useState(editing?.nombre ?? '')
  const [grupo, setGrupo] = useState(editing?.grupo ?? '')
  const [clase, setClase] = useState<Clase>(editing?.clasePorDefecto ?? 'necesario')
  const [busy, setBusy] = useState(false)

  const grupos = [...new Set(data.types.map((t) => t.grupo).filter(Boolean))].sort()

  const save = async () => {
    if (!nombre.trim()) return
    const t: ExpenseType = { id: editing?.id ?? newId(), nombre: nombre.trim(), grupo: grupo.trim(), clasePorDefecto: clase }
    setBusy(true)
    const ok = await attempt(() => saveType(t))
    setBusy(false)
    if (ok) {
      onSaved?.(t)
      onClose()
    }
  }

  const remove = async () => {
    if (!editing) return
    if (!(await confirm('Eliminar tipo', `¿Eliminar "${editing.nombre}"? Solo se puede si ningún gasto lo usa.`, 'Eliminar', true))) return
    if (await attempt(() => deleteType(editing.id), 'No se pudo eliminar')) onClose()
  }

  return (
    <Sheet visible title={editing ? 'Editar tipo' : 'Nuevo tipo de gasto'} onClose={onClose}>
      <Field label="Nombre">
        <Input value={nombre} onChangeText={setNombre} placeholder="Ej. Verdulería" autoFocus />
      </Field>
      <Field label="Grupo" hint="Para ver totales agrupados (ej. Víveres, Viajes). Elegí uno o escribí uno nuevo.">
        <Input value={grupo} onChangeText={setGrupo} placeholder="Ej. Víveres" />
        {grupos.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            {grupos.map((g) => (
              <Chip key={g} label={g} selected={g === grupo} onPress={() => setGrupo(g)} />
            ))}
          </View>
        )}
      </Field>
      <Field label="Clase por defecto">
        <Segmented
          value={clase}
          onChange={setClase}
          options={[
            { value: 'necesario', label: 'Necesario' },
            { value: 'innecesario', label: 'Innecesario' },
          ]}
        />
      </Field>
      <View style={{ gap: space.sm }}>
        <Button title="Guardar" icon="checkmark" onPress={save} loading={busy} disabled={!nombre.trim()} />
        {editing && <Button title="Eliminar" variant="danger" icon="trash-outline" onPress={remove} />}
      </View>
    </Sheet>
  )
}
