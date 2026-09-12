import { describe, expect, it } from 'bun:test'
import { parsePriceList, type PriceListRow } from '../../src/catalog/price-list'

const CARDS = `
<div class="rule">
  <b>Los precios no incluyen IVA.</b> Se cotiza siempre como precio más IVA.<br>
  <b>Validez.</b> Un presupuesto vale 15 días.
</div>
<section>
  <h2>Tarjetas personales</h2>
  <h3>Papeles especiales, tramados y perlados / papel ilustración 300g</h3>
  <table>
    <tr><th class="l">Producto</th><th>Papel especial</th><th>Papel ilustración 300g</th></tr>
    <tr><td>100 tarjetas color sólo frente</td><td class="p">$ 12.100</td><td class="p">$ 10.300</td></tr>
    <tr class="mod"><td><span class="tag a">adicional</span>Laminado</td><td class="p">$ 5.100</td><td class="p na">—</td></tr>
    <tr class="mod"><td><span class="tag d">descuento</span>100 tarjetas 4/0 o 4/4, descontar</td><td class="p">$ 1.800</td></tr>
  </table>
  <h3>Offset papel ilustración 350g x 1000</h3>
  <table>
    <tr><td>Tarjetas full color 300g<div class="note">Frente full color, dorso escala de grises (4/1)</div></td><td class="p">$ 45.000</td></tr>
    <tr class="mod"><td colspan="2"><span class="tag d">descuento</span>Módulos: 3 a 5 -10% / 6 a 8 -15%</td></tr>
  </table>
</section>
<section>
  <h2>Gigantografías</h2>
  <div class="rule"><b>Mínimo de impresión.</b> 0,50 m².</div>
  <table>
    <tr><th class="l">Material</th><th>Unidad</th><th>ECO</th></tr>
    <tr><td>Lona FRONT brillante 13oz</td><td class="u">m²</td><td class="p">$ 13.000</td></tr>
    <tr><td>Portabanner</td><td class="u">unidad</td><td class="p cons">a consultar</td></tr>
  </table>
</section>
<section>
  <h3>Aclaraciones</h3>
  <table class="chg">
    <tr><td>a</td><td>IVA</td><td>Los precios son sin IVA.</td></tr>
  </table>
</section>
`

const list = parsePriceList(CARDS)
const cards = list.families[0]!
const giant = list.families[1]!

function rowNamed(label: string): PriceListRow {
  return cards.tables.flatMap((table) => table.rows).find((row) => row.label === label)!
}

describe('what the list says about itself', () => {
  // ADR 0020. The header governs the whole list, so no family loaded from it can arrive with
  // the flag guessed by whoever wrote its seed.
  it('reads the VAT statement rather than taking it from a human', () => {
    expect(list.vatIncluded).toBe(false)
  })

  it('says so when the list declares the other way', () => {
    expect(parsePriceList('<div class="rule"><b>Los precios incluyen IVA.</b></div>').vatIncluded).toBe(true)
  })

  // Neither guess is safe, and a parser that picks one writes a wrong price into a seed.
  it('refuses to guess when the list says nothing about VAT', () => {
    expect(() => parsePriceList('<section><h2>X</h2></section>')).toThrow(/IVA/)
  })
})

describe('the families and their tables', () => {
  it('reads one family per section, named by its heading', () => {
    expect(list.families.map((family) => family.label)).toEqual(['Tarjetas personales', 'Gigantografías'])
  })

  it('keeps each table under the heading that introduces it', () => {
    expect(cards.tables.map((table) => table.heading)).toEqual([
      'Papeles especiales, tramados y perlados / papel ilustración 300g',
      'Offset papel ilustración 350g x 1000',
    ])
  })

  it('names the columns a two column table prices against', () => {
    expect(cards.tables[0]!.columns).toEqual(['Papel especial', 'Papel ilustración 300g'])
  })
})

describe('what a row is', () => {
  it('reads a sale row and its price in whole pesos', () => {
    expect(rowNamed('100 tarjetas color sólo frente')).toMatchObject({
      kind: 'sale',
      prices: [12100, 10300],
    })
  })

  it('reads the tag that makes a row an add-on', () => {
    expect(rowNamed('Laminado').kind).toBe('add_on')
  })

  it('reads the tag that makes a row a discount', () => {
    expect(rowNamed('100 tarjetas 4/0 o 4/4, descontar').kind).toBe('discount')
  })

  // An empty cell is confirmed to mean the finish is not offered, so it is not a zero and it
  // is not a missing price. It is a column this row does not have.
  it('reads a dash as not offered, and never as free', () => {
    expect(rowNamed('Laminado').prices).toEqual([5100, null])
  })

  it('reads "a consultar" as a price no engine may state', () => {
    expect(giant.tables[0]!.rows[1]!.prices).toEqual(['on_request'])
  })

  // The note carries the 4/1 and 4/4 a human needs to write the attribute bag, and it is not
  // part of the label the seed matches on.
  it('keeps a row note beside the label rather than inside it', () => {
    expect(rowNamed('Tarjetas full color 300g').note).toBe(
      'Frente full color, dorso escala de grises (4/1)',
    )
  })

  it('reads a module discount line as a discount carrying no price', () => {
    expect(rowNamed('Módulos: 3 a 5 -10% / 6 a 8 -15%')).toMatchObject({ kind: 'discount', prices: [] })
  })
})

/**
 * Three things the excerpt above would have let through and the real 60KB file did not. The
 * parser was written against a section that happens to use every shape, and six of the
 * twenty families use none of them.
 */
describe('the shapes the real list uses and the excerpt did not', () => {
  it('keeps a table that sits under no subheading of its own', () => {
    expect(giant.tables).toHaveLength(1)
    expect(giant.tables[0]!.heading).toBe('')
    expect(giant.tables[0]!.rows[0]!.label).toBe('Lona FRONT brillante 13oz')
  })

  // The client plan's unit_kind, stated per row in the list's own column. Gigantografías is
  // m2 in most rows and metro lineal in the ones that say so, and that is the row's to declare.
  it('reads the unit column a row prices in', () => {
    expect(giant.tables[0]!.rows[0]!.unit).toBe('m²')
    expect(giant.tables[0]!.rows[1]!.unit).toBe('unidad')
  })

  it('leaves a row with no unit column undeclared rather than guessing one', () => {
    expect(rowNamed('100 tarjetas color sólo frente').unit).toBeUndefined()
  })

  it('does not price a unit column as if it were money', () => {
    expect(giant.tables[0]!.rows[0]!.prices).toEqual([13000])
  })

  // The clarifications are prose in a table, and a section of them is not a family.
  it('is not fooled by a section of prose tables into loading a family of nothing', () => {
    expect(list.families.map((family) => family.label)).toEqual(['Tarjetas personales', 'Gigantografías'])
  })
})
