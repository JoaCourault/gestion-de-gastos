import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps, ReactNode } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { MAX_WIDTH, radius, space, useTheme } from '@/lib/theme'

export type IconName = ComponentProps<typeof Ionicons>['name']

// ───────────── Layout ─────────────

/** Contenedor desplazable con ancho máximo centrado (se ve bien en celular y en escritorio). */
export function Screen({
  children,
  fab,
  scroll = true,
}: {
  children: ReactNode
  /** Botón flotante (se dibuja fuera del scroll) */
  fab?: ReactNode
  scroll?: boolean
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const inner = <View style={styles.inner}>{children}</View>
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: (fab ? 96 : 32) + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
      {fab}
    </View>
  )
}

export function Panel({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme()
  const base = [styles.panel, { backgroundColor: t.surface, borderColor: t.border }, style]
  if (!onPress) return <View style={base}>{children}</View>
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  )
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
}

/** Grilla que pasa de 1 a N columnas según el ancho disponible. */
export function Grid({ children, min = 300 }: { children: ReactNode; min?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {Array.isArray(children)
        ? children.map((c, i) => (
            <View key={i} style={{ flexGrow: 1, flexBasis: min, minWidth: 0 }}>
              {c}
            </View>
          ))
        : children}
    </View>
  )
}

// ───────────── Texto ─────────────

type TxtVariant = 'title' | 'h2' | 'body' | 'label' | 'small' | 'money' | 'moneyLg'
export function Txt({
  children,
  v = 'body',
  muted,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode
  v?: TxtVariant
  muted?: boolean
  color?: string
  style?: StyleProp<TextStyle>
  numberOfLines?: number
}) {
  const t = useTheme()
  return (
    <Text numberOfLines={numberOfLines} style={[txt[v], { color: color ?? (muted ? t.muted : t.text) }, style]}>
      {children}
    </Text>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm }}>
      <Txt v="label" muted>
        {children}
      </Txt>
      {right}
    </Row>
  )
}

// ───────────── Botones ─────────────

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  small,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
  small?: boolean
}) {
  const t = useTheme()
  const bg = { primary: t.primary, secondary: t.surfaceAlt, danger: t.dangerSoft, ghost: 'transparent' }[variant]
  const fg = { primary: t.onPrimary, secondary: t.text, danger: t.danger, ghost: t.primary }[variant]
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 18} color={fg} />}
          <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  )
}

export function IconButton({ icon, onPress, label, color }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: t.surfaceAlt }]}
    >
      <Ionicons name={icon} size={22} color={color ?? t.text} />
    </Pressable>
  )
}

export function Fab({ onPress, label = 'Agregar' }: { onPress: () => void; label?: string }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: t.primary, bottom: 20 + insets.bottom, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name="add" size={26} color={t.onPrimary} />
      <Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  )
}

// ───────────── Selección ─────────────

