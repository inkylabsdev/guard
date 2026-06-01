import type { Readable } from 'stream'
import type { GuardTarget } from '../types.js'

export async function collectStdin(stream: Readable = process.stdin): Promise<GuardTarget> {
  const parts: string[] = []
  for await (const chunk of stream) {
    parts.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
  }
  return { mode: 'stdin', files: [], raw: parts.join('') }
}
