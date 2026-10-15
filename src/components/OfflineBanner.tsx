import { Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Txt } from '@/components/ui'
import { useStore } from '@/lib/store'
import { useTheme } from '@/lib/theme'

/** Aviso cuando se muestran datos guardados en el dispositivo por falta de conexión. */
export function OfflineBanner() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { offline, reload } = useStore()
  if (!offline) return null
  return (
    <Pressable
      onPress={reload}
      style={{ backgroundColor: t.warnSoft, paddingTop: insets.top + 6, paddingBottom: 6, paddingHorizontal: 16 }}
    >
      <Txt v="small" color={t.warn} style={{ textAlign: 'center', fontWeight: '700' }}>
        Sin conexión: mostrando la última copia del dispositivo. Los cambios no se pueden guardar. Tocá para reintentar.
      </Txt>
    </Pressable>
  )
}
