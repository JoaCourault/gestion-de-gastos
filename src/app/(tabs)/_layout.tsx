import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'

import { OfflineBanner } from '@/components/OfflineBanner'
import { useTheme } from '@/lib/theme'

export default function TabsLayout() {
  const t = useTheme()
  return (
    <>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: t.primary,
          tabBarInactiveTintColor: t.muted,
          tabBarLabelStyle: { fontSize: 12, lineHeight: 16 },
          // Con el teclado abierto la barra de pestañas ocupa espacio útil: se oculta.
          tabBarHideOnKeyboard: true,
          tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
          headerStyle: { backgroundColor: t.surface },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: '700' },
          sceneStyle: { backgroundColor: t.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Resumen', tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="consumos" options={{ title: 'Tarjetas', tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="gastos" options={{ title: 'Gastos', tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} /> }} />
      </Tabs>
    </>
  )
}
