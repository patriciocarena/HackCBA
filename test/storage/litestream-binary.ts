import { chmod, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const VERSION = '0.5.17'
const DIRECTORY = '.litestream'

const ARCHITECTURES: Record<string, string> = { arm64: 'arm64', x64: 'x86_64' }

export async function litestreamBin(): Promise<string> {
  const installed = Bun.which('litestream')
  if (installed !== null) return installed

  const path = join(DIRECTORY, 'litestream')
  if (await exists(path)) return path

  await mkdir(DIRECTORY, { recursive: true })
  await download(path)

  return path
}

async function download(path: string): Promise<void> {
  const architecture = ARCHITECTURES[process.arch]
  if (architecture === undefined) throw new Error(`no litestream build for ${process.arch}`)

  const name = `litestream-${VERSION}-${process.platform}-${architecture}.tar.gz`
  const url = `https://github.com/benbjohnson/litestream/releases/download/v${VERSION}/${name}`
  const archive = join(DIRECTORY, name)

  const release = await fetch(url)
  if (!release.ok) throw new Error(`${url} answered ${release.status}`)

  await Bun.write(archive, await release.arrayBuffer())
  await Bun.spawn(['tar', 'xzf', name, 'litestream'], { cwd: DIRECTORY }).exited
  await chmod(path, 0o755)
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}
