import { useState } from 'react'
import { View } from 'react-native'

import { TypeSheet } from '@/components/TypeSheet'
import { Badge, Empty, Fab, ListItem, Panel, Screen, SectionTitle } from '@/components/ui'
import { useData } from '@/lib/store'
import type { ExpenseType } from '@/lib/types'

export default function Tipos() {
  const data = useData()
  const [editing, setEditing] = useState<ExpenseType | null>(null)
  const [open, setOpen] = useState(false)

  const grupos = new Map<string, ExpenseType[]>()
  for (const t of data.types) grupos.set(t.grupo || 'Sin grupo', [...(grupos.get(t.grupo || 'Sin grupo') ?? []), t])
  const usos = new Map<string, number>()
  for (const e of data.expenses) usos.set(e.typeId, (usos.get(e.typeId) ?? 0) + 1)

  const edit = (t: ExpenseType | null) => {
    setEditing(t)
    setOpen(true)
  }

  return (
    <Screen fab={<Fab label="Tipo" onPress={() => edit(null)} />}>
      {data.types.length === 0 && <Empty icon="pricetags-outline" title="Sin tipos de gasto" text="Creá tipos como Súper, Verdulería o Uber." />}
      {[...grupos.entries()].map(([g, tipos]) => (
        <Panel key={g} style={{ padding: 0, marginBottom: 12 }}>
          <View style={{ paddingHorizontal: 12 }}>
            <SectionTitle>{g}</SectionTitle>
          </View>
          {tipos.map((t) => (
            <ListItem
              key={t.id}
              title={t.nombre}
              subtitle={`${usos.get(t.id) ?? 0} gastos`}
              right={<Badge label={t.clasePorDefecto === 'necesario' ? 'Necesario' : 'Innecesario'} tone={t.clasePorDefecto === 'necesario' ? 'primary' : 'warn'} />}
              onPress={() => edit(t)}
            />
          ))}
        </Panel>
      ))}
      {open && <TypeSheet editing={editing} onClose={() => setOpen(false)} />}
    </Screen>
  )
}
