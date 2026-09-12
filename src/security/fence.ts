import { createHmac, randomBytes } from 'node:crypto'
import type { UntrustedText } from '../domain/types'

const NONCE_LENGTH = 32
const LABEL = /^[a-z][a-z0-9_]*$/

export function fencer(secret: string) {
  return function fence(text: string, label: string): UntrustedText {
    if (!LABEL.test(label)) throw new Error(`fence label ${JSON.stringify(label)} is not a slug`)

    const nonce = createHmac('sha256', secret)
      .update(Buffer.from(`${label} ${text}`, 'utf16le'))
      .digest('hex')
      .slice(0, NONCE_LENGTH)

    return `<${label}:${nonce}>\n${text}\n</${label}:${nonce}>` as UntrustedText
  }
}

/**
 * Unset and empty are different deployments, and `??` read them as the same one.
 *
 * Unset is the case ADR 0008 chose the random fallback for: nobody meant to hold a secret, so
 * nonces are unforgeable and do not survive a restart. Empty is somebody who meant to hold one
 * and does not, which is what copying `.env.example` leaves behind. An empty HMAC key is a legal
 * key, so the process runs, every nonce becomes one any customer can derive, and the fence stops
 * bounding anything while looking exactly as if it does.
 *
 * So it throws. `requireEnv` already treats a present and empty value as unset and refuses it, and
 * absorbing a blank here would make this the one variable in the repo where a blank passes.
 */
export function fenceSecret(value: string | undefined): string {
  if (value === undefined) return randomBytes(32).toString('hex')

  if (value.length === 0) {
    throw new Error(
      'FENCE_SECRET is set and empty. An empty HMAC key makes every fence nonce public. ' +
        'Give it a long random value, or delete the line and take the random per boot secret.',
    )
  }

  return value
}

export const fence = fencer(fenceSecret(process.env.FENCE_SECRET))
