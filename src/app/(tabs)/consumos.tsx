import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { AgrupacionSwitch, PeriodNav } from '@/components/PeriodNav'
import { Badge, ChipSelect, Empty, Fab, Input, Panel, Row, Screen, Segmented, Txt } from '@/components/ui'
import {
  expenseStatus,
  installmentIn,
  involves,
  myShare,
  periodsIn,
  sharedDebts,
  sharesOf,
  toARS,
  type Agrupacion,
} from '@/lib/calc'
import { fmtDate, periodShort } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { useData } from '@/lib/store'
import { space, useTheme } from '@/lib/theme'
import { ME, type Card, type CardExpense } from '@/lib/types'
import { useAgrupacion, usePeriodState } from '@/lib/usePeriod'

type Vista = 'resumen' | 'todos' | 'conmigo'

export default function Consumos() {
  const data = useData()
  const params = useLocalSearchParams<{ card?: string; p?: string; v?: string }>()
  const [modo] = useAgrupacion()
  const { period, setPeriod, today } = usePeriodState(data, params.p, modo)
  const [cardId, setCardId] = useState<string>(params.card ?? 'all')
  const [personId, setPersonId] = useState<string>('all')
  const [vista, setVista] = useState<Vista>('resumen')
  const [q, setQ] = useState('')

  // Al llegar desde el Resumen con otros filtros, aplicarlos.
  const [prevParams, setPrevParams] = useState(params)
  if (params.card !== prevParams.card || params.p !== prevParams.p || params.v !== prevParams.v) {
    setPrevParams(params)
    if (params.card) setCardId(params.card)
    if (params.p) {
      setPeriod(params.p)
      setVista(params.v === 'conmigo' ? 'conmigo' : 'resumen')
    }
  }

  const cardById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards])
  const personName = (id: string) => (id === ME ? 'Yo' : (data.people.find((p) => p.id === id)?.nombre ?? '?'))
  const cot = data.settings.cotizacionUSD

  const filtered = data.cardExpenses.filter(
    (e) =>
      (cardId === 'all' || e.cardId === cardId) &&
      (personId === 'all' || involves(e, personId)) &&
      (!q || e.descripcion.toLowerCase().includes(q.toLowerCase())),
  )

  const rows = filtered
    .flatMap((e) => {
      const card = cardById.get(e.cardId)
      if (!card) return []
      // Resúmenes de la tarjeta que caen en el mes elegido (por vencimiento puede no haber o haber dos).
      const periods = periodsIn(card, period, modo)
      if (vista === 'resumen') {
        return periods.flatMap((p) => {
          const inst = installmentIn(e, card, p, cot)
          return inst ? [{ e, card, p, inst }] : []
        })
      }
      const p = periods[0] ?? period
      return [{ e, card, p, inst: installmentIn(e, card, p, cot) }]
    })
    .sort((a, b) => b.e.fecha.localeCompare(a.e.fecha))

  // Con una persona elegida, cada consumo vale solo la parte de esa persona.
  const viewer = personId === 'all' ? null : personId
  const shareOf = (e: CardExpense, pid: string) => sharesOf(e).reduce((a, s) => a + (s.personId === pid ? s.fraccion : 0), 0)
  const full = (r: (typeof rows)[number]) => r.inst?.montoARS ?? toARS(r.e.total, r.e.moneda, cot)
  const shown = (r: (typeof rows)[number]) => full(r) * (viewer ? shareOf(r.e, viewer) : 1)

  const total = rows.reduce((a, r) => a + (r.inst?.montoARS ?? 0), 0)
  const mio = rows.reduce((a, r) => a + (r.inst?.mioARS ?? 0), 0)
  const deViewer = rows.reduce((a, r) => a + (r.inst ? shown(r) : 0), 0)

  const cardOptions = [{ value: 'all', label: 'Todas' }, ...data.cards.map((c) => ({ value: c.id, label: c.nombre, color: c.color }))]
  const personOptions = [
    { value: 'all', label: 'Todos' },
    { value: ME, label: 'Yo' },
    ...data.people.map((p) => ({ value: p.id, label: p.nombre })),
  ]

  const hayCompartidos = data.shared.cardExpenses.length > 0
  const selector = (
    <Segmented
      value={vista}
      onChange={setVista}
      options={[
        { value: 'resumen', label: hayCompartidos ? 'Resumen' : 'Del resumen' },
        { value: 'todos', label: hayCompartidos ? 'Todos' : 'Todos los consumos' },
        ...(hayCompartidos ? [{ value: 'conmigo' as const, label: 'Conmigo' }] : []),
      ]}
    />
  )

  if (vista === 'conmigo') {
    return (
      <Screen>
        {selector}
        <View style={{ height: space.md }} />
        <AgrupacionSwitch />
        <View style={{ height: space.sm }} />
        <SharedView period={period} setPeriod={setPeriod} today={today} modo={modo} />
      </Screen>
    )
  }

  return (
    <Screen fab={data.cards.length > 0 && <Fab label="Consumo" onPress={() => router.push('/consumo/nuevo')} />}>
      {selector}
      <View style={{ height: space.md }} />
      {vista === 'resumen' && (
        <>
          <AgrupacionSwitch />
          <View style={{ height: space.sm }} />
          <PeriodNav value={period} onChange={setPeriod} today={today} caption={captionDe(modo)} />
        </>
      )}

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <ChipSelect scroll options={cardOptions} value={cardId} onChange={setCardId} />
        {data.people.length > 0 && <ChipSelect scroll options={personOptions} value={personId} onChange={setPersonId} />}
        {vista === 'todos' && <Input placeholder="Buscar por descripción…" value={q} onChangeText={setQ} />}
      </View>

      {vista === 'resumen' && rows.length > 0 && (
        <Panel style={{ marginTop: space.md }}>
          {viewer ? (
            <View>
              <Txt v="label" muted>
                {viewer === ME ? 'Me toca pagar' : `Le toca a ${personName(viewer)}`} · {periodShort(period)}
              </Txt>
              <Txt v="moneyLg">{fmtMoney(deViewer)}</Txt>
              {Math.abs(total - deViewer) > 0.005 && (
                <Txt v="small" muted>
                  Solo su parte de los compartidos (las cuotas completas suman {fmtMoney(total)})
                </Txt>
              )}
            </View>
          ) : (
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <View>
                <Txt v="label" muted>
                  Total {periodShort(period)}
                </Txt>
                <Txt v="moneyLg">{fmtMoney(total)}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt muted>Mío {fmtMoney(mio)}</Txt>
                <Txt muted>Otros {fmtMoney(total - mio)}</Txt>
              </View>
            </Row>
          )}
        </Panel>
      )}

      <View style={{ marginTop: space.md, gap: space.sm }}>
        {rows.length === 0 && (
          <Empty
            icon="receipt-outline"
            title={data.cards.length === 0 ? 'No hay tarjetas' : 'Sin consumos'}
            text={
              data.cards.length === 0
                ? 'Primero creá una tarjeta en Ajustes → Tarjetas y cierres.'
                : vista === 'resumen'
                  ? 'No hay cuotas ni gastos fijos en este resumen con los filtros elegidos.'
                  : 'Cargá tu primer consumo con el botón +.'
            }
          />
        )}
        {rows.map((r) => {
          const { e, card, inst } = r
          const parcial = viewer ? shareOf(e, viewer) < 1 : myShare(e) < 1
          return (
            <ExpenseRow
            key={`${e.id}-${r.p}`}
            e={e}
            card={card}
            persona={
              e.compartido.length > 1
                ? `Compartido ×${e.compartido.length}`
                : e.personId === ME
                  ? null
                  : personName(e.personId)
            }
            cuota={inst ? (e.fijo ? 'Fijo' : `Cuota ${inst.nro}/${inst.de}`) : null}
            monto={shown(r)}
            nota={!parcial ? null : viewer ? `su parte de ${fmtMoney(full(r))}` : `mi parte ${fmtMoney(full(r) * myShare(e))}`}
            detalle={vista === 'todos' ? statusText(e, card, r.p) : null}
          />
          )
        })}
      </View>
    </Screen>
  )
}

