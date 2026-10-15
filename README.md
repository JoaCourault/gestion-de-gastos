# Gestor de Gastos

App personal para tarjetas de crédito (cuotas, cierres y vencimientos) y gastos del mes.
Un solo código **Expo / React Native** que corre en el navegador de la PC (localhost) y se compila a **APK** para Android.
Los datos viven en **Supabase** (Postgres) protegidos con login y RLS: solo tu usuario puede leerlos o modificarlos.

## Qué hace

- **Tarjetas y cierres**: alta, baja y modificación de tarjetas con días habituales de cierre y vencimiento. Cada período
  se puede ajustar con las fechas reales del resumen (marcado como *Real* vs *Estimado*). Los períodos se nombran por el
  **mes de cierre** (igual que las columnas OCT-26, NOV-26 del Excel).
- **Consumos con tarjeta** (hoja TARJETAS): tarjeta, persona (mío / de otros, ej. "VISA - Mateo"), descripción, gasto fijo,
  fecha, cuotas, total, moneda ARS/USD, "dividir entre" (ej. La Renga ÷4). La cuota actual y el primer resumen se
  calculan solos con la fecha y los cierres; se pueden forzar a mano.
- **Gastos** (hojas "Gastos YYYY-MM"): necesarios / innecesarios con tipos ampliables y agrupados (Víveres, Viajes…),
  presupuesto mensual general y por mes.
- **Resumen**: total a pagar por resumen (mío / de otros), por tarjeta, próximos cierres y vencimientos, presupuesto
  del mes y proyección de cuotas a 12 meses.
- **Backup**: exportar / restaurar un `.json` (para guardar en Drive), copia automática diaria a la hora que elijas
  y recordatorio en el celular.

## 1. Crear el proyecto de Supabase (una vez)

1. Entrá a <https://supabase.com>, creá una cuenta y un proyecto nuevo (plan gratuito).
2. **SQL Editor → New query**: pegá todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y tocá **Run**.
   Crea las tablas, las reglas de seguridad (RLS) y la función de restaurar backup.
3. **Authentication → Users → Add user → Create new user**: tu email y una contraseña (marcá *Auto Confirm User*).
4. **Authentication → Sign In / Providers**: dejá activado **Allow new users to sign up** y **Confirm email** (los demás
   se registran desde la app; la confirmación del email es lo que garantiza que nadie vea consumos compartidos ajenos).
   En **Authentication → URL Configuration** poné como *Site URL* `http://localhost:8081`.
5. **Project Settings → API**: copiá la *Project URL* y la *publishable key* (o *anon key*). Nunca uses la *secret* /
   *service_role* key en la app.

## 2. Configurar la app

```bash
npm install
```

Copiá `.env.example` como `.env.local` y completá:

```
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu-key
```

## 3. Usarla en la PC (localhost)

```bash
npm run web
```

Se abre en <http://localhost:8081>. Ingresás una sola vez; la sesión queda guardada.

**Cargar tus datos del Excel**: en *Ajustes → Backup y restauración → Restaurar desde archivo* elegí
`datos-iniciales.json` (generado desde `Datos.xlsx`: 3 tarjetas, 32 consumos, 2 personas, 12 tipos y los gastos de
octubre). Las tarjetas quedan con cierre el día 25 y vencimiento el 5: ajustalos en *Tarjetas y cierres*.
Los gastos de octubre del Excel no tenían fecha, así que quedan todos el 01/10.

## 4. Generar el APK para el celular

Requisitos: Android SDK y **JDK 17**. En esta PC ya están: `JAVA_HOME` apunta a `C:\Program Files\Java\jdk-17`
(Gradle usa esa variable; no importa que `java -version` en el PATH muestre Java 8).

```bash
npm run apk
```

El archivo queda en `android/app/build/outputs/apk/release/app-release.apk`. Si falla con `ENOTEMPTY ... metro-cache`, es porque
`npm run web` está corriendo y comparte la caché de Metro: cerralo y volvé a compilar. Pasalo al celular e instalalo
(Android pide permitir "instalar apps de origen desconocido"). Los valores de `.env.local` quedan incluidos en el APK,
así que hay que tenerlo configurado antes de compilar.

Alternativa sin JDK: `npx eas-cli@latest build -p android --profile preview` compila en los servidores de Expo
(pide una cuenta gratuita de Expo).

## Varios usuarios y consumos compartidos

Cada usuario tiene sus propios datos. En **Personas** podés cargarle el email a alguien (ej. Mateo): si se registra en la
app con ese email y lo confirma, en su app ve —solo lectura— los consumos donde participa:

- los **compartidos** (ej. La Renga entre vos, Celeste, Leo y Mateo), con su parte;
- los que hizo **con tu tarjeta** (ej. "VISA - Mateo").

Le aparecen en *Resumen → Compartidos conmigo* y en *Tarjetas → Conmigo*, como "Le debés a Joa $X". No entran en sus
resúmenes de tarjeta propios ni en su backup. Nadie ve el resto de tus datos. Tu nombre (el que ven los demás) se
configura en *Ajustes → Cuenta*.

Si tu base es anterior a estas funciones, corré en el SQL Editor, en orden: `supabase/migracion-002-compartidos.sql` y
`supabase/migracion-003-usuarios-compartidos.sql`.

## Backup

- **Celular**: a la hora configurada (por defecto 22:00) llega una notificación; al tocarla se guarda la copia y se abre
  *Compartir* → elegí **Drive**. Además, al abrir la app después de esa hora se guarda una copia en el celular.
- **PC**: con la app abierta (o al abrirla después de la hora) se guarda una copia en el navegador; opcionalmente también
  se descarga el archivo. *Descargar copia* baja el `.json` cuando quieras.
- **Restaurar** reemplaza todos los datos (antes guarda una copia de seguridad local).

Una app no puede subir archivos a Drive sola sin conectarse a la cuenta de Google, por eso el paso final a Drive es un
toque. El plan gratuito de Supabase no hace backups y pausa el proyecto tras 7 días sin uso (se reactiva desde el panel):
conservá los `.json`.

## Desarrollo

```bash
npm run typecheck   # TypeScript
npx expo lint       # ESLint
npx expo-doctor     # dependencias de Expo
```

Estructura: `src/app` (pantallas, Expo Router), `src/components` (UI), `src/lib` (modelo, cálculo de cuotas y cierres
en `calc.ts`, acceso a Supabase en `repo.ts`, backup), `supabase/schema.sql` (base de datos).
