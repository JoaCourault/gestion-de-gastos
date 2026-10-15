import { createContext, Fragment, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

interface PortalApi {
  set: (key: string, node: ReactNode) => void
  remove: (key: string) => void
}

const PortalContext = createContext<PortalApi | null>(null)

/**
 * Dibuja los <Portal> por encima de toda la navegación, pero en la misma ventana.
 * (Un <Modal> nativo abre otra ventana en Android y ahí el manejo del teclado no es confiable.)
 */
export function PortalHost({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Map<string, ReactNode>>(() => new Map())
  const api = useMemo<PortalApi>(
    () => ({
      set: (key, node) => setNodes((m) => new Map(m).set(key, node)),
      remove: (key) =>
        setNodes((m) => {
          const next = new Map(m)
          next.delete(key)
          return next
        }),
    }),
    [],
  )
  return (
    <PortalContext.Provider value={api}>
      <View style={styles.fill}>
        {children}
        {[...nodes].map(([key, node]) => (
          <Fragment key={key}>{node}</Fragment>
        ))}
      </View>
    </PortalContext.Provider>
  )
}

/** Renderiza su contenido en el PortalHost más cercano (o en el lugar, si no hay host). */
export function Portal({ children }: { children: ReactNode }) {
  const api = useContext(PortalContext)
  const id = useId()

  useEffect(() => {
    api?.set(id, children)
  }, [api, id, children])

  useEffect(() => () => api?.remove(id), [api, id])

  return api ? null : <>{children}</>
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
