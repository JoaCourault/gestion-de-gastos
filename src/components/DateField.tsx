import Ionicons from '@expo/vector-icons/Ionicons'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/ui'
import { fmtDate, parseISO, toISO } from '@/lib/dates'
import type { ISODate } from '@/lib/types'
import { radius, space, useTheme } from '@/lib/theme'

/** Selector de fecha nativo (Android: diálogo del sistema; iOS: calendario en un modal). */
export function DateField({ value, onChange }: { value: ISODate; onChange: (d: ISODate) => void }) {
  const t = useTheme()
  const [iosOpen, setIosOpen] = useState(false)
  const [draft, setDraft] = useState(parseISO(value))

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseISO(value),
        mode: 'date',
        onChange: (event, d) => event.type === 'set' && d && onChange(toISO(d)),
      })
    } else {
      setDraft(parseISO(value))
      setIosOpen(true)
    }
  }

  return (
    <>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        style={[styles.box, { borderColor: t.border, backgroundColor: t.surface }]}
      >
        <Ionicons name="calendar-outline" size={18} color={t.muted} />
        <Text style={{ color: t.text, fontSize: 16 }}>{fmtDate(value)}</Text>
      </Pressable>
      {Platform.OS === 'ios' && (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <View style={styles.backdrop}>
            <View style={[styles.sheet, { backgroundColor: t.surface }]}>
              <DateTimePicker value={draft} mode="date" display="inline" onChange={(_, d) => d && setDraft(d)} />
              <Button
                title="Listo"
                onPress={() => {
                  onChange(toISO(draft))
                  setIosOpen(false)
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: space.lg },
  sheet: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
})
