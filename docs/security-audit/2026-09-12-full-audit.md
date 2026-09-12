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
| N1 | 🟢 Bajo/Info | Sin guardrail de salida contra fuga de system prompt en redacción — mitigado porque no hay secretos/authz embebidos en el prompt | `src/conversation/prompt.ts`, `turn.ts` (amountsHold) |
| L1 | 🟢 Bajo | Bot token en URL en set-webhook.ts | `src/telegram/set-webhook.ts` |
| L2 | 🟢 Bajo | Texto de error de proveedor sin sanitizar en script manual | `scripts/` |

## Recomendación

**Antes de la demo:** H1 y H2 son los únicos que tocan costo real o
disponibilidad. El resto puede esperar sin riesgo.

**No se implementó nada todavía.** Este reporte es para decidir en
equipo qué se toca antes del corte de features y qué queda como deuda
documentada.

## Detalle de cada hallazgo

[pegar acá el texto completo que te dio Claude Code para cada uno,
con evidencia archivo:línea]