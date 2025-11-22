import { Transform } from 'stream'
const addon = require('../build/Release/comprexia.node')

export function compress(input: Buffer): Buffer {
  return addon.compress(input)
}

export function decompress(input: Buffer): Buffer {
  return addon.decompress(input)
}

export function compressJson(input: Buffer): Buffer {
  return addon.compressJson(input)
}

export function compressAdvanced(input: Buffer): Buffer {
  return addon.compressAdvanced(input)
}

export function decompressAdvanced(input: Buffer): Buffer {
  return addon.decompressAdvanced(input)
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

export function createComprexiaMiddleware() {
  return (req: any, res: any, next: any) => {
    const originalJson = res.json.bind(res)
    res.json = function (body: any) {
      const enc = negotiateEncoding(req.headers && req.headers['accept-encoding'])
      if (enc === 'cx') {
        try {
          const s = JSON.stringify(body)
          const originalSize = Buffer.byteLength(s, 'utf8')
          const out = compressAdvanced(Buffer.from(s))
          const compressedSize = out.length
          const ratio = compressedSize / originalSize
          res.setHeader('Content-Encoding', 'cx')
          res.setHeader('X-Compression-Ratio', ratio.toFixed(3))
          res.setHeader('X-Original-Size', String(originalSize))
          res.setHeader('X-Compressed-Size', String(compressedSize))
          return res.set('Content-Type', 'application/json').send(out)
        } catch (_e) {
          return originalJson(body)
        }
      }
      return originalJson(body)
    }
    next()
  }
}

export function compressionStatsMiddleware() {
  return (_req: any, res: any, next: any) => {
    const originalSend = res.send.bind(res)
    res.send = function (body: any) {
      if (res.getHeader && res.getHeader('Content-Encoding') === 'cx') {
        originalSend(body)
        return
      }
      return originalSend(body)
    }
    next()
  }
}