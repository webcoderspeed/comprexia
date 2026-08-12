import { Transform } from 'stream'
const addon = require('../build/Release/comprexia.node')

/**
 * Options accepted by every decompression entry point.
 *
 * `maxOutputLength` caps the decoded size and defaults to 256 MB. The cap
 * exists because an extended match block costs five bytes and can emit 65535,
 * so a crafted 100 kB body decodes to over a gigabyte. Set it to `0` to lift
 * the limit, but only for input you produced yourself.
 */
export interface DecompressOptions {
  maxOutputLength?: number
}

export function compress(input: Buffer): Buffer {
  return addon.compress(input)
}

export function decompress(input: Buffer, options?: DecompressOptions): Buffer {
  return addon.decompress(input, options)
}

export function compressJson(input: Buffer): Buffer {
  return addon.compressJson(input)
}

export function compressAdvanced(input: Buffer): Buffer {
  return addon.compressAdvanced(input)
}

export function compressFast(input: Buffer): Buffer {
  return addon.compressFast(input)
}

export function decompressAdvanced(input: Buffer, options?: DecompressOptions): Buffer {
  return addon.decompressAdvanced(input, options)
}

/** Content coding used for payloads from `compressAdvanced`. */
export const ADVANCED_CODING = 'cx-adv'

/**
 * Reports whether a client accepts a content coding, per RFC 9110 §12.5.3.
 *
 * A substring test is not enough: it matches any token that merely contains
 * those letters, and it ignores `;q=0`, which is how a client says a coding is
 * explicitly *not* acceptable. An explicit entry also overrides `*` — in
 * `Accept-Encoding: cx;q=0, *` the wildcard covers only codings not listed, so
 * that header refuses `cx` rather than accepting it.
 */
export function acceptsCoding(header: string | undefined, coding: string): boolean {
  if (!header) return false

  let explicit: number | undefined
  let wildcard: number | undefined

  for (const part of header.split(',')) {
    const [rawToken, ...params] = part.trim().split(';')
    const token = rawToken.trim().toLowerCase()
    if (token !== coding && token !== '*') continue

    const qParam = params
      .map((p) => p.trim().toLowerCase())
      .find((p) => p.startsWith('q='))
    const parsed = qParam ? Number(qParam.slice(2)) : 1
    const quality = Number.isNaN(parsed) ? 1 : parsed

    if (token === coding) explicit = quality
    else wildcard = quality
  }

  const effective = explicit ?? wildcard
  return effective !== undefined && effective > 0
}

export function negotiateEncoding(header?: string): 'cx' | undefined {
  return acceptsCoding(header, 'cx') ? 'cx' : undefined
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

export function createComprexiaMiddleware(opts?: { level?: 'fast' | 'advanced' }) {
  const level = opts?.level || 'fast'
  // Advanced payloads need a transform that only `decompressAdvanced` (or the
  // browser decoder's advanced entry point) reverses. Labelling them `cx` — as
  // this middleware used to — hands clients bytes they decode into corrupt
  // JSON with no way to detect the mismatch, because nothing in the stream
  // distinguishes the two formats. They get their own coding instead.
  const coding = level === 'advanced' ? ADVANCED_CODING : 'cx'

  return (req: any, res: any, next: any) => {
    const originalJson = res.json.bind(res)

    res.json = function (body: any) {
      if (!acceptsCoding(req.headers && req.headers['accept-encoding'], coding)) {
        return originalJson(body)
      }

      // Compress before touching the response. Setting headers first meant a
      // failure here left Content-Encoding: cx committed on a plain-JSON body.
      let out: Buffer
      let originalSize: number
      try {
        const serialized = JSON.stringify(body)
        originalSize = Buffer.byteLength(serialized, 'utf8')
        out = level === 'advanced'
          ? compressAdvanced(Buffer.from(serialized))
          : compressFast(Buffer.from(serialized))
      } catch (_e) {
        return originalJson(body)
      }

      res.setHeader('Content-Encoding', coding)
      // Without Vary, a shared cache can hand an encoded body to a client that
      // never asked for one and cannot decode it.
      res.setHeader('Vary', 'Accept-Encoding')
      res.setHeader('X-Compression-Ratio', (out.length / originalSize).toFixed(3))
      res.setHeader('X-Original-Size', String(originalSize))
      res.setHeader('X-Compressed-Size', String(out.length))
      res.setHeader('Content-Type', 'application/json')
      return res.send(out)
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