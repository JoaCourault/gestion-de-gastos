import Ionicons from '@expo/vector-icons/Ionicons'
import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Button, Field, Input, Panel, Segmented, Txt } from '@/components/ui'
import { signIn, signUp } from '@/lib/auth'
import { space, useTheme } from '@/lib/theme'

function Centered({ children }: { children: ReactNode }) {
  const t = useTheme()
  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.lg }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={space.xl}
    >
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: space.lg }}>{children}</View>
    </KeyboardAwareScrollView>
  )
}

function Brand() {
  const t = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: space.sm }}>
      <View
        style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="card" size={34} color={t.onPrimary} />
      </View>
      <Txt v="title">Gestor de Gastos</Txt>
    </View>
  )
}

/** Login o registro (una sola vez por dispositivo: la sesión queda guardada). */
export function LoginScreen() {
  const t = useTheme()
  const [modo, setModo] = useState<'ingresar' | 'registrar'>('ingresar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const registrar = modo === 'registrar'
  const listo = !!email && !!password && (!registrar || !!nombre.trim())

  const submit = async () => {
    if (!listo) return
    setBusy(true)
    setError(null)
    setAviso(null)
    try {
      if (!registrar) await signIn(email, password)
      else if (!(await signUp(email, password, nombre))) {
        setAviso(`Te mandamos un email a ${email.trim()}. Confirmá la cuenta desde ese link y después ingresá.`)
        setModo('ingresar')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <Brand />
      <Panel>
        <View style={{ marginBottom: space.lg }}>
          <Segmented
            value={modo}
            onChange={(m) => {
              setModo(m)
              setError(null)
            }}
            options={[
              { value: 'ingresar', label: 'Ingresar' },
              { value: 'registrar', label: 'Crear cuenta' },
            ]}
          />
        </View>
        <Txt muted style={{ marginBottom: space.lg }}>
          {registrar
            ? 'Cada cuenta tiene sus propios datos. Si alguien te agrega con este email en un consumo compartido, lo vas a ver acá.'
            : 'Ingresá una sola vez en este dispositivo. La sesión queda guardada.'}
        </Txt>
        {aviso && (
          <Txt color={t.ok} style={{ marginBottom: space.lg, fontWeight: '600' }}>
            {aviso}
          </Txt>
        )}
        {registrar && (
          <Field label="Tu nombre" hint="Así te ven los demás en los consumos compartidos.">
            <Input value={nombre} onChangeText={setNombre} autoComplete="name" />
          </Field>
        )}
        <Field label="Email">
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
          />
        </Field>
        <Field label="Contraseña" error={error} hint={registrar ? 'Mínimo 6 caracteres.' : undefined}>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={registrar ? 'new-password' : 'password'}
            onSubmitEditing={submit}
          />
        </Field>
        <Button
          title={registrar ? 'Crear cuenta' : 'Ingresar'}
          icon={registrar ? 'person-add-outline' : 'log-in-outline'}
          onPress={submit}
          loading={busy}
          disabled={!listo}
        />
      </Panel>
    </Centered>
  )
}

/** Se muestra si falta configurar Supabase en .env.local. */
export function SetupScreen() {
  return (
    <Centered>
      <Brand />
      <Panel>
        <Txt v="h2" style={{ marginBottom: space.sm }}>
          Falta conectar Supabase
        </Txt>
        <Txt muted>
          Creá el archivo .env.local en la carpeta del proyecto con EXPO_PUBLIC_SUPABASE_URL y
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver README) y reiniciá con: npx expo start --clear
        </Txt>
      </Panel>
    </Centered>
  )
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Centered>
      <Brand />
      <Panel>
        <Txt v="h2" style={{ marginBottom: space.sm }}>
          No se pudieron cargar los datos
        </Txt>
        <Txt muted style={{ marginBottom: space.lg }}>
          {message}
        </Txt>
        <Button title="Reintentar" icon="refresh" onPress={onRetry} />
      </Panel>
    </Centered>
  )
}
