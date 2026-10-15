import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'

import { DateField } from '@/components/DateField'
import { PeriodNav } from '@/components/PeriodNav'
import { Sheet } from '@/components/Sheet'
import { Button, Chip, ChipSelect, Empty, Field, Input, Panel, Row, Screen, Segmented, Stepper, SwitchRow, Txt } from '@/components/ui'
import { cycleOf, periodForDate, toARS } from '@/lib/calc'
import { addPeriods, fmtDate, periodShort, todayISO } from '@/lib/dates'
import { attempt, confirm } from '@/lib/dialog'
import { fmtMoney, parseMoney, toInput } from '@/lib/format'
import { newId } from '@/lib/repo'
import { useData, useStore } from '@/lib/store'
import { space, useTheme } from '@/lib/theme'
import { ME, type CardExpense, type Currency, type Period } from '@/lib/types'

const CUOTAS_RAPIDAS = [1, 3, 6, 9, 12, 18, 24]

export default function ConsumoForm() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const data = useData()
  const { saveCardExpense, deleteCardExpense } = useStore()
  const t = useTheme()
  const existing = data.cardExpenses.find((e) => e.id === id)
  const isNew = !existing
  const activeCards = data.cards.filter((c) => c.activa || c.id === existing?.cardId)

  const [cardId, setCardId] = useState(existing?.cardId ?? activeCards[0]?.id ?? '')
  const [personId, setPersonId] = useState(existing?.personId ?? ME)
  const [descripcion, setDescripcion] = useState(existing?.descripcion ?? '')
  const [fijo, setFijo] = useState(existing?.fijo ?? false)
  const [fecha, setFecha] = useState(existing?.fecha ?? todayISO())
  const [cuotas, setCuotas] = useState(existing?.cuotas ?? 1)
  const [modo, setModo] = useState<'total' | 'cuota'>('total')
  const [montoStr, setMontoStr] = useState(toInput(existing?.total))
  const [moneda, setMoneda] = useState<Currency>(existing?.moneda ?? 'ARS')
  // Consumos viejos divididos en "partes" sin nombres se abren como compartidos para completar los participantes.
  const legacyPartes = existing && existing.compartido.length < 2 && existing.partes > 1 ? existing.partes : 0
  const [compartidoOn, setCompartidoOn] = useState((existing?.compartido.length ?? 0) > 1 || legacyPartes > 0)
  const [participantes, setParticipantes] = useState<string[]>(
    existing && existing.compartido.length > 1 ? existing.compartido : [existing?.personId ?? ME],
  )
  const [nuevaPersona, setNuevaPersona] = useState(false)
  const [primerManual, setPrimerManual] = useState<Period | null>(existing?.primerPeriodoManual ?? null)
  const [hasta, setHasta] = useState<Period | null>(existing?.hasta ?? null)
  const [notas, setNotas] = useState(existing?.notas ?? '')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  const card = data.cards.find((c) => c.id === cardId)
  if (!card) {
    return (
      <Screen>
        <Empty icon="card-outline" title="Primero creá una tarjeta" text="Andá a Ajustes → Tarjetas y cierres." />
      </Screen>
    )
  }

  const monto = parseMoney(montoStr)
  const n = fijo ? 1 : cuotas
  const total = modo === 'cuota' ? monto * n : monto
  const autoPeriod = periodForDate(card, fecha)
  const primer = primerManual ?? autoPeriod
  const cy = cycleOf(card, primer)
  const valorCuota = total / n
  const nPart = compartidoOn ? participantes.length : 1
  const toggleParticipante = (pid: string) =>
    setParticipantes((ps) => (ps.includes(pid) ? ps.filter((x) => x !== pid) : [...ps, pid]))

  const errors = {
    descripcion: !descripcion.trim() ? 'Ingresá una descripción' : null,
    monto: !(monto > 0) ? 'Ingresá un monto válido' : null,
    compartido: compartidoOn && participantes.length < 2 ? 'Elegí al menos dos participantes' : null,
  }
  const valid = !errors.descripcion && !errors.monto && !errors.compartido

  const build = (): CardExpense => ({
    id: existing?.id ?? newId(),
    cardId,
    // en un compartido, el "dueño" queda como yo (la tarjeta es mía); cada uno debe su parte
    personId: compartidoOn ? ME : personId,
    descripcion: descripcion.trim(),
    fijo,
    fecha,
    cuotas: n,
    total: Math.round(total * 100) / 100,
    moneda,
    compartido: compartidoOn ? participantes : [],
    partes: 1,
    primerPeriodoManual: primerManual,
    hasta: fijo ? hasta : null,
    notas: notas.trim() || undefined,
  })

  const save = async (otro: boolean) => {
    setTried(true)
    if (!valid) return
    setBusy(true)
    const ok = await attempt(() => saveCardExpense(build()))
    setBusy(false)
    if (!ok) return
    if (otro) {
      setDescripcion('')
      setMontoStr('')
      setTried(false)
    } else router.back()
  }

  const remove = async () => {
    if (!existing) return
    if (!(await confirm('Eliminar consumo', `¿Eliminar "${existing.descripcion}"?`, 'Eliminar', true))) return
    if (await attempt(() => deleteCardExpense(existing.id), 'No se pudo eliminar')) router.back()
  }

  return (
    <Screen>
      <Field label="Tarjeta">
        <ChipSelect
          options={activeCards.map((c) => ({ value: c.id, label: c.nombre, color: c.color }))}
          value={cardId}
          onChange={setCardId}
        />
      </Field>

      <Field
        label="¿De quién es el gasto?"
        error={tried ? errors.compartido : null}
        hint={
          legacyPartes
            ? `Antes estaba dividido en ${legacyPartes} partes sin nombres: marcá quiénes participan.`
            : compartidoOn
              ? 'Partes iguales. El banco cobra el total; la parte de cada uno se suma a lo que te debe.'
              : undefined
        }
      >
        <View style={{ marginBottom: space.sm }}>
          <Segmented
            value={compartidoOn ? 'compartido' : 'una'}
            onChange={(v) => setCompartidoOn(v === 'compartido')}
            options={[
              { value: 'una', label: 'Una persona' },
              { value: 'compartido', label: 'Compartido' },
            ]}
          />
        </View>
        {compartidoOn ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {[{ id: ME, nombre: 'Yo' }, ...data.people].map((p) => (
              <Chip
                key={p.id}
                label={p.nombre}
                icon={participantes.includes(p.id) ? 'checkmark' : undefined}
                selected={participantes.includes(p.id)}
                onPress={() => toggleParticipante(p.id)}
              />
            ))}
            <Chip label="Persona" icon="add" onPress={() => setNuevaPersona(true)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <ChipSelect
              options={[{ value: ME, label: 'Mío' }, ...data.people.map((p) => ({ value: p.id, label: p.nombre }))]}
              value={personId}
              onChange={setPersonId}
            />
            <Chip label="Persona" icon="add" onPress={() => setNuevaPersona(true)} />
          </View>
        )}
      </Field>

      <Field label="Descripción" error={tried ? errors.descripcion : null}>
        <Input value={descripcion} onChangeText={setDescripcion} placeholder="Ej. Heladera, Netflix…" invalid={tried && !!errors.descripcion} />
      </Field>

      <Field label="Tipo">
        <Segmented
          value={fijo ? 'fijo' : 'cuotas'}
          onChange={(v) => setFijo(v === 'fijo')}
          options={[
            { value: 'cuotas', label: 'Compra / cuotas' },
            { value: 'fijo', label: 'Gasto fijo mensual' },
          ]}
        />
      </Field>

      <Field label={fijo ? 'Desde (fecha del primer cobro)' : 'Fecha de compra'}>
        <DateField value={fecha} onChange={setFecha} />
      </Field>

      {!fijo && (
        <Field label="Cuotas">
          <Row style={{ flexWrap: 'wrap' }}>
            <Stepper value={cuotas} onChange={setCuotas} min={1} max={72} />
            <ChipSelect
              options={CUOTAS_RAPIDAS.map((c) => ({ value: String(c), label: String(c) }))}
              value={String(cuotas)}
              onChange={(v) => setCuotas(Number(v))}
            />
          </Row>
        </Field>
      )}

      <Field label="Moneda">
        <Segmented
          value={moneda}
          onChange={setMoneda}
          options={[
            { value: 'ARS', label: 'Pesos' },
            { value: 'USD', label: 'Dólares' },
          ]}
        />
      </Field>

      <Field
        label={fijo ? 'Importe mensual' : 'Importe'}
        error={tried ? errors.monto : null}
        hint={moneda === 'USD' ? `Se convierte a ${fmtMoney(data.settings.cotizacionUSD)} por dólar (Ajustes).` : undefined}
      >
        {!fijo && n > 1 && (
          <View style={{ marginBottom: space.sm }}>
            <Segmented
              value={modo}
              onChange={(m) => {
                // mantener el mismo total al cambiar de modo
                if (monto > 0) setMontoStr(toInput(m === 'cuota' ? monto / n : monto * n))
                setModo(m)
              }}
              options={[
                { value: 'total', label: 'Total de la compra' },
                { value: 'cuota', label: 'Valor de cada cuota' },
              ]}
            />
          </View>
        )}
        <Input
          value={montoStr}
          onChangeText={setMontoStr}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0,00"
          invalid={tried && !!errors.monto}
        />
      </Field>

      <Field label="Primer resumen" hint="Se calcula con la fecha y el cierre de la tarjeta. Podés elegirlo a mano si el banco lo imputó en otro.">
        <SwitchRow
          label={primerManual ? 'Elegido a mano' : `Automático: ${periodShort(autoPeriod)}`}
          value={!!primerManual}
          onChange={(v) => setPrimerManual(v ? autoPeriod : null)}
        />
        {primerManual && <PeriodNav value={primerManual} onChange={setPrimerManual} today={autoPeriod} />}
      </Field>

      {fijo && (
        <Field label="Hasta" hint="Para dar de baja una suscripción: último resumen en que se cobra.">
          <SwitchRow label={hasta ? `Hasta ${periodShort(hasta)}` : 'Sin fecha de fin'} value={!!hasta} onChange={(v) => setHasta(v ? primer : null)} />
          {hasta && <PeriodNav value={hasta} onChange={setHasta} />}
        </Field>
      )}

      <Field label="Notas (opcional)">
        <Input value={notas} onChangeText={setNotas} multiline style={{ minHeight: 70, paddingTop: 12, textAlignVertical: 'top' }} />
      </Field>

      {monto > 0 && (
        <Panel style={{ backgroundColor: t.primarySoft, borderColor: t.primary, marginBottom: space.lg }}>
          <Txt style={{ fontWeight: '700' }}>
            {fijo
              ? `${fmtMoney(valorCuota, { moneda })} por mes desde ${periodShort(primer)}${hasta ? ` hasta ${periodShort(hasta)}` : ''}`
              : `${n === 1 ? '1 pago' : `${n} cuotas`} de ${fmtMoney(valorCuota, { moneda })}${
                  n > 1 ? ` · ${periodShort(primer)} a ${periodShort(addPeriods(primer, n - 1))}` : ` en ${periodShort(primer)}`
                }`}
          </Txt>
          {nPart > 1 && (
            <Txt style={{ marginTop: 4 }}>
              {nPart} participantes: {fmtMoney(valorCuota / nPart, { moneda })} cada uno{fijo ? ' por mes' : n > 1 ? ' por cuota' : ''}
            </Txt>
          )}
          <Txt v="small" muted style={{ marginTop: 4 }}>
            Primer resumen cierra {fmtDate(cy.cierre)} y vence {fmtDate(cy.vencimiento)}
            {moneda === 'USD' ? ` · ≈ ${fmtMoney(toARS(valorCuota, 'USD', data.settings.cotizacionUSD))}` : ''}
          </Txt>
        </Panel>
      )}

      <View style={{ gap: space.sm }}>
        <Button title="Guardar" icon="checkmark" onPress={() => save(false)} loading={busy} />
        {isNew && <Button title="Guardar y cargar otro" variant="secondary" onPress={() => save(true)} disabled={busy} />}
        {!isNew && <Button title="Eliminar" variant="danger" icon="trash-outline" onPress={remove} />}
      </View>

      {nuevaPersona && (
        <NewPersonSheet
          onClose={() => setNuevaPersona(false)}
          onSaved={(pid) => {
            if (compartidoOn) setParticipantes((ps) => [...ps, pid])
            else setPersonId(pid)
          }}
        />
      )}
    </Screen>
  )
}

/** Alta rápida de una persona sin salir del formulario. */
function NewPersonSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { savePerson } = useStore()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!nombre.trim()) return
    const id = newId()
    setBusy(true)
    const ok = await attempt(() => savePerson({ id, nombre: nombre.trim(), email: email.trim().toLowerCase() || undefined }))
    setBusy(false)
    if (ok) {
      onSaved(id)
      onClose()
    }
  }

  return (
    <Sheet visible title="Nueva persona" onClose={onClose}>
      <Field label="Nombre">
        <Input value={nombre} onChangeText={setNombre} autoFocus placeholder="Ej. Celeste" />
      </Field>
      <Field label="Email (opcional)" hint="Si tiene cuenta en la app con este email, va a ver los consumos donde participa.">
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          inputMode="email"
          onSubmitEditing={save}
        />
      </Field>
      <Button title="Agregar" icon="checkmark" onPress={save} loading={busy} disabled={!nombre.trim()} />
    </Sheet>
  )
}
