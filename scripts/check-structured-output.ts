/**
 * Does the model we ship still honour our schemas? Only a live call can answer that.
 *
 * OpenRouter drops a structured output constraint silently when a property writes its type as
 * an array, and a stub fetch cannot see it: a fake response is whatever the test asked for,
 * whatever the schema said. That is how 551 green tests and a dead model layer happened on the
 * same afternoon. This is the check that would have caught it, and it is a script rather than a
 * test because CI has no keys and the suite must not depend on a paid endpoint.
 *
 *   bun scripts/check-structured-output.ts
 *
 * Three requests. Two send the real schemas and demand JSON back. The third sends a schema with
 * the broken shape put back on purpose, and demands prose, which is what pins the cause rather
 * than the symptom: if that one starts returning JSON, the provider changed and `nullable` is no
 * longer load bearing. Needs OPENROUTER_API_KEY and OPENROUTER_MODEL.
 */
import '../src/config/load-env'
import { businessCards } from '../src/catalog/business-cards'
import { openRouterModel } from '../src/conversation/openrouter'
import { EXTRACTION_SYSTEM, extractionSchema } from '../src/conversation/prompt'
import { READING_SYSTEM, RECEIPT_SCHEMA } from '../src/conversation/receipt-reading'
import { SchemaDropped } from '../src/conversation/structured-output'
import { requireEnv } from '../src/config/env'
import { extractionFromEnv } from '../src/voice/price-edit-intent'

const apiKey = requireEnv('OPENROUTER_API_KEY')
const model = requireEnv('OPENROUTER_MODEL')

const CUSTOMER_MESSAGE = 'hola, cuanto me sale 100 tarjetas en papel especial solo frente?'
const OWNER_TRANSCRIPT = 'Che, subime un 20% todas las tarjetas personales, por favor'

/** The shape this repo removed, restored on one property, to prove the diagnosis still holds. */
function brokenSchema(): object {
  return {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['quote', 'fact', 'admin_edit', 'other'] },
      factKey: { type: ['string', 'null'] },
    },
    required: ['kind', 'factKey'],
    additionalProperties: false,
  }
}

let failures = 0

function pass(what: string, detail: string): void {
  console.log(`  ok    ${what}: ${detail}`)
}

function fail(what: string, detail: string): void {
  failures += 1
  console.log(`  FAIL  ${what}: ${detail}`)
}

console.log(`model: ${model}\n`)

const customer = openRouterModel({ apiKey, model })

/**
 * One pixel, a valid JPEG. The answer does not matter and will not be a receipt; what is being
 * checked is that an image request with a schema comes back as JSON rather than prose.
 */
const ONE_PIXEL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDP/wAALCABAAEABAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAAB/9k='

try {
  const raw = await customer.look({
    system: READING_SYSTEM,
    parts: [
      { type: 'text', text: 'Report what this receipt shows.' },
      { type: 'image_url', image_url: { url: ONE_PIXEL } },
    ],
    schema: RECEIPT_SCHEMA,
  })
  pass('the receipt reading schema is honoured', JSON.stringify(raw))
} catch (error) {
  fail(
    'the receipt reading schema is honoured',
    error instanceof SchemaDropped ? 'the constraint was dropped' : String(error),
  )
}

try {
  const raw = await customer.extract({
    system: EXTRACTION_SYSTEM,
    user: CUSTOMER_MESSAGE,
    schema: extractionSchema(businessCards),
  })
  pass('the customer schema is honoured', JSON.stringify(raw))
} catch (error) {
  fail(
    'the customer schema is honoured',
    error instanceof SchemaDropped ? 'the constraint was dropped' : String(error),
  )
}

try {
  const extracted = await extractionFromEnv().extract(OWNER_TRANSCRIPT)
  if (extracted.ok) {
    pass('the price edit schema is honoured', JSON.stringify(extracted.intent))
  } else {
    // An outage, not a dropped schema. SchemaDropped throws; it does not land here.
    fail('the price edit schema is honoured', `the provider did not answer: ${extracted.reason}`)
  }
} catch (error) {
  fail(
    'the price edit schema is honoured',
    error instanceof SchemaDropped ? 'the constraint was dropped' : String(error),
  )
}

try {
  const raw = await customer.extract({
    system: EXTRACTION_SYSTEM,
    user: CUSTOMER_MESSAGE,
    schema: brokenSchema(),
  })
  fail(
    'an array typed property still loses the constraint',
    `it came back as JSON, ${JSON.stringify(raw)}. The provider changed, so nullable() is no longer load bearing. See the note at the top of src/conversation/structured-output.ts before simplifying it away.`,
  )
} catch (error) {
  if (error instanceof SchemaDropped) {
    pass('an array typed property still loses the constraint', 'prose came back, as expected')
  } else {
    fail('an array typed property still loses the constraint', String(error))
  }
}

console.log(failures === 0 ? '\nall three hold.' : `\n${failures} of 3 failed.`)
process.exit(failures === 0 ? 0 : 1)
