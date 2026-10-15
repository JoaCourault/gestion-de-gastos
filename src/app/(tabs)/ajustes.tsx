import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useState } from 'react'

import { Button, Field, Input, ListItem, Panel, Screen, SectionTitle, Txt } from '@/components/ui'
import { useAuth, signOut } from '@/lib/auth'
import { fmtDateTime } from '@/lib/dates'
import { attempt, confirm } from '@/lib/dialog'
import { fmtMoney } from '@/lib/format'
import { getLastBackup } from '@/lib/prefs'
import { useData, useStore } from '@/lib/store'
import { space } from '@/lib/theme'

export default function Ajustes() {
  const data = useData()
  const { session } = useAuth()
  const last = getLastBackup()
  const { saveProfile } = useStore()
  const [nombre, setNombre] = useState(data.profile.nombre)
  const [busy, setBusy] = useState(false)
  const saveNombre = async () => {
    setBusy(true)
    await attempt(() => saveProfile(nombre.trim()))
    setBusy(false)
  }

  const logout = async () => {
    if (await confirm('Cerrar sesión', 'Vas a tener que volver a ingresar en este dispositivo.', 'Cerrar sesión', true)) signOut()
  }

  return (
    <Screen>
      <SectionTitle>Configuración</SectionTitle>
      <Panel style={{ padding: 0 }}>
        <ListItem
          icon="card-outline"
          title="Tarjetas y cierres"
          subtitle={`${data.cards.length} tarjetas · fechas de cierre y vencimiento`}
          onPress={() => router.push('/tarjetas')}
        />
        <ListItem
          icon="pricetags-outline"
          title="Tipos de gasto"
          subtitle={`${data.types.length} tipos`}
          onPress={() => router.push('/tipos')}
        />
        <ListItem
          icon="people-outline"
          title="Personas"
          subtitle="Quienes usan tus tarjetas"
          onPress={() => router.push('/personas')}
        />
        <ListItem
          icon="cash-outline"
          title="Cotización y presupuestos"
          subtitle={`Dólar ${fmtMoney(data.settings.cotizacionUSD)}`}
          onPress={() => router.push('/configuracion')}
        />
      </Panel>

      <SectionTitle>Datos</SectionTitle>
      <Panel style={{ padding: 0 }}>
        <ListItem
          icon="cloud-upload-outline"
          title="Backup y restauración"
          subtitle={last ? `Última copia: ${fmtDateTime(last)}` : 'Todavía no hay copias'}
          onPress={() => router.push('/backup')}
        />
      </Panel>

      <SectionTitle>Cuenta</SectionTitle>
      <Panel>
        <Txt muted style={{ marginBottom: space.md }}>
          Sesión iniciada como {session?.user.email}
        </Txt>
        <Field label="Tu nombre" hint="Así te ven los usuarios con los que compartís consumos.">
          <Input value={nombre} onChangeText={setNombre} onSubmitEditing={saveNombre} />
        </Field>
        {nombre.trim() !== data.profile.nombre && (
          <Button title="Guardar nombre" icon="checkmark" onPress={saveNombre} loading={busy} style={{ marginBottom: space.md }} />
        )}
        <Button title="Cerrar sesión" variant="secondary" icon="log-out-outline" onPress={logout} />
      </Panel>
      <Txt v="small" muted style={{ textAlign: 'center', marginTop: space.xl }}>
        Versión {Constants.expoConfig?.version ?? '?'}
      </Txt>
    </Screen>
  )
}
