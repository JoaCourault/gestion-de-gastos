import { Alert, Platform } from 'react-native'

// Alert.alert no hace nada en web: acá se unifican avisos y confirmaciones.

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title)
  else Alert.alert(title, message)
}

export function confirm(title: string, message: string, okLabel = 'Aceptar', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`))
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  )
}

/** Ejecuta una acción mostrando el error (si lo hay) en un aviso. Devuelve true si salió bien. */
export async function attempt(fn: () => Promise<unknown>, errorTitle = 'No se pudo guardar'): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (e) {
    console.error(`[${errorTitle}]`, e)
    notify(errorTitle, (e as Error).message)
    return false
  }
}
