import { describe, expect, test } from 'bun:test'
import { EXTRACTION_REASONS, EXTRACTION_SYSTEM, extractionSchema, INTRODUCTION, WRITING_SYSTEM } from '@/conversation/prompt'
import { NO_MEDIA } from '@/conversation/turn'
import { ADMIN_INTRODUCTION, NOT_LOADED, ONLY_AUDIO, WHAT_I_CAN_DO } from '@/conversation/admin-turn'
import { businessCards } from '@/catalog/business-cards'
import { LOADED_FAMILIES } from '@/catalog/families'

type Arm = { type: string; enum?: (string | number)[] }
type Nullable = { anyOf: [Arm, { type: 'null' }] }
type Schema = {
  properties: {
    family: Nullable
    attributes: { properties: Record<string, Nullable>; required: string[]; additionalProperties: false }
    addOns: { items: { enum: string[] } }
    factKey: Nullable
    reason: Nullable
  }
  additionalProperties: false
}

const schema = extractionSchema(businessCards) as unknown as Schema

/**
 * Every nullable property is read through its arms. Writing the type as `['string', 'null']`
 * is what made OpenRouter drop the constraint, so these tests reach the values the way the
 * honoured shape holds them. That the shape itself is honoured is pinned in
 * `structured-output.test.ts`; this file is about what the values are.
 */
function stated(property: Nullable): Arm {
  return property.anyOf[0]
}

function unanswerable(property: Nullable): boolean {
  return property.anyOf.some((option) => option.type === 'null')
}

describe('the extraction schema is built from the loaded catalog', () => {
  test('an attribute no family declares cannot be answered at all', () => {
    expect(Object.keys(schema.properties.attributes.properties)).toEqual(
      businessCards.attributes.map((attribute) => attribute.name),
    )
    expect(schema.properties.attributes.additionalProperties).toBe(false)
    expect(schema.additionalProperties).toBe(false)
  })

  test('an attribute carries exactly the values the loaded rows carry, and may be left unsaid', () => {
    const quantity = schema.properties.attributes.properties.quantity
    const paper = schema.properties.attributes.properties.paper

    expect(stated(quantity).type).toBe('number')
    expect(stated(quantity).enum).toEqual(
      businessCards.attributes.find((a) => a.name === 'quantity')!.values,
    )
    expect(unanswerable(quantity)).toBe(true)
    expect(stated(paper).type).toBe('string')
    expect(stated(paper).enum).toContain('illustration_350')
    expect(stated(paper).enum).not.toContain('papiro')
    expect(unanswerable(paper)).toBe(true)
  })

  test('no family but the one loaded can be named', () => {
    expect(stated(schema.properties.family).enum).toEqual([businessCards.slug])
    expect(unanswerable(schema.properties.family)).toBe(true)
  })

  test('an add-on is offered by its group, which is what a customer names', () => {
    expect(schema.properties.addOns.items.enum).toEqual(businessCards.addOns)
    expect(schema.properties.addOns.items.enum).toContain('lamination')
  })

  test('every field is required, so a silent omission is not an answer', () => {
    expect(schema.properties.attributes.required).toEqual(businessCards.attributes.map((a) => a.name))
  })
})

describe('the reasons the schema lets extraction raise', () => {
  const offered = stated(schema.properties.reason).enum

  test('are the ones a reader of the message can see, and no reason at all is allowed', () => {
    expect(offered).toEqual([...EXTRACTION_REASONS])
    expect(unanswerable(schema.properties.reason)).toBe(true)
  })

  /**
   * `out_of_catalog` is the one both ends own, and it is the exception that has a reason. The
   * `family` enum offers three of the list's thirty eight, so a message naming any of the other
   * thirty five comes back null, which is what a message naming no product at all comes back
   * as too. Only a reader of the words can tell those apart.
   */
  test('never include one only the engine can see', () => {
    for (const engines of ['no_match', 'ambiguous', 'unsupported_quantity', 'unknown_fact']) {
      expect(offered).not.toContain(engines)
    }
  })
})

/**
 * The shop has a name and Dante says it. What he may not do is call himself an agent: "agente"
 * reads in Spanish as a salesperson working on commission, and the owner heard the old
 * greeting and said so. ADR 0021 is why the disclosure went with it.
 */
