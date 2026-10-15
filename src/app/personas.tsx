import { useState } from 'react'
import { View } from 'react-native'

import { Sheet } from '@/components/Sheet'
import { Button, Empty, Fab, Field, Input, ListItem, Panel, Screen, Txt } from '@/components/ui'
import { sharesOf } from '@/lib/calc'
import { attempt, confirm, notify } from '@/lib/dialog'
import { newId } from '@/lib/repo'
import { useData, useStore } from '@/lib/store'
import { space } from '@/lib/theme'
import type { Person } from '@/lib/types'

export default function Personas() {
  const data = useData()
  const { savePerson, deletePerson } = useStore()
  const [editing, setEditing] = useState<Person | null>(null)
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const usos = new Map<string, number>()
  for (const e of data.cardExpenses) for (const s of sharesOf(e)) usos.set(s.personId, (usos.get(s.personId) ?? 0) + 1)

  const edit = (p: Person | null) => {
    setEditing(p)
    setNombre(p?.nombre ?? '')
    setEmail(p?.email ?? '')
    setOpen(true)
  }

  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const save = async () => {
    if (!nombre.trim() || !emailOk) return
    setBusy(true)
    const ok = await attempt(() =>
      savePerson({ id: editing?.id ?? newId(), nombre: nombre.trim(), email: email.trim().toLowerCase() || undefined }),
    )
    setBusy(false)
    if (ok) setOpen(false)
  }

  const remove = async () => {
    if (!editing) return
    const n = usos.get(editing.id) ?? 0
    if (n > 0) return notify('No se puede eliminar', `${editing.nombre} participa en ${n} consumos.`)
    if (!(await confirm('Eliminar persona', `¿Eliminar a ${editing.nombre}? Solo se puede si no tiene consumos.`, 'Eliminar', true))) return
    if (await attempt(() => deletePerson(editing.id), 'No se pudo eliminar')) setOpen(false)
  }

  return (
    <Screen fab={<Fab label="Persona" onPress={() => edit(null)} />}>
      <Txt muted style={{ marginBottom: space.md }}>
        Personas que usan tus tarjetas o comparten consumos con vos. Sus partes se suman aparte como «de otros». Si les
        cargás el email y tienen cuenta en la app, ven los consumos donde participan.
      </Txt>
      {data.people.length === 0 ? (
        <Empty icon="people-outline" title="Sin personas" text="Agregá a quienes hacen compras con tus tarjetas." />
      ) : (
        <Panel style={{ padding: 0 }}>
          {data.people.map((p) => (
            <ListItem
              key={p.id}
              icon={p.email ? 'link-outline' : 'person-outline'}
              title={p.nombre}
              subtitle={`${usos.get(p.id) ?? 0} consumos${p.email ? ` · ${p.email}` : ''}`}
              onPress={() => edit(p)}
            />
          ))}
        </Panel>
      )}
      <Sheet visible={open} title={editing ? 'Editar persona' : 'Nueva persona'} onClose={() => setOpen(false)}>
        <Field label="Nombre">
          <Input value={nombre} onChangeText={setNombre} autoFocus />
        </Field>
        <Field
          label="Email (opcional)"
          error={emailOk ? null : 'Email inválido'}
          hint="Si se registra en la app con este email, va a ver (solo lectura) los consumos donde participa."
        >
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            inputMode="email"
            onSubmitEditing={save}
            invalid={!emailOk}
          />
        </Field>
        <View style={{ gap: space.sm }}>
          <Button title="Guardar" icon="checkmark" onPress={save} loading={busy} disabled={!nombre.trim() || !emailOk} />
          {editing && <Button title="Eliminar" variant="danger" icon="trash-outline" onPress={remove} />}
        </View>
      </Sheet>
    </Screen>
  )
}
