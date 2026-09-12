import { describe, expect, test } from 'bun:test'
import { claimsConfirmation, confirmsPending, NOTHING_PENDING } from '@/conversation/owner-confirm'
import { inMemorySale } from '@/conversation/sale'
import { priceFor } from '@/domain/price-for'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { conversationId, type Resolution } from '@/domain/types'
import type { Actor } from '@/domain/order'
import { intent, OFFSET_1000 } from '@test/support/fixtures'

const ALIAS = 'dante.imprenta.mp'
const now = '2026-09-12T13:00:00.000Z'
const owner: Actor = { kind: 'person', id: '99900011' }
const onlyAdmin = (id: string) => id === '99900011'
const priced: Resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)

function aSaleAwaiting(...chatIds: string[]) {
  let minted = 0
  const sale = inMemorySale({ alias: ALIAS, now: () => now, id: () => `id_${(minted += 1)}` })

  for (const chatId of chatIds) {
    const conversation = conversationId('telegram', chatId, 'customer')
    sale.hold(conversation, priced)
    sale.accept(conversation, { kind: 'person', id: chatId })
  }

  return sale
}

function aSender(): { sent: { chatId: string; text: string }[]; send: (chatId: string, text: string) => Promise<void> } {
  const sent: { chatId: string; text: string }[] = []

  return { sent, send: async (chatId, text) => void sent.push({ chatId, text }) }
}

/**
 * The words the owner actually types. He typed "confirmado" on his own channel and read the
 * greeting back, because nothing in `src/` confirmed a deposit: the vision path was the only
 * way in, so a receipt it refused left the customer waiting on a confirmation nobody could give.
 */
describe('what counts as the owner confirming', () => {
  test('the ways he says it', () => {
    for (const said of ['confirmado', 'confirmo', 'confirmá esa seña', 'dale, confirmado', 'ya cobré', 'entró la plata']) {
      expect(claimsConfirmation(said)).toBeTrue()
    }
  })

  test('and what is not a confirmation, so a price question is still a price question', () => {
    for (const said of ['quiero mil tarjetas mas', 'cuánto sale la seña?', 'subí las tarjetas un 20%', 'hola']) {
      expect(claimsConfirmation(said)).toBeFalse()
    }
  })
})

describe('the owner confirms the deposit by typing it', () => {
  test('one order waiting is the one confirmed, and the customer is told', async () => {
    const sale = aSaleAwaiting('4242')
    const sender = aSender()
    const confirm = confirmsPending({ sale, isAdmin: onlyAdmin, send: sender.send })

    const read = await confirm(owner)
    const order = sale.orderFor(conversationId('telegram', '4242', 'customer'))

    expect(order?.state).toBe('deposit_confirmed')
    expect(order?.depositConfirmedBy).toBe('99900011')
    expect(read).toContain(order!.id)
    expect(sender.sent).toHaveLength(1)
    expect(sender.sent[0]?.chatId).toBe('4242')
    expect(sender.sent[0]?.text).toMatch(/seña/i)
  })

  test('nothing waiting says so, and confirms nothing', async () => {
    const sale = aSaleAwaiting()
    const sender = aSender()

    expect(await confirmsPending({ sale, isAdmin: onlyAdmin, send: sender.send })(owner)).toBe(NOTHING_PENDING)
    expect(sender.sent).toEqual([])
  })

  test('two orders waiting confirms neither, and names both, because money is not a guess', async () => {
    const sale = aSaleAwaiting('4242', '5353')
    const sender = aSender()
    const confirm = confirmsPending({ sale, isAdmin: onlyAdmin, send: sender.send })

    const read = await confirm(owner)

    expect(sale.orderFor(conversationId('telegram', '4242', 'customer'))?.state).toBe('deposit_pending')
    expect(sale.orderFor(conversationId('telegram', '5353', 'customer'))?.state).toBe('deposit_pending')
    for (const order of sale.awaitingDeposit()) expect(read).toContain(order.id)
    expect(sender.sent).toEqual([])
  })

  test('the order he names is the one that moves, when more than one waits', async () => {
    const sale = aSaleAwaiting('4242', '5353')
    const sender = aSender()
    const named = sale.awaitingDeposit()[1]!
    const confirm = confirmsPending({ sale, isAdmin: onlyAdmin, send: sender.send })

    await confirm(owner, named.id)

    expect(sale.orderFor(named.conversationId)?.state).toBe('deposit_confirmed')
    expect(sale.orderFor(conversationId('telegram', '4242', 'customer'))?.state).toBe('deposit_pending')
  })

  test('a sender the allowlist does not know confirms nothing', async () => {
    const sale = aSaleAwaiting('4242')
    const sender = aSender()
    const confirm = confirmsPending({ sale, isAdmin: onlyAdmin, send: sender.send })

    const read = await confirm({ kind: 'person', id: '4242' })

    expect(sale.orderFor(conversationId('telegram', '4242', 'customer'))?.state).toBe('deposit_pending')
    expect(read).not.toContain('Listo')
    expect(sender.sent).toEqual([])
  })

  test('a customer who cannot be reached leaves the deposit confirmed anyway', async () => {
    const sale = aSaleAwaiting('4242')
    const confirm = confirmsPending({
      sale,
      isAdmin: onlyAdmin,
      send: async () => { throw new Error('telegram sendMessage 403') },
    })

    await confirm(owner)

    expect(sale.orderFor(conversationId('telegram', '4242', 'customer'))?.state).toBe('deposit_confirmed')
  })
})
