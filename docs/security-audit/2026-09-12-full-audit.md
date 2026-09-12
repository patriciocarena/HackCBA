# Auditoría de seguridad — Dante, 2026-09-12

Auditoría completa sobre `main` (post E1-E9): inyección, auth, secretos,
DoS, lógica de negocio, dependencias, logging, y fuga de system prompt.
Metodología: revisión estática de código + skills de seguridad de Claude
Code (security-review, testing-for-system-prompt-leakage adaptado a
análisis estático).

## Resumen por severidad

| ID | Severidad | Hallazgo | Dónde iría el fix |
|----|-----------|----------|---------------------|
| H1 | 🟠 Alto | Sin tope de reintentos en confirmación de comprobantes — costo de visión ilimitado por conversación | `src/domain/deposit.ts` |
| H2 | 🟠 Alto | Sin rate limiting en el webhook (D8) | `src/telegram/webhook.ts` |
| M1 | 🟡 Medio | FENCE_SECRET degrada en silencio si falta, en vez de fallar el boot | `src/security/fence.ts` |
| M2 | 🟡 Medio | Race condition en TurnState (ya conocida por el equipo) | `src/conversation/customer-turn.ts` |
| M3 | 🟡 Medio | /health/db sin auth, hace escritura real de DB sin rate limit | `src/health/route.ts` |
| N1 | 🟠 Medio | Sin guardrail de salida. `amountsHold` fue eliminado (ADR 0027), así que un redactor que obedece un precio inyectado lo dice: el importe que llega al cliente ya no se verifica contra el que calculó el motor | `src/conversation/prompt.ts`, `turn.ts` |
| L1 | 🟢 Bajo | Bot token en URL en set-webhook.ts | `src/telegram/set-webhook.ts` |
| L2 | 🟢 Bajo | Texto de error de proveedor sin sanitizar en script manual | `scripts/` |

## Recomendación

**Antes de la demo:** H1 y H2 son los únicos que tocan costo real o
disponibilidad. El resto puede esperar sin riesgo.

## Resolución

Cada hallazgo se verificó contra el código antes de tocar nada. Tres eran
reales y se arreglaron. Cinco no, y abajo está por qué.

| ID | Resolución |
|----|------------|
| H1 | Arreglado — tope de tres lecturas de visión por pedido |
| H2 | Arreglado — límite de tasa por remitente en el webhook |
| M3 | Arreglado — la escritura de `/health/db` va a una por ventana |
| M1 | Rechazado — es una decisión tomada, ADR 0008 |
| M2 | Fuera de alcance — la carrera se cierra con la tabla de A3 |
| N1 | Rechazado — el propio reporte lo marca informativo |
| L1 | Rechazado — Telegram pone el token en la URL por diseño |
| L2 | Rechazado — un script de desarrollo imprimiendo a una terminal |

## Detalle de cada hallazgo

### H1 — visión sin tope (arreglado)

`src/conversation/receipt-path.ts` llamaba `fetchImage` y `readImage` por
cada foto, mientras el pedido siguiera en `deposit_pending`. Nada contaba
los intentos. Un cliente que manda comprobantes en loop paga una llamada
de visión real por foto, sin techo.

**Fix:** `maxReadings` en `ReceiptPathDeps`, tres por defecto, contado por
`order.id`. Pasado el tope el comprobante se guarda igual — la evidencia
nunca depende de un modelo — y no se descarga ni se mira. Verdicto nuevo
`too_many`, con su frase: al dueño se le dice que lo revise una persona.
El texto no gasta presupuesto porque el texto no llega al modelo.

**Nota sobre la ubicación:** el reporte apuntaba a `src/domain/deposit.ts`.
Ese módulo es puro y no conoce la visión; la llamada vive en
`receipt-path.ts`, y ahí está el tope.

### H2 — webhook sin límite de tasa (arreglado)

`src/telegram/webhook.ts` tenía las otras dos mitades de `D8`, el secreto
en header y el dedupe, y ninguna cuesta nada a quien tiene el secreto y
manda mil mensajes distintos. `docs/amenazas.md` #6 ya decía "límite de
tasa"; no existía.

**Fix:** `src/telegram/rate-limit.ts`, ventana deslizante en memoria,
veinte por minuto y por remitente. Se pregunta antes del dedupe y antes
del log, así una avalancha no engorda ninguno de los dos. Lo que se tira
responde 200 y no 429: cualquier otro estado hace que Telegram reintente,
y el reintento es la avalancha otra vez.

Por remitente y no por IP: todas las requests llegan de las direcciones de
Telegram, así que la IP no distingue a nadie.

### M3 — `/health/db` sin auth (arreglado)

`src/health/route.ts` escribía una fila por cada GET sin autenticar. Un
loop de GET es un loop de escrituras contra el volumen.

**Fix:** `throttledBeat` en `src/health/heartbeat.ts`. Una escritura por
ventana de diez segundos; adentro de la ventana se responde el último
latido sin tocar la base, y las requests concurrentes comparten la
escritura en vuelo. Un fallo no se cachea.

No se le puso auth: un health check de plataforma no tiene credencial que
ofrecer, y pedirle una lo vuelve inútil. El techo al costo es el arreglo.

### M1 — `FENCE_SECRET` degrada en silencio (rechazado)

`src/security/fence.ts:20` cae a `randomBytes(32)` cuando la variable no
está. Eso es la decisión de ADR 0008, escrita ahí con su argumento:
aleatorio por boot es infalsificable y no sobrevive un reinicio; fijo y
conocido es el modo de falla que evita. `docs/deploy.md:132` lo documenta.
La auditoría no leyó el ADR. Si se quisiera cambiar, el cambio es al ADR
primero.

### M2 — carrera en `TurnState` (fuera de alcance)

Real, y ya marcada en `src/conversation/customer-turn.ts:20`. Es el `Map`
en memoria: dos mensajes de una conversación que se superponen leen el
mismo estado y gana la última escritura. El arreglo es la tabla de A3, con
la transacción adentro, no un parche acá.

### N1 — sin guardrail de salida (rechazado)

El propio reporte lo gradúa informativo y dice por qué: el prompt no lleva
secretos ni autorización. De acuerdo. Un filtro de salida acá agrega una
superficie sin quitar una.

### L1 — token en la URL (rechazado)

La API de Telegram pone el token en el path. `src/telegram/send.ts` y
`src/telegram/audio-file.ts` hacen lo mismo porque no hay otra forma.
`set-webhook.ts:46` loguea la URL del webhook, no el token. No hay nada
que arreglar sin cambiar de proveedor.

### L2 — error de proveedor sin sanitizar (rechazado)

`scripts/dictate.ts` imprime un motivo de fallo a la terminal de quien lo
corre a mano. No es un sink: no llega a un cliente, ni a un log
compartido, ni a un prompt.