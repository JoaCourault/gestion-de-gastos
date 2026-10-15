import { Pressable, StyleSheet, View } from 'react-native'

import { IconButton, Txt } from '@/components/ui'
import { addPeriods, periodLong } from '@/lib/dates'
import type { Period } from '@/lib/types'
import { radius, useTheme } from '@/lib/theme'

/** ‹ Octubre 2026 › — navegación entre meses/períodos. Tocar el centro vuelve al período "hoy". */
export function PeriodNav({
  value,
  onChange,
  today,
  caption,
}: {
  value: Period
  onChange: (p: Period) => void
  today?: Period
  caption?: string
}) {
  const t = useTheme()
  return (
    <View style={[styles.wrap, { backgroundColor: t.surface, borderColor: t.border }]}>
      <IconButton icon="chevron-back" label="Mes anterior" onPress={() => onChange(addPeriods(value, -1))} />
      <Pressable
        style={styles.center}
        onPress={() => today && onChange(today)}
        accessibilityRole="button"
        accessibilityLabel="Volver al período actual"
      >
        <Txt v="h2">{periodLong(value)}</Txt>
        {caption ? (
          <Txt v="small" muted>
            {caption}
          </Txt>
        ) : null}
      </Pressable>
      <IconButton icon="chevron-forward" label="Mes siguiente" onPress={() => onChange(addPeriods(value, 1))} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  center: { flex: 1, alignItems: 'center' },
})
