/**
 * The three flows the shop sells on, driven through the real route with real models.
 *
 * The suite stubs every model, so it proves the wiring and nothing about what the models do
 * with a real sentence. That is how a customer asked one plain question in production and got
 * silence while 699 tests were green. This runs the same webhook the deploy serves: real
 * OpenRouter extraction and writing, real ElevenLabs transcription, the real allowlist, the
 * real pricing engine. Only Telegram is stubbed, because the eval must not message anybody.
 *
 *   bun scripts/eval-flows.ts
 *
 * Flow 1, a price inquiry. The client asks and the owner asks, and both are quoted the number
 * the engine computed. A role decides what you may change, never whether you are answered.
 *
 * Flow 2, a price update. The owner's voice note becomes a proposal he presses, and the
 * catalog moves. The same words from a client move nothing, and that is the allowlist, not
 * the model's judgement.
 *
 * Flow 3, a follow up. The second question names only a quantity, so a price can only come
 * out of what the conversation already holds. It is the writer's memory or it is nothing.
 *
 * Needs OPENROUTER_API_KEY, OPENROUTER_MODEL, ELEVENLABS_API_KEY, ELEVENLABS_MODEL_ID and
 * TELEGRAM_BOT_TOKEN. It spends money on every run.
 */
import '../src/config/load-env'
import { requireEnv } from '../src/config/env'
import type { QuoteIntent } from '../src/domain/types'
import { pesos } from '../src/domain/quote-text'
import { bench as harness, press, text, to, voice, CLIENT, OWNER, type Sent } from './bench'

const ASKS_A_PRICE = 'hola, cuánto me sale 1000 tarjetas personales en papel ilustración 350, frente color y dorso gris?'
const RAISES_A_PRICE = 'Che, subime un 20% todas las tarjetas personales, por favor'

/** What a customer says when Dante asks for the one attribute the question left out. */
const ANSWERS_THE_ASK = 'sin terminación, lisas, tamaño estándar'

/**
 * The follow up. It names a quantity and nothing else, so the paper, the caras and the
 * terminación can only come from what the conversation already holds.
 */
const REFERS_BACK = '¿y en 500?'