describe('Dante names the shop he works for', () => {
  test('the writing system names Multimpresos', () => {
    expect(WRITING_SYSTEM).toContain('Multimpresos')
    expect(INTRODUCTION).toContain('Multimpresos')
  })

  test('neither calls him an agent', () => {
    expect(WRITING_SYSTEM).not.toContain('agente')
    expect(INTRODUCTION).not.toContain('agente')
  })

  test('the introduction gives his name and what he does', () => {
    expect(INTRODUCTION).toContain('Dante')
    expect(INTRODUCTION).toContain('pedidos')
  })

  /**
   * An escalation reaches the customer through the writer, not raw: the detail goes into the
   * respuesta block and the model rewrites it. So dropping "humano" from the constants is half
   * the job. Without this instruction the model paraphrases it straight back in, and the
   * constants read as if the decision had been made.
   */
  test('the writer is told not to say a person is taking over', () => {
    for (const word of ['humano', 'derivo', 'te paso con']) {
      expect(WRITING_SYSTEM).toContain(word)
    }
  })
})

/**
 * The one reply the writer never touches. A voice note or a photo arrives with no text, so
 * neither model runs and the sentence is a constant. It carries its own greeting because an
 * escalation on the first message never reaches INTRODUCTION, which makes it the second place
 * in the repo where Dante introduces himself, and the second place the owner's complaint lands.
 */
describe('the sentence for a message Dante cannot read', () => {
  test('it introduces him the same way the introduction does', () => {
    expect(NO_MEDIA).toContain('Soy Dante')
    expect(NO_MEDIA).toContain('Multimpresos')
  })

  test('it neither calls him automated nor hands the customer to a person', () => {
    expect(NO_MEDIA).not.toMatch(/agente|autom|humano|delego|derivo/i)
  })

  test('it still promises an answer, because nothing else will be said', () => {
    expect(NO_MEDIA).toMatch(/te contestamos/i)
  })
})

/**
 * The same rule ADR 0005 draws for an attribute, drawn for a fact key. It was the one free
 * string in a schema where everything else is an enum, and a free string means extraction
 * guesses the word: "hours" one run, "horario" the next, and the lookup misses a fact that is
 * loaded. A key the shop did not load is now a key extraction cannot name.
 */
describe('the fact keys the schema lets extraction name', () => {
  test('offers exactly the keys the shop loaded', () => {
    const offered = extractionSchema(businessCards, ['hours', 'address']) as unknown as Schema

    expect(stated(offered.properties.factKey).enum).toEqual(['hours', 'address'])
  })

  test('stays answerable with null, because not every message asks about the shop', () => {
    const offered = extractionSchema(businessCards, ['hours']) as unknown as Schema

    expect(unanswerable(offered.properties.factKey)).toBe(true)
  })

  // An empty enum is not a schema OpenRouter can honour, and a shop with no facts loaded still
  // has to be able to extract a quote. It falls back to the open string, which escalates
  // anyway because no key can be found.
  test('offers an open string when nothing is loaded at all', () => {
    const offered = extractionSchema(businessCards, []) as unknown as Schema

    expect(stated(offered.properties.factKey).enum).toBeUndefined()
    expect(stated(offered.properties.factKey).type).toBe('string')
  })
})

/**
 * Three families loaded, one model call. The alternative was a router call to pick the family
 * and a second call for its own tight schema, which doubles latency and cost on every quote and
 * adds a failure mode where the router picks wrong.
 *
 * The union is safe because of the exact match rule, not in spite of it. A paper value that
 * belongs to the cards family, offered in a facturas quote, finds no row and escalates. ADR
 * 0005 still holds: every enum is closed, so extraction cannot invent an attribute or a value.
 */
