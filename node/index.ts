import { Transform } from 'stream'
const addon = require('../build/Release/comprexia.node')

export function compress(input: Buffer): Buffer {
  return addon.compress(input)
}

export function decompress(input: Buffer): Buffer {
  return addon.decompress(input)
}

export function negotiateEncoding(header?: string): 'cx' | undefined {
  if (!header) return undefined
  return header.includes('cx') ? 'cx' : undefined
}

export function createCompressorStream(): Transform {
  const enc = new addon.CxEncoder()
  return new Transform({
    transform(chunk, encStr, cb) {
      try {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any, typeof encStr === 'string' ? encStr : 'utf8')
        const out = enc.chunk(buf)
        cb(null, out)
      } catch (e) {
        cb(e as Error)
      }
    },
    flush(cb) {
      try {
        const out = enc.end()
        if (out && out.length) this.push(out)
        cb()
      } catch (e) {
        cb(e as Error)
      }
    }
  })
}