# Sistema de Aprobación de Créditos y Desembolsos

Aplicación Full-Stack (TypeScript estricto) para registrar solicitudes de crédito, validar reglas de negocio, consultar un Buró Crediticio externo simulado con resiliencia y permitir a analistas aprobar o rechazar con presupuesto global, control de concurrencia y auditoría inmutable en tiempo real.

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19 + Vite, TanStack Query, React Router, Motion |
| Backend | Node.js + Express 5, validación con **Zod** |
| Persistencia | **SQLite** (módulo nativo `node:sqlite`, modo WAL) |
| Pruebas | `node:test` (25 pruebas unitarias y de integración HTTP) |
| Dominio compartido | Paquete `@guadalupana/shared`: reglas, esquemas Zod, máquina de estados y amortización, usados **por el frontend y el backend** |

---

## Cómo ejecutarlo

### Opción A — Docker (un comando)

```bash
docker compose up --build
```

Abrir <http://localhost:3000>.

### Opción B — Node.js local (sin Docker)

Requisito: **Node.js 22.18 o superior** (recomendado 24). No hay pasos de compilación del backend ni dependencias nativas: Node ejecuta TypeScript directamente y SQLite viene incluido.

```bash
npm install
npm start          # compila el frontend y levanta todo en http://localhost:3000
```

Modo desarrollo (recarga en caliente, API en `:3000` y web en `:5173`):

```bash
npm run dev        # abrir http://localhost:5173
```

Otros comandos:

```bash
npm test           # 25 pruebas automatizadas
npm run typecheck  # tsc --noEmit en los tres paquetes
```

La base se crea sola en `packages/server/data/creditos.db` con usuarios y solicitudes de ejemplo. Para empezar de cero basta con borrar esa carpeta.

### Usuarios de prueba

La pantalla de inicio de sesión tiene un **selector de usuarios de prueba** (un clic). También se puede escribir:

| Usuario | Contraseña | Rol |
| --- | --- | --- |
| `ana.lopez` | `Analista2026!` | Analista |
| `carlos.mendez` | `Analista2026!` | Analista (útil para probar dos analistas a la vez) |
| `juan.perez` | `Socio2026!` | Solicitante |
| `maria.garcia` | `Socio2026!` | Solicitante |

Datos de ejemplo útiles: el DPI `2233445566778` tiene un rechazo reciente (la regla de 30 días bloquea una solicitud nueva) y `2547896320101` tiene una solicitud pendiente.

---

## Recorrido sugerido para la demo

1. **Solicitante** → *Nueva solicitud*: la tabla de amortización se recalcula mientras se escribe; un monto mayor al 40 % del ingreso o un DPI bloqueado muestran el motivo exacto antes de enviar.
2. Al enviar, la solicitud aparece con el buró en **“Consultando…”**; si el servicio responde 503 se ve el número de intento (*intento 2/4*). Se puede seguir navegando.
3. **Analista** (otra ventana o navegador) → *Panel*: aparece la solicitud nueva sin recargar. *Tomar en revisión* → espera del buró → *Aprobar*. El presupuesto baja con animación en todas las sesiones abiertas.
4. *Auditoría*: cada transición con usuario, rol, marca ISO 8601, estado anterior/nuevo y comentario, en tiempo real.

---

## Arquitectura

```
packages/
├── shared/             Dominio puro, sin dependencias de framework
│   └── src/            rules.ts · status.ts (máquina de estados) · schemas.ts (Zod) · amortization.ts · money.ts
├── server/
│   ├── src/
│   │   ├── db/             conexión, migraciones, transacciones, seed
│   │   ├── repositories/   acceso a datos (SQL parametrizado, sin lógica de negocio)
│   │   ├── services/       casos de uso: solicitudes, decisiones, buró, autenticación, eventos
│   │   ├── http/           rutas, middlewares (auth, roles, errores), simulador del buró
│   │   ├── container.ts    composition root (inyección de dependencias)
│   │   └── app.ts          ensamblado de Express
│   └── test/
└── client/
    └── src/            api/ (cliente + hooks) · auth/ · realtime/ (SSE) · components/ · pages/
```