describe('the extraction schema over every loaded family', () => {
  const many = extractionSchema(LOADED_FAMILIES) as unknown as Schema

  test('offers every loaded family and no other', () => {
    expect(stated(many.properties.family).enum).toEqual(LOADED_FAMILIES.map((family) => family.slug))
    expect(stated(many.properties.family).enum).not.toContain('gigantografias')
  })

  test('a family may be left unsaid, because a first message often does not name one', () => {
    expect(unanswerable(many.properties.family)).toBe(true)
  })

  test('offers the union of every attribute key, and nothing else', () => {
    expect(Object.keys(many.properties.attributes.properties).sort()).toEqual([
      'coverage',
      'finish',
      'format',
      'ink',
      'paper',
      'quantity',
      'sides',
    ])
    expect(many.properties.attributes.additionalProperties).toBe(false)
  })

  test('a key carries the values every family that declares it carries', () => {
    const quantity = stated(many.properties.attributes.properties.quantity)

    expect(quantity.enum).toContain(100)
    expect(quantity.enum).toContain(500)
    expect(quantity.enum).toContain(20)
    expect(quantity.enum).not.toContain(750)
  })

  test('a key declared by two families offers both vocabularies', () => {
    const sides = stated(many.properties.attributes.properties.sides)

    expect(sides.enum).toContain('front_color_back_grayscale')
    expect(sides.enum).toContain('front_and_back')
  })

  test('offers add-on groups namespaced by family, so no group names two jobs', () => {
    expect(many.properties.addOns.items.enum).toContain('facturas:triplicate')
    expect(many.properties.addOns.items.enum).toContain('lamination')
    expect(new Set(many.properties.addOns.items.enum).size).toBe(many.properties.addOns.items.enum.length)
  })

  test('every attribute key is required, so a silent omission is not an answer', () => {
    expect(many.properties.attributes.required.sort()).toEqual(
      Object.keys(many.properties.attributes.properties).sort(),
    )
  })
})

/**
 * The owner's own sentences, which are the third place Dante introduces himself and the only
 * one a customer never reads. ADR 0026: his conversation does not end, so what would have been
 * an escalation is one of these instead, said as written and never through the writer.
 */
/**
 * "Porfavor cotizame 1.000 tarjetas más" is how the customer writes a thousand, and quantity is
 * a number enum: read as 1 it names no value the schema offers, the whole quote comes back null,
 * and the customer who asked for a price is handed to a person instead.
 */
describe('a thousand is written with a dot', () => {
  test('extraction is told which side of the dot the number is on', () => {
    expect(EXTRACTION_SYSTEM).toContain('"1.000" is one thousand')
    expect(EXTRACTION_SYSTEM).toMatch(/dot separates thousands/i)
  })
})

describe('what the owner reads is not what a customer reads', () => {
  test('he gets his own introduction, not the counter’s', () => {
    expect(ADMIN_INTRODUCTION).toContain('Dante')
    expect(ADMIN_INTRODUCTION).not.toContain(INTRODUCTION)
    expect(ADMIN_INTRODUCTION).not.toContain('asesoro y tomo los pedidos')
  })

  // ADR 0021 banned the word where he complained about it, which is the customer's greeting.
  // Here he asked for it. The pin above on INTRODUCTION is what keeps the two apart.
  test('the word he objected to on a customer’s phone is his to use on his own', () => {
    expect(ADMIN_INTRODUCTION).toContain('agente')
    expect(INTRODUCTION).not.toContain('agente')
  })

  // He read it and said the offer lands twice: "estoy a tu servicio" and then "en qué te puedo
  // servir" are the same sentence said twice in one breath.
  test('the introduction offers once, and the offer is a question he can answer', () => {
    expect(ADMIN_INTRODUCTION).toContain('estoy a tu servicio')
    expect(ADMIN_INTRODUCTION).toContain('¿Qué necesitás?')
    expect(ADMIN_INTRODUCTION).not.toContain('servir')
  })

  /**
   * The second time he writes something the engine cannot read, repeating the same offer tells
   * him nothing he did not already know. What replaces it is the three things his channel does,
   * and it is pinned to them: a sentence that offers a fourth is the invention this repo refuses.
   */
  test('after the introduction he is told what Dante can do, not asked again', () => {
    expect(WHAT_I_CAN_DO).toMatch(/audio/i)
    expect(WHAT_I_CAN_DO).toMatch(/precio/i)
    expect(WHAT_I_CAN_DO).toContain('¿Qué necesitás?')
    expect(WHAT_I_CAN_DO).not.toContain('servir')
  })

  test('none of his sentences hands him to a person, because he is the person', () => {
    for (const sentence of [ADMIN_INTRODUCTION, WHAT_I_CAN_DO, NOT_LOADED, ONLY_AUDIO]) {
      expect(sentence).not.toMatch(/humano|delego|derivo|te paso con|te contestamos/i)
    }
  })

  /**
   * What a customer would have been told, reported to the one person who can load it. It must
   * not offer to take the value here: facts come from seed/facts.json, and a sentence promising
   * what Dante cannot do is the invention the rest of this repo is built to refuse.
   */
  test('an unloaded fact names the gap and promises nothing', () => {
    expect(NOT_LOADED).toMatch(/no lo tengo cargado/i)
    expect(NOT_LOADED).not.toMatch(/cargá|mandame|pasame/i)
  })
})
