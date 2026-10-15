import { useEffect, type ReactNode } from 'react'
import { BackHandler, Pressable, StyleSheet, View } from 'react-native'
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Portal } from '@/components/Portal'
import { IconButton, Row, Txt } from '@/components/ui'
import { radius, space, useTheme } from '@/lib/theme'

/**
 * Panel para formularios cortos (abajo en celular, centrado en pantallas anchas).
 * Se dibuja en el PortalHost (misma ventana) para que el teclado lo empuje hacia arriba.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  // Botón "atrás" de Android: cierra el panel en lugar de salir de la pantalla.
  useEffect(() => {
    if (!visible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [visible, onClose])

  if (!visible) return null

  return (
    <Portal>
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={styles.overlay}>
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Cerrar" />
          <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: space.lg + insets.bottom }]}>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
              <Txt v="h2">{title}</Txt>
              <IconButton icon="close" label="Cerrar" onPress={onClose} />
            </Row>
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={space.lg}>
              {children}
            </KeyboardAwareScrollView>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Portal>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000 },
  avoider: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: space.lg,
  },
})