Flujo de una petición: **ruta** (valida entrada con Zod) → **servicio** (reglas y transacción) → **repositorio** (SQL) → **evento** (SSE) tras el commit.

---

## Decisiones técnicas

### 1. Reglas de negocio en un solo lugar, validadas en ambos lados
Las reglas (40 % del ingreso, plazos permitidos, mínimo de 15 caracteres, máquina de estados, cálculo de cuota) viven en `packages/shared` y las importan **el formulario y la API**. El frontend las usa para la experiencia de usuario; el backend vuelve a validarlas siempre (Zod en la ruta y verificación en el servicio). La regla de historial necesita datos, así que el frontend la consulta en vivo a `GET /api/requests/eligibility` y el backend la vuelve a evaluar dentro de la transacción de creación.

La base de datos agrega una tercera línea de defensa con `CHECK` (40 %, longitud del motivo, presupuesto ≥ 0, plazos válidos).

### 2. Concurrencia e idempotencia en la aprobación
Aprobar descuenta presupuesto, así que una doble ejecución es dinero duplicado. Se combinan cuatro mecanismos (`services/requests.service.ts`):

1. **`Idempotency-Key`** obligatoria en aprobar/rechazar. El cliente genera una clave por intención de decisión; un doble clic o un reintento de red con la misma clave recibe la respuesta original (`Idempotent-Replayed: true`) sin volver a ejecutar nada.
2. **`BEGIN IMMEDIATE`**: la lectura, la validación y la escritura ocurren con el bloqueo de escritura tomado, también entre procesos distintos.
3. **Compare-and-set con bloqueo optimista**: `UPDATE … WHERE id = ? AND status = 'EN_REVISION' AND version = ?`. Si otra operación ganó, se afectan 0 filas → `409`.
4. **Débito condicional**: `UPDATE budget … WHERE available_cents >= ?` más `CHECK (available_cents >= 0)`. Si no alcanza, se revierte toda la transacción (estado, presupuesto y auditoría).

Los eventos de tiempo real se publican **después del COMMIT**, para no anunciar cambios que luego se revierten. La prueba `approval-concurrency.test.ts` lanza 10 aprobaciones simultáneas de dos analistas: exactamente una responde `200`, nueve `409`, y el presupuesto se descuenta una sola vez.

### 3. Resiliencia frente al Buró Crediticio
- El simulador (`/api/mock-bureau/:dpi`) agrega 2–4 s de latencia y devuelve `503` en ~30 % de los casos. El score es determinista por DPI para que la demo sea reproducible.
- El cliente (`services/bureau/bureau.client.ts`) aplica **timeout por intento**, **hasta 4 intentos** y **backoff exponencial con jitter** (1 s, 2 s, 4 s… con tope de 8 s). Solo reintenta errores transitorios (408/429/5xx/red/timeout), nunca un 4xx.
- La consulta corre **en segundo plano**: la API responde de inmediato y el progreso (`CONSULTANDO` con número de intento → `COMPLETADO` / `FALLIDO`) llega por SSE. La interfaz nunca se bloquea.
- Si se agotan los intentos, la solicitud queda `FALLIDO` con un botón **Reintentar**. Se evitan consultas duplicadas en paralelo para la misma solicitud, y al reiniciar el servidor las consultas interrumpidas se marcan como fallidas para que se puedan reintentar.
- Se consulta **al crear** y otra vez **al tomar en revisión** (datos frescos). **No se puede aprobar sin una consulta completada.**

### 4. Seguridad y roles
- Contraseñas con **scrypt** y sal; comparación en tiempo constante; mismo costo para usuarios inexistentes (evita enumeración); bloqueo temporal tras 5 intentos fallidos.
- Sesión en cookie **HttpOnly + SameSite=Strict**, firmada con HMAC. **El rol se lee de la base de datos en cada petición**, nunca del token ni del cliente.
- Autorización en el servidor con `requireRole(...)` en cada ruta. Un solicitante que pide una solicitud ajena recibe `404`, sin revelar que existe. El stream SSE también se filtra por usuario.
- `helmet` (CSP y cabeceras), límite de tamaño del cuerpo, solo JSON en peticiones con cuerpo (mitiga CSRF junto con SameSite) y SQL siempre parametrizado.

