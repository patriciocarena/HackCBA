/**
 * The live demo, driven end to end before anybody stands up.
 *
 * Four flows, one per action in `docs/demo-live.md`, in the order they are performed and
 * against one bench, because that is what the demo is: the client's order has to survive the
 * owner's price raise, and four independent flows would never catch the day it stops doing so.
 *
 *   bun run eval:demo
 *
 * Real OpenRouter for extraction, writing and the receipt, real ElevenLabs for the voice note,
 * real pricing engine, real allowlist. Only Telegram is stubbed. It spends money on every run.
 *
 * The pasted text is copied from the runbook and must stay copied from it. An eval that asks a
 * better question than the demo does proves nothing about the demo.
 */
import '../src/config/load-env'
import { requireEnv } from '../src/config/env'
import { pesos } from '../src/domain/quote-text'
import type { QuoteIntent } from '../src/domain/types'
import { bench, photo, press, text, to, voice, CLIENT, OWNER, type Sent } from './bench'

/** Action 1, both pastes. */
const OPENS = 'hola, cuánto 1000 tarjetas'
const ANSWERS = '1000, ilustración 350, frente full color y dorso en escala de grises, sin terminación'

/** Action 2. */
const ACCEPTS = 'dale, la quiero'

/** What the two pastes name, so the eval knows the number before it asks. */
const ASKED_FOR = {
  kind: 'quote',
  family: 'business_cards',
  attributes: { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' },
  size: null,
  addOns: [],
} satisfies QuoteIntent

const ALIAS = requireEnv('DEPOSIT_ALIAS')

/** How an escalation reads. Not `persona`, which is inside `tarjetas personales`. */
const DELEGATED = /delego|humano|te paso con/i

/** The owner's verdict line for a receipt the agent confirmed by itself. */
const CONFIRMED_ALONE = /lo confirmé solo/i

let failures = 0

/** What action 2 printed and action 4 reads back, and the button action 3 leaves for action 4. */
let workOrder = ''
let button: string | null = null

function check(what: string, held: boolean, detail: string): void {
  if (held) {
    console.log(`  ok    ${what}: ${detail}`)

    return
  }

  failures += 1
  console.log(`  FAIL  ${what}: ${detail}`)
}

function said(one: Sent | undefined): string {
  return JSON.stringify(one?.text ?? null)
}

/** Long enough for a send nobody awaited, short enough that a missing one still fails. */
function settles(): Promise<void> {
  return new Promise((done) => setTimeout(done, 250))
}

const demo = bench()
const listed = demo.priced(ASKED_FOR)
const raised = Math.round(listed * 1.2)

console.log(`model: ${requireEnv('OPENROUTER_MODEL')}`)
console.log(`list: ${pesos(listed)}, after a 20% raise: ${pesos(raised)}\n`)

console.log('action 1: the client asks for a price')

{
  const opened = await demo.deliver(text(CLIENT, OPENS))
  check('the client is acknowledged', opened === 200, `webhook ${opened}`)

  const first = to(demo.sent, CLIENT)[0]
  check('the client gets one answer', to(demo.sent, CLIENT).length === 1, `${to(demo.sent, CLIENT).length} sent`)
  check('it says it is automated', /automátic|automatic/i.test(first?.text ?? ''), said(first))
  check('it is not handed to a person', !DELEGATED.test(first?.text ?? ''), said(first))

  // Everything missing in one message, which is the beat the runbook narrates. Two of the
  // three named is the pass: the third is often implied by the sentence it asks in.
  const asked = ['papel', 'car', 'terminaci'].filter((one) => (first?.text ?? '').toLowerCase().includes(one))
  check('it asks for what is missing at once', asked.length >= 2, `named ${asked.length} of 3, ${said(first)}`)

  const answered = await demo.deliver(text(CLIENT, ANSWERS))
  check('the answer is acknowledged', answered === 200, `webhook ${answered}`)

  const quoted = to(demo.sent, CLIENT).at(-1)
  check('the client is quoted the engine price', (quoted?.text ?? '').includes(pesos(listed)), `expected ${pesos(listed)}, got ${said(quoted)}`)
  check('the price is reached in two turns', to(demo.sent, CLIENT).length === 2, `${to(demo.sent, CLIENT).length} replies`)
  check('no button ever reaches a client', to(demo.sent, CLIENT).every((one) => one.button === null), 'none')
}

console.log('\naction 2: the client accepts, and the agent confirms the money')

{
  const before = to(demo.sent, OWNER).length

  const accepted = await demo.deliver(text(CLIENT, ACCEPTS))
  const reserved = to(demo.sent, CLIENT).at(-1)

  check('the acceptance is acknowledged', accepted === 200, `webhook ${accepted}`)
  check('the order is reserved at the quoted price', (reserved?.text ?? '').includes(pesos(listed)), said(reserved))
  check('the client is given the alias', (reserved?.text ?? '').includes(ALIAS), said(reserved))

  const replies = to(demo.sent, CLIENT).length
  const sent = await demo.deliver(photo(CLIENT))

  // The job is sent from a confirm the domain makes synchronously, so it is in flight when
  // the webhook answers. On stage that is a screen that fills a beat later; here it is a
  // check that has to wait for it rather than read the list too early.
  await settles()

  const owner = to(demo.sent, OWNER).slice(before)

  check('the receipt is acknowledged', sent === 200, `webhook ${sent}`)
  check('the owner is told a receipt arrived', owner.length >= 1, `${owner.length} to the owner`)
  // Which of the two lands first is the microtask queue's business, so both are found by what
  // they say. The owner's screen fills in whichever order on the night too.
  const verdict = owner.find((one) => CONFIRMED_ALONE.test(one.text))
  const order = owner.find((one) => one.text.startsWith('ORDEN'))

  check('the agent confirmed it with nobody pressing anything', verdict !== undefined, said(verdict))
  check('the owner gets the work order', order !== undefined, said(order))
  check('the work order carries the agreed price', (order?.text ?? '').includes(pesos(listed)), said(order))
  check('the work order says the deposit is confirmed', /seña confirmada/i.test(order?.text ?? ''), said(order))

  // Known and narrated in docs/demo-live.md: only the owner's screen moves. Asserted so the
  // day it changes, the runbook is what is wrong and not the demo.
  check(
    'the client is not answered after the photo, as the runbook warns',
    to(demo.sent, CLIENT).length === replies,
    `${to(demo.sent, CLIENT).length - replies} replies to the client`,
  )

  // The punchline of action 4 is read off this text, so it has to exist before the raise.
  workOrder = order?.text ?? ''
}

console.log('\naction 3: the owner raises prices by voice')

{
  const spoken = await demo.deliver(voice(OWNER))
  const proposal = to(demo.sent, OWNER).at(-1)

  check('the voice note is acknowledged', spoken === 200, `webhook ${spoken}`)
  check('the owner is asked to confirm', proposal?.button != null, said(proposal))
  check('the proposal shows the row from action 1', (proposal?.text ?? '').includes(`${pesos(listed)} → ${pesos(raised)}`), said(proposal))
  check('nothing moved before he pressed', demo.priced(ASKED_FOR) === listed, `${pesos(listed)} -> ${pesos(demo.priced(ASKED_FOR))}`)

  button = proposal?.button ?? null
}

console.log('\naction 4: the owner confirms, and the sold order holds its price')

{
  if (button === null) {
    check('the press is possible', false, 'action 3 sent no button, so there is nothing to press')
  } else {
    const pressed = await demo.deliver(press(OWNER, button))
    const after = demo.priced(ASKED_FOR)

    check('the press is acknowledged', pressed === 200, `webhook ${pressed}`)
    check('the raise reached the catalog', after === raised, `expected ${pesos(raised)}, got ${pesos(after)}`)
  }

  check('the sold order still reads the old price', workOrder.includes(pesos(listed)), `expected ${pesos(listed)} in the work order`)
  check('the sold order never reads the new one', !workOrder.includes(pesos(raised)), `${pesos(raised)} must not appear`)
}

console.log(failures === 0 ? '\nthe demo runs' : `\n${failures} checks failed`)
process.exit(failures === 0 ? 0 : 1)
