/**
 * OpenRouter drops a structured output constraint, silently and with a 200, when a property
 * writes its type as an array. `{ type: ['string', 'null'] }` is valid JSON Schema and was the
 * shape every nullable field in this repo took; the provider answers it with markdown prose.
 * The same field as `anyOf: [{ type: 'string' }, { type: 'null' }]` comes back as JSON, and an
 * enum survives inside the arm that carries it.
 *
 * Verified live against `anthropic/claude-sonnet-5` on 2026-09-12. No stub can catch a
 * regression here: a fake fetch returns whatever the test wants whatever the schema said, which
 * is why 551 green tests and a dead model layer were the same afternoon.
 * `scripts/check-structured-output.ts` is the check that can see it.
 */
export function arrayTypedPaths(schema: unknown, path = ''): string[] {
  if (schema === null || typeof schema !== 'object') return []

  if (Array.isArray(schema)) {
    return schema.flatMap((item, index) => arrayTypedPaths(item, `${path}[${index}]`))
  }

  return Object.entries(schema).flatMap(([key, value]) => {
    const here = path === '' ? key : `${path}.${key}`

    if (key === 'type' && Array.isArray(value)) return [here]
    if (key === 'enum' || key === 'required') return []

    return arrayTypedPaths(value, here)
  })
}

/**
 * A nullable property, written the one way OpenRouter honours. The caller writes the arm that
 * carries the real type and its enum; the null arm is this function's whole job, so no call
 * site has to remember that the obvious spelling is the broken one.
 */
export function nullable(arm: object): object {
  return { anyOf: [arm, { type: 'null' }] }
}
