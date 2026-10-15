import { router } from 'expo-router'
import { useState } from 'react'

import { Button, Field, Input, Screen } from '@/components/ui'
import { attempt } from '@/lib/dialog'
import { parseMoney, toInput } from '@/lib/format'
import { useData, useStore } from '@/lib/store'

export default function Configuracion() {
  const data = useData()
  const { saveSettings } = useStore()
  const s = data.settings
  const [cot, setCot] = useState(toInput(s.cotizacionUSD))
  const [nec, setNec] = useState(toInput(s.presupuesto.necesario))
  const [inn, setInn] = useState(toInput(s.presupuesto.innecesario))
  const [busy, setBusy] = useState(false)

  const values = { cot: parseMoney(cot), nec: parseMoney(nec), inn: parseMoney(inn) }
  const valid = values.cot > 0 && values.nec >= 0 && values.inn >= 0

  const save = async () => {
    if (!valid) return
    setBusy(true)
    const ok = await attempt(() =>
      saveSettings({ ...s, cotizacionUSD: values.cot, presupuesto: { necesario: values.nec, innecesario: values.inn } }),
    )
    setBusy(false)
    if (ok) router.back()
  }

  return (
    <Screen>
      <Field label="Cotización del dólar" hint="Se usa para convertir a pesos los consumos en USD (suscripciones, compras en el exterior).">
        <Input value={cot} onChangeText={setCot} keyboardType="decimal-pad" inputMode="decimal" invalid={!(values.cot > 0)} />
      </Field>
      <Field label="Presupuesto mensual · necesarios" hint="Víveres, transporte y demás gastos que no son con tarjeta.">
        <Input value={nec} onChangeText={setNec} keyboardType="decimal-pad" inputMode="decimal" />
      </Field>
      <Field label="Presupuesto mensual · innecesarios" hint="Salidas, delivery, gustos. Podés ajustar un mes puntual desde la pestaña Gastos.">
        <Input value={inn} onChangeText={setInn} keyboardType="decimal-pad" inputMode="decimal" />
      </Field>
      <Button title="Guardar" icon="checkmark" onPress={save} loading={busy} disabled={!valid} />
    </Screen>
  )
}
