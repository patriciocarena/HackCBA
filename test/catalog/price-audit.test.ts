import { describe, expect, it } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { auditAgainstList, type AuditedFamily } from '../../src/catalog/price-audit'
import { parsePriceList } from '../../src/catalog/price-list'

const list = `
<div class="rule"><b>Los precios no incluyen IVA.</b></div>
<section>
  <h2>Tarjetas personales</h2>
  <h3>Uno</h3>
  <table>
    <tr><td>100 tarjetas color sólo frente</td><td class="p">$ 12.100</td><td class="p">$ 10.300</td></tr>
    <tr class="mod"><td><span class="tag a">adicional</span>Laminado</td><td class="p">$ 5.100</td><td class="p na">—</td></tr>
  </table>
</section>
`

const cards = parsePriceList(list).families[0] as AuditedFamily

describe('the seed is checked against the list it was typed from', () => {
  it('passes an item whose amount the list actually states', () => {
    const audit = auditAgainstList([{ id: 'a', price: 12100 }], cards)

    expect(audit.wrong).toEqual([])
  })

  // The failure this exists for. A hand typed seed loses a digit and every test stays green,
  // because every test asserts the number the seed declares.
  it('names an item carrying an amount the list does not', () => {
    const audit = auditAgainstList([{ id: 'a', price: 1210 }], cards)

    expect(audit.wrong).toEqual([{ id: 'a', price: 1210 }])
  })

  it('names an amount the list states that no item carries', () => {
    const audit = auditAgainstList([{ id: 'a', price: 12100 }], cards)

    expect(audit.unclaimed).toContain(10300)
    expect(audit.unclaimed).toContain(5100)
  })

  // Two rows priced the same are two rows, so one seed item cannot answer for both.
  it('counts repeats rather than matching one amount twice', () => {
    const twice = parsePriceList(
      `<div class="rule"><b>Los precios no incluyen IVA.</b></div>
       <section><h2>X</h2><h3>Y</h3><table>
         <tr><td>uno</td><td class="p">$ 900</td></tr>
         <tr><td>otro</td><td class="p">$ 900</td></tr>
       </table></section>`,
    ).families[0] as AuditedFamily

    expect(auditAgainstList([{ id: 'a', price: 900 }], twice).unclaimed).toEqual([900])
    expect(auditAgainstList([{ id: 'a', price: 900 }, { id: 'b', price: 900 }], twice).unclaimed).toEqual([])
  })

  // A dash is a column the row is not offered in, so it is not an amount anybody must claim.
  it('never asks the seed to claim a dash', () => {
    expect(auditAgainstList([], cards).unclaimed).not.toContain(null)
  })
})

/**
 * The real cards family states "Diseño (mínimo)" at $20.000 once per table, because it applies
 * to both. The seed carries it once with `applies_to_family: true`, which is the correct
 * normalisation and not a missing row. An audit that reported it would teach the team to
 * ignore the audit.
 */
describe('a row the list repeats is one row', () => {
  function twice(kind: 'adicional' | '', label: string, price: string) {
    const tag = kind === '' ? '' : `<span class="tag a">${kind}</span>`
    const tr = `<tr class="${kind === '' ? '' : 'mod'}"><td>${tag}${label}</td><td class="p">${price}</td></tr>`

    return parsePriceList(
      `<div class="rule"><b>Los precios no incluyen IVA.</b></div>
       <section><h2>X</h2>
         <h3>Una</h3><table>${tr}</table>
         <h3>Otra</h3><table>${tr}</table>
       </section>`,
    ).families[0] as AuditedFamily
  }

  it('asks one item to claim an add-on the list states once per table', () => {
    const family = twice('adicional', 'Diseño (mínimo)', '$ 20.000')

    expect(auditAgainstList([{ id: 'design', price: 20000 }], family).unclaimed).toEqual([])
  })

  // Same amount, different rows. Those are two things to load and the audit must still say so.
  it('still counts two different rows that happen to cost the same', () => {
    const family = parsePriceList(
      `<div class="rule"><b>Los precios no incluyen IVA.</b></div>
       <section><h2>X</h2><h3>Y</h3><table>
         <tr><td>Puntas redondeadas x 100</td><td class="p">$ 2.200</td></tr>
         <tr><td>Corte extra</td><td class="p">$ 2.200</td></tr>
       </table></section>`,
    ).families[0] as AuditedFamily

    expect(auditAgainstList([{ id: 'a', price: 2200 }], family).unclaimed).toEqual([2200])
  })

  // The other half of the rule, and the one the cards family breaks if you only write the
  // first. Two laminations at $6.800 sit in one table, told apart by the sale row each follows.
  it('keeps two identical rows that sit inside the same table', () => {
    const family = parsePriceList(
      `<div class="rule"><b>Los precios no incluyen IVA.</b></div>
       <section><h2>X</h2><h3>Y</h3><table>
         <tr><td>100 frente y dorso</td><td class="p">$ 20.200</td></tr>
         <tr class="mod"><td><span class="tag a">adicional</span>Laminado</td><td class="p">$ 6.800</td></tr>
         <tr><td>200 sólo frente</td><td class="p">$ 21.600</td></tr>
         <tr class="mod"><td><span class="tag a">adicional</span>Laminado</td><td class="p">$ 6.800</td></tr>
       </table></section>`,
    ).families[0] as AuditedFamily

    // One item claims one of them, so the other is still owed. The sale rows nobody seeded are
    // unclaimed too, which is the same check doing its job on the rest of the table.
    expect(auditAgainstList([{ id: 'one', price: 6800 }], family).unclaimed).toContain(6800)
  })
})

/**
 * The guard, not a demo. It reads the two committed files and fails the suite the day the
 * price list moves and the seed does not, or the day somebody types a digit wrong into either.
 * Nothing else in the suite can catch that: every other test asserts the number the seed
 * declares, so a seed and a list that disagree are green everywhere but here.
 */
describe('the committed seed against the committed price list', () => {
  it('states every amount the list states for cards, and no amount it does not', async () => {
    const html = await Bun.file('seed/lista-precios.html').text()
    const cards = parsePriceList(html).families.find((one) => one.label === 'Tarjetas personales')

    expect(cards).toBeDefined()

    const audit = auditAgainstList(
      seed.items.map((item) => ({ id: item.id, price: item.price })),
      cards as AuditedFamily,
    )

    expect(audit.wrong).toEqual([])
    expect(audit.unclaimed).toEqual([])
  })

  // ADR 0020. The seed still says the opposite, on purpose and until after the demo, so this
  // pins what the list says rather than what the seed does.
  it('reads the list as net, which is what ADR 0020 is about', async () => {
    const html = await Bun.file('seed/lista-precios.html').text()

    expect(parsePriceList(html).vatIncluded).toBe(false)
    expect(seed.vat_included).toBe(true)
  })
})
