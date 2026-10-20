# Arquitectura

Objetivo: **soberanía**. La app no depende de ningún proveedor: los datos viven en Postgres estándar y el backend se
puede cambiar (Supabase, servidor propio en Docker, cualquier Postgres administrado) sin tocar las pantallas.

```
┌──────────────────────────── App (Expo: Android + web) ─────────────────────────────┐
│  Pantallas (src/app) ─ componentes (src/components)                                 │
│        │                                                                            │
│  store.tsx (estado) ─ calc.ts (cuotas, cierres, compartidos) ─ types.ts (modelo)    │
│        │                                                                            │
│  repo.ts      convierte modelo ⇄ filas del contrato. No conoce al proveedor.        │
│        │                                                                            │
│  data/port.ts  ◄── interfaz Backend { auth, data }  (el "DAO")                      │
│     ├── data/supabase/  adaptador Supabase (supabase-js, RLS, Supabase Auth)        │
│     └── data/http/      adaptador HTTP  ──────────────┐                             │
└───────────────────────────────────────────────────────│─────────────────────────────┘
                                                        │  contract/api.ts (rutas, tokens)
contract/rows.ts  ◄── filas, backup y compartidos: lo comparten app y servidor
                                                        ▼
┌──────────────────────────── server/ (Node + Hono) ─────────────────────────────────┐
│  auth/   usuarios, scrypt (+bcrypt de Supabase), JWT + refresh rotativo, mails     │
│  data/   validación (zod), permisos por usuario, compartidos, restore transaccional │
│  db/     pool de Postgres + migraciones SQL versionadas                             │
└────────────────────────────────────────│────────────────────────────────────────────┘
                                         ▼
                     Postgres 13+ (Docker propio, Neon, RDS, Supabase…)
```

## Principios

- **Un solo punto de contacto con el proveedor.** Solo `src/lib/data/<adaptador>/` conoce a Supabase o a la API.
  Pantallas, cálculos y store hablan con la interfaz `Backend` (`src/lib/data/port.ts`).
- **Un contrato compartido.** `contract/` define las filas (snake_case, igual que en Postgres), el formato de backup y
  la API. App y servidor lo importan; si cambia, TypeScript marca los dos lados.
- **Datos portables.** Mismas tablas, columnas e ids en Supabase y en el servidor propio. El backup JSON de la app es
  el mismo formato que usa `restore` en ambos backends.
- **Permisos donde corresponde.** En Supabase los aplica la base (RLS + funciones SQL). En el servidor propio, el
  código (`server/src/data/repository.ts` y `shared.ts`): toda consulta filtra por usuario y toda referencia se
  verifica como propia. La base del servidor propio no necesita nada especial: Postgres pelado.
- **Errores normalizados.** Cada adaptador traduce sus errores a `DataError` con códigos estables
  (`invalid_credentials`, `in_use`, `forbidden`…), así los mensajes de la app no dependen del proveedor.

## Elegir backend

En `.env.local` de la app:

| Backend | Variables |
|---|---|
| Supabase | `EXPO_PUBLIC_BACKEND=supabase` · `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Servidor propio | `EXPO_PUBLIC_BACKEND=api` · `EXPO_PUBLIC_API_URL=http://<ip-o-dominio>:8787` |

Las variables `EXPO_PUBLIC_*` quedan dentro del APK al compilarlo: cambiar de backend = editar `.env.local` y recompilar.

## Agregar otro proveedor

1. Crear `src/lib/data/<nuevo>/index.ts` que devuelva un `Backend` (ver `port.ts`; usar los adaptadores existentes
   como referencia: cada método mueve filas del contrato, nada más).
2. Sumarlo al selector en `src/lib/data/index.ts`.

## Manual de soberanía (cómo moverse)

### Supabase → servidor propio (con usuarios y contraseñas)

```bash
cp server/.env.example server/.env        # completar JWT_SECRET y POSTGRES_PASSWORD
docker compose up -d --build              # Postgres + API
cd server
SOURCE_DATABASE_URL="postgresql://postgres:<clave>@db.<proyecto>.supabase.co:5432/postgres" \
DATABASE_URL="postgres://gastos:<clave>@localhost:5432/gastos" \
npm run import:supabase -- --dry-run      # ver qué copiaría; después sin --dry-run
```

Copia usuarios (con su hash bcrypt: entran con la misma contraseña), perfiles y todos los datos, conservando ids
(los compartidos siguen funcionando). Es idempotente. Después: `.env.local` → `EXPO_PUBLIC_BACKEND=api` y recompilar.

### Servidor propio → otro Postgres (otro hosting, otra máquina)

```bash
docker compose exec -T db pg_dump -U gastos -Fc gastos > gastos.dump          # respaldo completo
pg_restore --no-owner -d "postgres://usuario:clave@nuevo-host:5432/base" gastos.dump
```

Cambiar `DATABASE_URL` en `server/.env` y reiniciar la API (`docker compose up -d api`). La app no cambia.

### Volver a Supabase (o a cualquier backend) por usuario

Desde la app: *Ajustes → Backup* → exportar `.json` en el backend viejo, ingresar en el nuevo → *Restaurar*.

### Respaldos de la base propia

```bash
docker compose exec -T db pg_dump -U gastos -Fc gastos > backup-$(date +%F).dump
```

## Pruebas

- `server/test/api.test.ts`: end-to-end contra la API y Postgres reales (auth, permisos entre usuarios,
  compartidos, restore, importación de hashes bcrypt). `npm run server:test` con el docker compose levantado.
