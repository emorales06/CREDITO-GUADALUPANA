# Sistema de Aprobación de Créditos y Desembolsos

Aplicación Full-Stack (TypeScript estricto) para registrar solicitudes de crédito, validar reglas de negocio, consultar un Buró Crediticio externo simulado con resiliencia y permitir a analistas aprobar o rechazar con presupuesto global, control de concurrencia y auditoría inmutable en tiempo real.

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19 + Vite, TanStack Query, React Router, Motion |
| Backend | Node.js + Express 5, validación con **Zod** |
| Persistencia | **SQLite** (módulo nativo `node:sqlite`, modo WAL) |
| Pruebas | `node:test` (33 pruebas unitarias y de integración HTTP) |
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
npm test           # 33 pruebas automatizadas
npm run typecheck  # tsc --noEmit en los tres paquetes
```

La base se crea sola en `packages/server/data/creditos.db` con usuarios y solicitudes de ejemplo. Para empezar de cero basta con borrar esa carpeta.

### Usuarios de prueba

La pantalla de inicio de sesión tiene un **selector de usuarios de prueba** (un clic). También se puede escribir:

| Usuario | Contraseña | Rol |
| --- | --- | --- |
| `admin` | `Admin2026!` | Administrador (apariencia, usuarios, resumen del sistema) |
| `ana.lopez` | `Analista2026!` | Analista |
| `carlos.mendez` | `Analista2026!` | Analista (útil para probar dos analistas a la vez) |
| `juan.perez` | `Socio2026!` | Solicitante |
| `maria.garcia` | `Socio2026!` | Solicitante |

También se puede **crear una cuenta** desde el login (queda en espera hasta que el administrador le asigna un rol) y usar **¿Olvidó su contraseña?**.

Datos de ejemplo útiles: el DPI `2233445566778` tiene un rechazo reciente (la regla de 30 días bloquea una solicitud nueva) y `2547896320101` tiene una solicitud pendiente.

---

## Recorrido sugerido para la demo

1. **Solicitante** → *Nueva solicitud*: la tabla de amortización se recalcula mientras se escribe; un monto mayor al 40 % del ingreso o un DPI bloqueado muestran el motivo exacto antes de enviar.
2. Al enviar, la solicitud aparece con el buró en **“Consultando…”**; si el servicio responde 503 se ve el número de intento (*intento 2/4*). Se puede seguir navegando.
3. **Analista** (otra ventana o navegador) → *Panel*: aparece la solicitud nueva sin recargar. *Tomar en revisión* → espera del buró → *Aprobar*. El presupuesto baja con animación en todas las sesiones abiertas.
4. *Auditoría*: cada transición con usuario, rol, marca ISO 8601, estado anterior/nuevo y comentario, en tiempo real.

---

## Roles y cuentas

| Rol | Puede | No puede |
| --- | --- | --- |
| Solicitante | Crear y consultar **sus** solicitudes | Ver solicitudes ajenas, auditoría, presupuesto |
| Analista | Revisar, aprobar, rechazar, ver auditoría y presupuesto | Administrar usuarios o apariencia |
| Administrador | Resumen detallado del sistema, usuarios (alta, rol, activar/desactivar, contraseñas temporales), apariencia (colores, logo, tamaño, botones, densidad, encabezado), consultar solicitudes y auditoría | **Aprobar o rechazar** (segregación de funciones) |

Todos los permisos se verifican **en el servidor** (`requireRole` en cada ruta). La interfaz solo oculta lo que ya está prohibido; quitarlo del menú no da acceso.

- **Registro público:** la cuenta nace **sin rol** y ve una pantalla de espera, que se actualiza sola, hasta que el administrador le asigna uno desde *Usuarios › Cuentas por aprobar*. Mientras tanto el servidor bloquea toda la API (`403 ROLE_PENDING`). Asignar el primer rol no cierra su sesión: entra directo. El esquema es estricto, así que enviar `role` provoca un `400`. Contraseña de 10 caracteres o más, con letra, número y símbolo.
- **Olvido de contraseña:** sin correo en el sistema, la recuperación es asistida. La solicitud llega al administrador, que emite una **contraseña temporal** que se muestra una sola vez. Al entrar, el servidor bloquea toda la API (`403 PASSWORD_CHANGE_REQUIRED`) hasta que el usuario la cambie. La respuesta es idéntica exista o no la cuenta.
- **Cambio de contraseña, desactivación o cambio de rol:** invalidan de inmediato las sesiones abiertas de ese usuario.
- **Apariencia:** el tema se guarda en la base, se valida en el servidor (contraste WCAG mínimo y logo solo PNG/JPG/WEBP de hasta 300 KB; **SVG rechazado** porque puede contener scripts) y se publica en tiempo real a todos los usuarios conectados.
- **Bitácora administrativa** (`admin_audit`): registra altas, cambios de rol y estado, contraseñas y apariencia. Es inmutable por triggers, igual que la auditoría de solicitudes.

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
ℹ tests 33 · pass 33 · fail 0
```

Las pruebas de integración levantan la API real sobre un puerto efímero con una BD en memoria y un buró falso instantáneo (inyectado por el composition root).

## Revisión de seguridad e integridad

Verificado con pruebas automatizadas (33) y revisión manual:

- Contraseñas con scrypt y sal. Sesión HttpOnly + SameSite=Strict firmada con HMAC, con versión ligada al último cambio de credenciales.
- Límites de intentos: inicio de sesión (por usuario y por IP), registro y recuperación (por IP).
- Cuerpos JSON de 16 KB como máximo. Solo `PUT /api/admin/settings/theme` admite 512 KB por el logo, y exige sesión de administrador.
- El último administrador activo no puede quitarse el rol ni desactivarse (evita quedar sin acceso).
- La migración v1 → v2 reconstruye la tabla de usuarios con `PRAGMA foreign_key_check` dentro de la transacción. Se probó sobre una copia de una base con datos.
- `npm audit`: 0 vulnerabilidades.

**Antes de producción:** quitar los botones de usuarios de prueba del login, cambiar la contraseña del `admin` sembrado, definir `SESSION_SECRET` y `COOKIE_SECURE=true` detrás de HTTPS. El bloqueo de 5 intentos fallidos por usuario puede usarse para bloquear a otro a propósito; en producción convendría añadir CAPTCHA o un retraso progresivo.

## Mejoras con más tiempo
- PostgreSQL con migraciones versionadas y `SELECT … FOR UPDATE`.
- Cola persistente (p. ej. BullMQ) para las consultas al buró y un *circuit breaker* si el proveedor cae por completo.
- Rotación de sesiones / refresh tokens y proveedor de identidad real (OIDC).
- Pruebas end-to-end del frontend con Playwright.
