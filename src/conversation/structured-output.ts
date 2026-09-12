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

export type StructuredSource = {
  /** What asked for the schema, in words an operator can find in this repo. */
  port: string
  model: string
}

const PROSE_SHOWN = 400

/**
 * A 200 that came back as prose. Named, because the shape of this failure is a configuration
 * fault in our own schema and not a provider outage, and the two were indistinguishable for a
 * whole afternoon. It reads as an outage: the request succeeded, the model was willing, and the
 * only symptom is a parse error nobody is watching.
 */
export class SchemaDropped extends Error {
  readonly port: string
  readonly model: string
  readonly prose: string

  constructor(source: StructuredSource, prose: string) {
    super(
      `${source.port} lost its schema: ${source.model} returned HTTP 200 with prose, not JSON. ` +
        'That is how OpenRouter reports a structured output constraint it silently refused. ' +
        'Check the schema for a property whose type is an array; nullable belongs in anyOf. ' +
        `What came back: ${clipped(prose)}`,
    )
    this.name = 'SchemaDropped'
    this.port = source.port
    this.model = source.model
    this.prose = prose
  }
}

function clipped(prose: string): string {
  return prose.length <= PROSE_SHOWN ? prose : `${prose.slice(0, PROSE_SHOWN)}... (${prose.length} characters)`
}

/**
 * The only way this repo turns a structured output response into data. A provider that honoured
 * the schema returns JSON, so anything else is the schema having been dropped, and it is raised
 * as that rather than as a parse error at the call site.
 */
export function structuredJson(content: string, source: StructuredSource): unknown {
  try {
    return JSON.parse(content)
  } catch {
    const dropped = new SchemaDropped(source, content)

    // Logged where it is raised, not where it is handled. `turn.ts` catches every resolve
    // failure and turns it into one escalation, which is the right answer for the customer and
    // is also how this stayed invisible: the bot handed the conversation to a person and said
    // nothing about why. A caller is free to swallow the throw; the operator still gets the line.
    console.error(dropped.message)

    throw dropped
  }
}