export function Chip({
  label,
  selected,
  onPress,
  color,
  icon,
}: {
  label: string
  selected?: boolean
  onPress?: () => void
  color?: string
  icon?: IconName
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? t.primarySoft : t.surface,
          borderColor: selected ? t.primary : t.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {color && <View style={[styles.dot, { backgroundColor: color }]} />}
      {icon && <Ionicons name={icon} size={15} color={selected ? t.primary : t.muted} />}
      <Text style={{ color: selected ? t.primary : t.text, fontWeight: selected ? '700' : '500', fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  )
}

export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { value: T; label: string; color?: string }[]
  value: T | null
  onChange: (v: T) => void
  /** una sola línea con scroll horizontal (para filtros) */
  scroll?: boolean
}) {
  const chips = options.map((o) => (
    <Chip key={o.value} label={o.label} color={o.color} selected={o.value === value} onPress={() => onChange(o.value)} />
  ))
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {chips}
      </ScrollView>
    )
  }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{chips}</View>
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const t = useTheme()
  return (
    <View style={[styles.segmented, { backgroundColor: t.surfaceAlt }]}>
      {options.map((o) => {
        const sel = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            style={[styles.segment, sel && { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <Text style={{ color: sel ? t.text : t.muted, fontWeight: sel ? '700' : '500', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ───────────── Formularios ─────────────

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  const t = useTheme()
  return (
    <View style={{ marginBottom: space.lg, gap: 6 }}>
      <Txt v="label" muted>
        {label}
      </Txt>
      {children}
      {error ? (
        <Txt v="small" color={t.danger}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt v="small" muted>
          {hint}
        </Txt>
      ) : null}
    </View>
  )
}

export function Input(props: TextInputProps & { invalid?: boolean }) {
  const t = useTheme()
  const { invalid, style, ...rest } = props
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...rest}
      style={[
        styles.input,
        { backgroundColor: t.surface, borderColor: invalid ? t.danger : t.border, color: t.text },
        Platform.OS === 'web' && { outlineColor: t.primary },
        style,
      ]}
    />
  )
}

export function SwitchRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const t = useTheme()
  return (
    <Pressable onPress={() => onChange(!value)} style={{ marginBottom: space.lg }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt>{label}</Txt>
          {hint && (
            <Txt v="small" muted>
              {hint}
            </Txt>
          )}
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.border }} thumbColor="#fff" />
      </Row>
    </Pressable>
  )
}

/** Número entero con botones − / +. */
export function Stepper({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const t = useTheme()
  return (
    <Row gap={0} style={[styles.stepper, { borderColor: t.border, backgroundColor: t.surface }]}>
      <IconButton icon="remove" label="Menos" onPress={() => onChange(Math.max(min, value - 1))} />
      <TextInput
        value={String(value)}
        keyboardType="number-pad"
        onChangeText={(s) => {
          const n = parseInt(s.replace(/\D/g, ''), 10)
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        style={{ width: 52, textAlign: 'center', fontSize: 17, fontWeight: '700', color: t.text, paddingVertical: 8 }}
      />
      <IconButton icon="add" label="Más" onPress={() => onChange(Math.min(max, value + 1))} />
    </Row>
  )
}

// ───────────── Datos ─────────────

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'primary' | 'warn' | 'danger' | 'ok' }) {
  const t = useTheme()
  const map = {
    neutral: [t.surfaceAlt, t.muted],
    primary: [t.primarySoft, t.primary],
    warn: [t.warnSoft, t.warn],
    danger: [t.dangerSoft, t.danger],
    ok: [t.okSoft, t.ok],
  } as const
  const [bg, fg] = map[tone]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  )
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const t = useTheme()
  const ratio = max > 0 ? value / max : value > 0 ? 1 : 0
  const color = ratio > 1 ? t.danger : ratio > 0.85 ? t.warn : t.primary
  return (
    <View style={[styles.progress, { backgroundColor: t.surfaceAlt }]}>
      <View style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: color, height: '100%', borderRadius: 99 }} />
    </View>
  )
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  const t = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: space.sm, paddingHorizontal: space.lg }}>
      <Ionicons name={icon} size={40} color={t.muted} />
      <Txt v="h2" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {text && (
        <Txt muted style={{ textAlign: 'center', maxWidth: 420 }}>
          {text}
        </Txt>
      )}
      {action}
    </View>
  )
}

/** Fila de lista tocable con ícono, texto y flecha. */
export function ListItem({
  icon,
  title,
  subtitle,
  right,
  onPress,
  color,
}: {
  icon?: IconName
  title: string
  subtitle?: string
  right?: ReactNode
  onPress?: () => void
  color?: string
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listItem, { borderColor: t.border }, pressed && { backgroundColor: t.surfaceAlt }]}
    >
      {color && <View style={[styles.colorBar, { backgroundColor: color }]} />}
      {icon && <Ionicons name={icon} size={20} color={t.primary} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt numberOfLines={1}>{title}</Txt>
        {subtitle && (
          <Txt v="small" muted numberOfLines={2}>
            {subtitle}
          </Txt>
        )}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={t.muted} />}
    </Pressable>
  )
}

export function Loading({ text }: { text?: string }) {
  const t = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: t.bg }}>
      <ActivityIndicator size="large" color={t.primary} />
      {text && <Txt muted>{text}</Txt>}
    </View>
  )
}

const txt = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800' },
  h2: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15 },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  small: { fontSize: 13 },
  money: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  moneyLg: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
})

const styles = StyleSheet.create({
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg },
  panel: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: space.md },
  buttonText: { fontSize: 16, fontWeight: '700' },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 48, fontSize: 16 },
  stepper: { borderWidth: 1, borderRadius: radius.md, alignSelf: 'flex-start', paddingHorizontal: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  progress: { height: 8, borderRadius: 99, overflow: 'hidden' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colorBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
})
