import type { CatalogRow, PriceForConfig } from '../domain/price-for'
import type { Fact } from '../domain/facts'
import type { TurnState } from '../domain/types'
import type { InboundMessage } from '../telegram/inbound'

export type Extract = (request: { system: string; user: string; schema: object }) => Promise<unknown>

export type Write = (request: { system: string; user: string }) => Promise<string>

export type TurnDeps = {
  rows: CatalogRow[]
  config: PriceForConfig
  facts: Fact[]
  extract: Extract
  write: Write
}

export type TurnResult = {
  reply: string | null
  state: TurnState
}

export async function turn(
  deps: TurnDeps,
  message: InboundMessage,
  state: TurnState,
): Promise<TurnResult> {
  if (state.escalated) return { reply: null, state }

  return { reply: null, state }
}