/** The attributes the sentence above names, so the eval knows the number before it asks. */
const ASKED_FOR = {
  kind: 'quote',
  family: 'business_cards',
  attributes: { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' },
  size: null,
  addOns: [],
} satisfies QuoteIntent

let failures = 0

function pass(what: string, detail: string): void {
  console.log(`  ok    ${what}: ${detail}`)
}

function fail(what: string, detail: string): void {
  failures += 1
  console.log(`  FAIL  ${what}: ${detail}`)
}

function check(what: string, held: boolean, detail: string): void {
  ;(held ? pass : fail)(what, detail)
}

/** The bench, with the one question these flows ask already bound to it. */
function bench() {
  const built = harness()

  return {
    ...built,
    quoted: () => built.priced(ASKED_FOR),
    /** The same question at another quantity, which is what the follow up asks for. */
    quotedFor: (quantity: number) =>
      built.priced({ ...ASKED_FOR, attributes: { ...ASKED_FOR.attributes, quantity } }),
  }
}

/** How an escalation reads. Not `persona`, which is inside `tarjetas personales`. */
const DELEGATED = /delego|humano|te paso con/i

console.log(`model: ${requireEnv('OPENROUTER_MODEL')}\n`)

console.log('flow 1: a price inquiry is answered, whoever asks')

/**
 * One inquiry, driven to its end. Dante may ask for an attribute the sentence did not name,
 * which is ADR 0005 and not a failure; what it may never do is stay quiet, hand the person to
 * a human, or finish a price conversation without a price. Two turns is the cap: a third
 * question means the catalog is asking more than a customer will answer.
 */
async function inquiry(who: string, label: string): Promise<void> {
  const { sent, deliver, quoted } = bench()
  const expected = pesos(quoted())

  const opened = await deliver(text(who, ASKS_A_PRICE))
  check(`${label} is acknowledged`, opened === 200, `webhook ${opened}`)

  let replies = to(sent, who)
  check(`${label} gets an answer`, replies.length === 1, `${replies.length} sent`)
  check(`${label} is not handed to a person`, !DELEGATED.test(replies[0]?.text ?? ''), JSON.stringify(replies[0]?.text))

  if (!(replies[0]?.text ?? '').includes(expected)) {
    console.log(`        asked back: ${JSON.stringify(replies[0]?.text)}`)
    const answered = await deliver(text(who, ANSWERS_THE_ASK))
    check(`${label} is acknowledged again`, answered === 200, `webhook ${answered}`)
    replies = to(sent, who)
  }

  const last = replies.at(-1)?.text ?? ''

  check(`${label} is quoted the engine price`, last.includes(expected), `expected ${expected}, got ${JSON.stringify(last)}`)
  check(`${label} is never handed to a person`, !DELEGATED.test(last), JSON.stringify(last))
  check(`${label} reaches a price within two turns`, replies.length <= 2, `${replies.length} replies`)
}

await inquiry(CLIENT, 'the client')
await inquiry(OWNER, 'the owner')

console.log('\nflow 2: a price update is the owner\'s, and only his')

{
  const { sent, deliver, quoted } = bench()
  const before = quoted()

  const asked = await deliver(voice(OWNER))
  const proposal = to(sent, OWNER)[0]

  check('the owner is acknowledged', asked === 200, `webhook ${asked}`)
  check('the owner is asked to confirm', proposal?.button !== null && proposal?.button !== undefined, proposal?.text ?? 'nothing sent')
  check('nothing moved before he pressed', quoted() === before, `${pesos(before)} -> ${pesos(quoted())}`)

  if (proposal?.button !== null && proposal?.button !== undefined) {
    const pressed = await deliver(press(OWNER, proposal.button))
    const after = quoted()

    check('the press is acknowledged', pressed === 200, `webhook ${pressed}`)
    check('the raise reached the catalog', after > before, `${pesos(before)} -> ${pesos(after)}`)
  }
}

{
  const { sent, deliver, quoted } = bench()
  const before = quoted()

  const spoken = await deliver(voice(CLIENT))
  const typed = await deliver(text(CLIENT, RAISES_A_PRICE))
  const replies = to(sent, CLIENT)

  check('the client is acknowledged', spoken === 200 && typed === 200, `webhook ${spoken} and ${typed}`)
  check('no button ever reaches a client', replies.every((one) => one.button === null), JSON.stringify(replies.map((one) => one.button)))
  check('the catalog did not move', quoted() === before, `${pesos(before)} -> ${pesos(quoted())}`)
  check('the owner is told, not the client', to(sent, OWNER).length > 0, `${to(sent, OWNER).length} to the owner`)
}

console.log('\nflow 3: the writer remembers the conversation it is in')

{
  const { sent, deliver, quoted, quotedFor } = bench()
  const thousand = pesos(quoted())

  await deliver(text(CLIENT, ASKS_A_PRICE))
  await deliver(text(CLIENT, ANSWERS_THE_ASK))

  const priced = to(sent, CLIENT).at(-1)?.text ?? ''
  check('the client reaches the first price', priced.includes(thousand), `expected ${thousand}, got ${JSON.stringify(priced)}`)

  // Nothing is restated. Only the quantity changes, and only memory can supply the rest.
  await deliver(text(CLIENT, REFERS_BACK))

  const again = to(sent, CLIENT).at(-1)?.text ?? ''
  const five = pesos(quotedFor(500))

  check('a follow up that names only the quantity is priced', again.includes(five), `expected ${five}, got ${JSON.stringify(again)}`)
  check('the follow up is not handed to a person', !DELEGATED.test(again), JSON.stringify(again))
  check('the follow up is not an introduction again', !/^.{0,40}soy dante/i.test(again), JSON.stringify(again.slice(0, 60)))
}

console.log(failures === 0 ? '\nall three flows ran' : `\n${failures} checks failed`)
process.exit(failures === 0 ? 0 : 1)
