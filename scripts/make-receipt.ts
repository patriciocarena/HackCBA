/**
 * The demo's transfer receipt, rendered from the alias the app is actually configured with.
 *
 * The vision path confirms on an exact match: the amount has to equal what the order owes and
 * the destination has to equal DEPOSIT_ALIAS, compared case insensitively after trimming
 * (src/domain/deposit.ts, sameDestination). A fixture drawn by hand goes stale the moment the
 * alias changes and the failure lands on camera, so the image is generated from the env.
 *
 *   bun scripts/make-receipt.ts [amount]
 *
 * Chrome renders it and sips converts it, because receiptReader labels every image
 * image/jpeg. No dependency is added for a picture that is drawn once.
 */
import '../src/config/load-env'
import { requireEnv } from '../src/config/env'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'fixtures/receipt.jpg'

// What the demo order owes: the 1000 offset row is listed net at 45.000 and the engine
// grosses it up once (ADR 0020). A fixture at the list amount is refused as wrong_amount.
const amount = Number(process.argv[2] ?? 54450)
if (!Number.isInteger(amount)) throw new Error(`not a whole number of pesos: ${process.argv[2]}`)

const alias = requireEnv('DEPOSIT_ALIAS')
const html = receiptHtml(amount, alias)
const page = `${process.env.TMPDIR ?? '/tmp'}receipt-${amount}.html`
const shot = `${process.env.TMPDIR ?? '/tmp'}receipt-${amount}.png`

await Bun.write(page, html)

const rendered = Bun.spawnSync([
  CHROME,
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--window-size=520,860',
  `--screenshot=${shot}`,
  `file://${page}`,
])
if (rendered.exitCode !== 0) throw new Error(`chrome: ${rendered.stderr.toString()}`)

const converted = Bun.spawnSync(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '90', shot, '--out', OUT])
if (converted.exitCode !== 0) throw new Error(`sips: ${converted.stderr.toString()}`)

console.log(`${OUT}: ${pesos(amount)} to ${alias}, ${(Bun.file(OUT).size / 1024).toFixed(0)} KB`)

function pesos(value: number): string {
  return `$${value.toLocaleString('es-AR')}`
}

/**
 * A home banking transfer screenshot. Plain type, high contrast and the two fields the reader
 * is asked for stated once each: a receipt that says the amount three different ways is a
 * receipt the model can read three different numbers off.
 */
function receiptHtml(amount: number, alias: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 16px/1.5 -apple-system, system-ui, sans-serif; color: #101828; background: #f2f4f7; }
  .sheet { background: #fff; min-height: 860px; padding: 32px 28px; }
  .bank { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: #667085; }
  .done { margin: 28px 0 4px; font-size: 22px; font-weight: 600; }
  .when { color: #667085; font-size: 14px; }
  .amount { margin: 28px 0; font-size: 44px; font-weight: 700; letter-spacing: -.02em; }
  dl { margin: 0; border-top: 1px solid #eaecf0; }
  dt { font-size: 13px; color: #667085; padding-top: 18px; }
  dd { margin: 2px 0 18px; font-size: 17px; border-bottom: 1px solid #eaecf0; padding-bottom: 16px; }
  dd.mono { font-family: ui-monospace, Menlo, monospace; font-size: 19px; letter-spacing: .04em; word-break: break-all; }
  .ref { margin-top: 28px; font-size: 13px; color: #98a2b3; }
</style>
<div class="sheet">
  <div class="bank">Banco Naci&oacute;n &middot; Comprobante</div>
  <div class="done">Transferencia realizada</div>
  <div class="when">12/09/2026 &middot; 19:42 hs</div>
  <div class="amount">${pesos(amount)}</div>
  <dl>
    <dt>Destino</dt>
    <dd class="mono">${alias}</dd>
    <dt>Titular</dt>
    <dd>MULTIMPRESOS SRL</dd>
    <dt>Origen</dt>
    <dd class="mono">0170099220000012345678</dd>
    <dt>Concepto</dt>
    <dd>Se&ntilde;a tarjetas</dd>
  </dl>
  <div class="ref">Operaci&oacute;n 8842-107934</div>
</div>`
}