### 5. Auditoría inmutable
`audit_log` es de solo inserción: el repositorio no expone métodos de actualización ni borrado, y unos **triggers de SQLite rechazan `UPDATE`/`DELETE`** aunque alguien acceda directamente a la BD. Cada entrada se escribe en la **misma transacción** que el cambio de estado, así que nunca hay un cambio sin auditar ni una auditoría de algo revertido.

### 6. Dinero en centavos
Todos los importes se guardan y operan como **enteros en centavos**, para evitar errores de punto flotante. La tabla de amortización (sistema francés, 1.5 % mensual) ajusta la última cuota para que el saldo cierre exactamente en 0.

### 7. ¿Por qué SQLite y no PostgreSQL?
La especificación permite ambos. SQLite con `node:sqlite` permite levantar el proyecto sin Docker ni dependencias nativas que compilar, y soporta lo que pide la prueba: transacciones serializables (`BEGIN IMMEDIATE`), WAL e índices parciales. El diseño se traslada directo a PostgreSQL: el compare-and-set y el débito condicional funcionan igual, y `BEGIN IMMEDIATE` se reemplazaría por `SELECT … FOR UPDATE` sobre la fila de la solicitud.

### 8. Tiempo real con Server-Sent Events
Las actualizaciones van en un solo sentido (servidor → cliente), así que SSE es más simple que WebSockets, funciona sobre HTTP normal y reconecta solo. Cada evento invalida la caché correspondiente de TanStack Query.

---

## Interpretaciones de la especificación

| Punto | Interpretación adoptada |
| --- | --- |
| “Monto no puede superar el 40 % del ingreso mensual” | Se aplica literalmente: `monto ≤ 0.40 × ingreso`. (En la práctica se suele aplicar a la *cuota*; cambiarlo es una línea en `shared/src/rules.ts`). |
| Estado “PENDIENTE” en la regla de historial | No existe en la máquina de estados; se interpreta como no finalizada (`CREADA` o `EN_REVISION`). Una pendiente bloquea sin importar su antigüedad (además lo garantiza un índice único parcial). |
| “RECHAZADA dentro de los últimos 30 días” | Se cuenta desde la **fecha del rechazo**. El mensaje indica la fecha a partir de la cual se puede volver a solicitar. |
| Documento de identidad | DPI guatemalteco de 13 dígitos. |
| ¿Quién pasa CREADA → EN_REVISION? | El analista, con “Tomar en revisión”. Esa acción vuelve a consultar el buró. |

---

## Pruebas

```
✔ Aprobación: idempotencia y condiciones de carrera
  ✔ 10 aprobaciones simultáneas (2 analistas) descuentan el presupuesto una sola vez
  ✔ doble clic con la misma Idempotency-Key devuelve la respuesta original
  ✔ bloqueo optimista: una versión obsoleta no puede sobrescribir el estado
  ✔ presupuesto insuficiente: rechaza y revierte todo
  ✔ no permite aprobar una solicitud rechazada
✔ API: permisos en servidor, validación y auditoría
✔ Resiliencia del cliente de Buró Crediticio (reintentos, backoff, sin reintentar 4xx)
✔ Reglas: 40 %, historial de 30 días, máquina de estados, motivo ≥ 15, amortización
ℹ tests 25 · pass 25 · fail 0
```

Las pruebas de integración levantan la API real sobre un puerto efímero con una BD en memoria y un buró falso instantáneo (inyectado por el composition root).

## Mejoras con más tiempo
- PostgreSQL con migraciones versionadas y `SELECT … FOR UPDATE`.
- Cola persistente (p. ej. BullMQ) para las consultas al buró y un *circuit breaker* si el proveedor cae por completo.
- Rotación de sesiones / refresh tokens y proveedor de identidad real (OIDC).
- Pruebas end-to-end del frontend con Playwright.
