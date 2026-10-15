import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'

import { ErrorScreen, LoginScreen, SetupScreen } from '@/components/Gate'
import { Loading } from '@/components/ui'
import { AuthProvider, useAuth } from '@/lib/auth'
import { useAutoBackup, useBackupNotificationTap } from '@/lib/backup'
import { DataProvider, useStore } from '@/lib/store'
import { supabaseConfigured } from '@/lib/supabase'
import { useIsDark, useTheme } from '@/lib/theme'

SplashScreen.preventAutoHideAsync()

function AppStack() {
  const t = useTheme()
  const { status, error, reload } = useStore()
  useAutoBackup()
  useBackupNotificationTap()

  if (status === 'loading') return <Loading text="Cargando datos…" />
  if (status === 'error') return <ErrorScreen message={error ?? ''} onRetry={reload} />

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: t.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="consumo/[id]" options={{ title: 'Consumo con tarjeta', presentation: 'modal' }} />
      <Stack.Screen name="gasto/[id]" options={{ title: 'Gasto', presentation: 'modal' }} />
      <Stack.Screen name="tarjetas/index" options={{ title: 'Tarjetas' }} />
      <Stack.Screen name="tarjetas/[id]" options={{ title: 'Tarjeta' }} />
      <Stack.Screen name="tipos" options={{ title: 'Tipos de gasto' }} />
      <Stack.Screen name="personas" options={{ title: 'Personas' }} />
      <Stack.Screen name="configuracion" options={{ title: 'Cotización y presupuestos' }} />
      <Stack.Screen name="backup" options={{ title: 'Backup y restauración' }} />
    </Stack>
  )
}

function Root() {
  const { session, loading } = useAuth()

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync()
  }, [loading])

  if (!supabaseConfigured) return <SetupScreen />
  if (loading) return <Loading />
  if (!session) return <LoginScreen />
  return (
    // key: al cambiar de usuario se descarta el estado anterior
    <DataProvider key={session.user.id}>
      <AppStack />
    </DataProvider>
  )
}

export default function RootLayout() {
  const t = useTheme()
  const dark = useIsDark()
  const base = dark ? DarkTheme : DefaultTheme
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, primary: t.primary, background: t.bg, card: t.surface, text: t.text, border: t.border },
      }}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ThemeProvider>
  )
}
