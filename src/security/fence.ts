import { createHash } from 'node:crypto'
import type { UntrustedText } from '../domain/types'

const NONCE_LENGTH = 16
const LABEL = /^[a-z][a-z0-9_]*$/

function digest(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, NONCE_LENGTH)
}

export function fence(text: string, label: string): UntrustedText {
  if (!LABEL.test(label)) throw new Error(`fence label ${JSON.stringify(label)} is not a slug`)

  const nonce = digest(`${label} ${text}`)

  return `<${label}:${nonce}>\n${text}\n</${label}:${nonce}>` as UntrustedText
}
