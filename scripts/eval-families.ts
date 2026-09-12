/**
 * The two new families, driven through the real route with real models.
 *
 * `bun test` stubs extraction, so it proves the engine prices a talonario and nothing about
 * whether a model reading Spanish ever reaches that row. Everything this file checks needed a
 * real model to find: the union attribute bag let extraction name a family from a paper, and
 * with the suite green it asked a business card customer for his ink coverage.
 *
 *   bun run eval:families
 *
 * Real OpenRouter for extraction and writing, real pricing engine, real allowlist. Only
 * Telegram is stubbed. It spends money on every run.
 *
 * Every amount here is computed from the seed by the engine and never typed, which is the rule
 * `docs/pricing-cases.md` is written under too.
 */
import '../src/config/load-env'
import { requireEnv } from '../src/config/env'
import { pesos } from '../src/domain/quote-text'
import type { QuoteIntent } from '../src/domain/types'
import { bench, text, to, voice, CLIENT, OWNER, type Bench, type Sent } from './bench'

/** The escalation wording, a superset of what ADR 0021 retired, as the other two evals keep it. */
const DELEGATED = /confirmo con el local|lo miramos en el local|te contestamos|no lo tengo a mano|delego|deriv|humano|te paso con|no lo tengo cargado/i

let failures = 0

function check(what: string, held: boolean, detail: string): void {
  if (held) {
    console.log(`  ok    ${what}: ${detail}`)

    return
  }

  failures += 1
  console.log(`  FAIL  ${what}: ${detail}`)
}

function said(one: Sent | undefined): string {
  return JSON.stringify(one?.text)
}

function quote(family: string, attributes: Record<string, string | number>, addOns: string[] = []): QuoteIntent {
  return { kind: 'quote', family, attributes, size: null, addOns }
}

/**
 * One conversation, to its end. Dante may ask for an attribute the sentence left out, which is
 * ADR 0005 and not a failure. What it may never do is quote a number the engine did not
 * compute, hand a family it loaded to a person, or take more than two turns to price one job.
 */
async function priced(
  label: string,
  says: string[],
  intent: QuoteIntent,
  answers: string = 'eso es todo',
): Promise<void> {
  const demo: Bench = bench()
  const expected = pesos(demo.priced(intent))

  for (const one of says) {
    const status = await demo.deliver(text(CLIENT, one))
    check(`${label} is acknowledged`, status === 200, `webhook ${status}`)
  }

  let replies = to(demo.sent, CLIENT)
  if (!(replies.at(-1)?.text ?? '').includes(expected)) {
    console.log(`        asked back: ${said(replies.at(-1))}`)
    await demo.deliver(text(CLIENT, answers))
    replies = to(demo.sent, CLIENT)
  }

  const last = replies.at(-1)
  check(`${label} is quoted the engine price`, (last?.text ?? '').includes(expected), `expected ${expected}, got ${said(last)}`)
  check(`${label} is never handed to a person`, !DELEGATED.test(last?.text ?? ''), said(last))
  check(`${label} reaches a price within two turns`, replies.length <= 2, `${replies.length} replies`)
}

console.log(`model: ${requireEnv('OPENROUTER_MODEL')}\n`)

console.log('folletos láser: a family with no module and no add-ons')

await priced(
  '500 folletos pleno frente y dorso',
  ['cuánto 500 folletos láser pleno, frente y dorso'],
  quote('folletos_laser', { quantity: 500, coverage: 'pleno', sides: 'front_and_back' }),
  'pleno, frente y dorso',
)

console.log('\nfacturas: a family whose every modifier is a percentage')

await priced(
  '2 talonarios A4 color',
  ['cuánto 2 talonarios A4 color'],
  quote('facturas', { quantity: 2, format: 'a4', ink: 'color' }),
  'A4, color',
)

await priced(
  '1 talonario por triplicado',
  ['1 talonario 1/2 oficio color por triplicado, cuánto sale?'],
  quote('facturas', { quantity: 1, format: 'half_legal', ink: 'color' }, ['facturas:triplicate']),
  '1/2 oficio, color, por triplicado',
)

// ADR 0023. Summed the two surcharges would come to 26.000 x 2.00, and the customer would be
// charged less than the list states. Only a real extraction can put both add-ons in one bag.
await priced(
  '1 talonario por triplicado y con papel químico',
  ['cuánto 1 talonario 1/2 oficio color por triplicado y con papel químico'],
  quote('facturas', { quantity: 1, format: 'half_legal', ink: 'color' }, [
    'facturas:triplicate',
    'facturas:carbonless',
  ]),
  '1/2 oficio, color, por triplicado y con químico',
)

console.log('\nthree families loaded, and each message has to pick one')

{
  const demo = bench()
  const status = await demo.deliver(text(CLIENT, 'hola, cuánto 1000'))
  const reply = to(demo.sent, CLIENT).at(-1)

  check('a message that names no product is acknowledged', status === 200, `webhook ${status}`)
  // It asks rather than assuming. With one family loaded this was an assumption the engine
  // made silently, and with three it is a wrong price.
  check('it asks what to print instead of picking a family', /imprimir|producto|tarjeta|folleto|talonario/i.test(reply?.text ?? ''), said(reply))
  check('and it does not quote anything', !/\$\s*\d/.test(reply?.text ?? ''), said(reply))
}

{
  const demo = bench()
  await demo.deliver(text(CLIENT, 'cuánto 1000 tarjetas ilustración 350 frente color dorso gris sin terminación y 2 talonarios A4 color'))
  const reply = to(demo.sent, CLIENT).at(-1)

  check('two products in one message are handed to a person', DELEGATED.test(reply?.text ?? ''), said(reply))
  check('and neither of them is quoted', !/\$\s*\d/.test(reply?.text ?? ''), said(reply))
}

{
  const demo = bench()
  await demo.deliver(text(CLIENT, 'cuánto una gigantografía de 2 x 3 metros'))
  const reply = to(demo.sent, CLIENT).at(-1)

  // Thirty five families are in the list and not loaded. Absence is the right answer, and the
  // wrong one is the nearest family that does exist answering for it.
  check('a family nobody loaded is handed to a person', DELEGATED.test(reply?.text ?? ''), said(reply))
  check('and no price is invented for it', !/\$\s*\d/.test(reply?.text ?? ''), said(reply))
}

console.log('\nthe owner names a family, and only that list moves')

{
  const demo = bench()
  await demo.deliver(voice(OWNER))
  const proposal = to(demo.sent, OWNER).at(-1)
  const lines = (proposal?.text ?? '').split('\n').filter((line) => line.includes('→'))

  check('his voice note becomes a proposal', proposal?.button != null, `${lines.length} lines`)
  // The fixture says "subime un 20% las tarjetas personales". Every line has to be a cards row,
  // which is what `namesFamily` returning a list rather than a boolean is for: before it, this
  // diff carried all fifty rows in the array.
  check(
    'the diff carries only the family he named',
    lines.length > 0 && lines.every((line) => /tarjeta/i.test(line)),
    lines.filter((line) => !/tarjeta/i.test(line)).join(' | ') || `${lines.length} lines, all tarjetas`,
  )
}

console.log(failures === 0 ? '\nevery family answered' : `\n${failures} checks failed`)
process.exit(failures === 0 ? 0 : 1)
