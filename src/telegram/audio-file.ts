import { API, type Fetch } from './set-webhook'

export type FetchAudio = (mediaId: string) => Promise<Uint8Array<ArrayBuffer> | null>

const FILE_PATH = /^[\w.-]+(\/[\w.-]+)*$/

function readable(path: unknown): path is string {
  return typeof path === 'string' && FILE_PATH.test(path) && !path.split('/').includes('..')
}

export function telegramAudio(token: string, fetchImpl: Fetch = fetch): FetchAudio {
  return async (mediaId) => {
    try {
      const located = await fetchImpl(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(mediaId)}`)
      if (!located.ok) return null

      const body = (await located.json()) as { ok?: boolean; result?: { file_path?: unknown } }
      const path = body.result?.file_path
      if (body.ok !== true || !readable(path)) return null

      const download = await fetchImpl(`${API}/file/bot${token}/${path}`)
      if (!download.ok) return null

      return new Uint8Array(await download.arrayBuffer())
    } catch {
      return null
    }
  }
}