const captionDe = (modo: Agrupacion) => (modo === 'vencimiento' ? 'Mes de vencimiento del resumen' : 'Mes de cierre del resumen')

function statusText(e: CardExpense, card: Card, p: string) {
  const s = expenseStatus(e, card, p)
  if (e.fijo) return s.estado === 'fijo' ? `Fijo desde ${periodShort(s.first)}${s.last ? ` hasta ${periodShort(s.last)}` : ''}` : 'Fijo dado de baja'
  if (s.estado === 'finalizado') return `Pagado · ${periodShort(s.first)} a ${periodShort(s.last!)}`
  if (s.estado === 'pendiente') return `Empieza ${periodShort(s.first)}`
  return `${s.restantes} cuotas restantes · saldo ${fmtMoney(s.saldo, { moneda: e.moneda })}`
}

function ExpenseRow({
  e,
  card,
  persona,
  cuota,
  monto,
  nota,
  detalle,
}: {
  e: CardExpense
  card: Card
  persona: string | null
  cuota: string | null
  monto: number
  /** aclaración del importe cuando es una parte (compartido) */
  nota: string | null
  detalle: string | null
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/consumo/[id]', params: { id: e.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: t.surface, borderColor: t.border, borderLeftColor: card.color },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Row style={{ flexWrap: 'wrap' }}>
          <Txt numberOfLines={1} style={{ fontWeight: '600', flexShrink: 1 }}>
            {e.descripcion}
          </Txt>
          {persona && <Badge label={persona} tone="primary" />}
          {e.moneda === 'USD' && <Badge label="USD" tone="warn" />}
        </Row>
        <Txt v="small" muted numberOfLines={1}>
          {card.nombre} · {e.fijo ? 'mensual' : fmtDate(e.fecha)}
          {cuota ? ` · ${cuota}` : ''}
          {e.compartido.length < 2 && e.partes > 1 ? ` · ÷${e.partes}` : ''}
        </Txt>
        {detalle && (
          <Txt v="small" muted>
            {detalle}
          </Txt>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="money">{fmtMoney(monto)}</Txt>
        {nota && (
          <Txt v="small" muted>
            {nota}
          </Txt>
        )}
        {!e.fijo && e.cuotas > 1 && (
          <Txt v="small" muted>
            de {fmtMoney(e.total, { moneda: e.moneda, compact: true })}
          </Txt>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={t.muted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
  },
})

/** Consumos de otros usuarios donde participo: solo lectura, con mi parte. */
function SharedView({
  period,
  setPeriod,
  today,
  modo,
}: {
  period: string
  setPeriod: (p: string) => void
  today: string
  modo: Agrupacion
}) {
  const data = useData()
  const t = useTheme()
  const deudas = sharedDebts(data, period, modo)
  const total = deudas.reduce((a, d) => a + d.total, 0)
  const nombrePersona = (id: string) =>
    data.shared.myPersonIds.includes(id) ? 'vos' : (data.shared.people.find((p) => p.id === id)?.nombre ?? '?')

  return (
    <View style={{ gap: space.md }}>
      <PeriodNav value={period} onChange={setPeriod} today={today} caption={captionDe(modo)} />
      <Panel>
        <Txt v="label" muted>
          Te toca pagar · {periodShort(period)}
        </Txt>
        <Txt v="moneyLg">{fmtMoney(total)}</Txt>
        <Txt v="small" muted>
          Consumos que otros usuarios compartieron con vos. Se pagan a quien tiene la tarjeta.
        </Txt>
      </Panel>
      {deudas.length === 0 && <Empty icon="people-outline" title="Nada compartido en este resumen" />}
      {deudas.map((d) => (
        <View key={d.ownerId} style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h2">Le debés a {d.nombre}</Txt>
            <Txt v="money">{fmtMoney(d.total)}</Txt>
          </Row>
          {d.lines.map(({ expense: e, card, period: p, inst, miParte }) => (
            <View key={`${e.id}-${p}`} style={[styles.row, { backgroundColor: t.surface, borderColor: t.border, borderLeftColor: card.color }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt style={{ fontWeight: '600' }} numberOfLines={1}>
                  {e.descripcion}
                </Txt>
                <Txt v="small" muted numberOfLines={2}>
                  {card.nombre} de {d.nombre} · {e.fijo ? 'mensual' : `Cuota ${inst.nro}/${inst.de}`}
                  {e.compartido.length > 1 ? ` · entre ${e.compartido.map(nombrePersona).join(', ')}` : ''}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt v="money">{fmtMoney(miParte)}</Txt>
                {Math.abs(miParte - inst.montoARS) > 0.005 && (
                  <Txt v="small" muted>
                    de {fmtMoney(inst.montoARS)}
                  </Txt>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
