/**
 * Browser decoder for the comprexia stream format.
 *
 * Mirrors the native decoder, including its validation: a back-reference that
 * points before the start of the output is rejected rather than silently
 * reading `undefined` and writing zeros.
 */

export class ComprexiaDecodeError extends Error {
  constructor(message: string) {
    super(`comprexia: ${message}`)
    this.name = 'ComprexiaDecodeError'
  }
}

export interface DecodeOptions {
  /**
   * Caps the decoded size, defaulting to 256 MB. An extended match block costs
   * five bytes and can emit 65535, so a crafted 100 kB body decodes to over a
   * gigabyte. Set to `0` to lift the limit — only for input you produced.
   */
  maxOutputLength?: number
}

const DEFAULT_MAX_OUTPUT = 256 * 1024 * 1024

/**
 * Interned literals substituted by `compressAdvanced`, in token order.
 *
 * This table is duplicated from src/cx_core/preprocessor.cpp and MUST stay in
 * the same order — a token is an index into it. test/node/defects.test.js
 * compresses with the native encoder and decodes here to catch any drift.
 */
const INTERNED = [
  '"id"', '"name"', '"title"', '"description"',
  '"type"', '"value"', '"created"', '"updated"',
  '"timestamp"', '"date"', '"time"', '"user"',
  '"author"', '"email"', '"url"', '"link"',
]
const TOK_COMMON_BASE = 0xe0
const TOK_TRUE = 0xf0
const TOK_FALSE = 0xf1
const TOK_NULL = 0xf2
const TOK_ESCAPE = 0xff

/** Growable byte buffer. A plain number[] costs ~8 bytes per decoded byte. */
class ByteSink {
  private buf: Uint8Array
  private len = 0

  constructor(initial: number) {
    this.buf = new Uint8Array(Math.max(initial, 64))
  }

  get length(): number {
    return this.len
  }

  at(index: number): number {
    return this.buf[index]
  }

  private ensure(extra: number): void {
    const needed = this.len + extra
    if (needed <= this.buf.length) return
    let capacity = this.buf.length * 2
    while (capacity < needed) capacity *= 2
    const grown = new Uint8Array(capacity)
    grown.set(this.buf.subarray(0, this.len))
    this.buf = grown
  }

  pushByte(value: number): void {
    this.ensure(1)
    this.buf[this.len++] = value
  }

  pushRange(source: Uint8Array, start: number, count: number): void {
    this.ensure(count)
    this.buf.set(source.subarray(start, start + count), this.len)
    this.len += count
  }

  /** Copies forward from an earlier offset; overlap is intentional (run-length). */
  copyFrom(start: number, count: number): void {
    this.ensure(count)
    for (let k = 0; k < count; k++) {
      this.buf[this.len + k] = this.buf[start + k]
    }
    this.len += count
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len)
  }
}

export function decompressBrowser(
  input: ArrayBuffer | Uint8Array,
  options?: DecodeOptions
): Uint8Array {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input)
  const maxOutput = options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT
  const out = new ByteSink(data.length * 3)
  let i = 0

  const guard = (extra: number): void => {
    if (maxOutput !== 0 && out.length + extra > maxOutput) {
      throw new ComprexiaDecodeError('output exceeds maximum allowed size')
    }
  }

  const copyMatch = (mlen: number, dist: number): void => {
    if (dist === 0 || dist > out.length) {
      throw new ComprexiaDecodeError('invalid back-reference distance')
    }
    guard(mlen)
    out.copyFrom(out.length - dist, mlen)
  }

  while (i < data.length) {
    const h = data[i++]

    if (h === 0xff) {
      if (i + 4 > data.length) {
        throw new ComprexiaDecodeError('truncated extended match block')
      }
      const mlen = data[i] | (data[i + 1] << 8)
      i += 2
      const dist = data[i] | (data[i + 1] << 8)
      i += 2
      copyMatch(mlen, dist)
    } else if ((h & 0x80) === 0) {
      const count = h
      if (i + count > data.length) {
        throw new ComprexiaDecodeError('truncated literal block')
      }
      guard(count)
      out.pushRange(data, i, count)
      i += count
    } else {
      const mlen = (h & 0x7f) + 3
      if (i + 2 > data.length) {
        throw new ComprexiaDecodeError('truncated match block')
      }
      const dist = data[i] | (data[i + 1] << 8)
      i += 2
      copyMatch(mlen, dist)
    }
  }

  return out.toUint8Array()
}

/** Reverses the substitution transform that `compressAdvanced` applies. */
function expandTokens(data: Uint8Array): Uint8Array {
  const out = new ByteSink(data.length + (data.length >> 2))
  const pushString = (s: string): void => {
    for (let k = 0; k < s.length; k++) out.pushByte(s.charCodeAt(k))
  }

  let i = 0
  while (i < data.length) {
    const c = data[i]

    if (c === TOK_ESCAPE) {
      if (i + 1 < data.length) {
        out.pushByte(data[i + 1])
        i += 2
      } else {
        out.pushByte(c)
        i += 1
      }
      continue
    }

    if (c >= TOK_COMMON_BASE && c < TOK_COMMON_BASE + INTERNED.length) {
      pushString(INTERNED[c - TOK_COMMON_BASE])
    } else if (c === TOK_TRUE) {
      pushString('true')
    } else if (c === TOK_FALSE) {
      pushString('false')
    } else if (c === TOK_NULL) {
      pushString('null')
    } else {
      out.pushByte(c)
    }
    i++
  }

  return out.toUint8Array()
}

/**
 * Decodes a payload produced by `compressAdvanced`, which the plain decoder
 * cannot read — the two formats are not interchangeable, and nothing in the
 * bytes distinguishes them. Servers signal advanced payloads with
 * `Content-Encoding: cx-adv`.
 */
export function decompressAdvancedBrowser(
  input: ArrayBuffer | Uint8Array,
  options?: DecodeOptions
): Uint8Array {
  return expandTokens(decompressBrowser(input, options))
}

export function decompressToString(
  input: ArrayBuffer | Uint8Array,
  options?: DecodeOptions
): string {
  return new TextDecoder('utf-8').decode(decompressBrowser(input, options))
}

export function decompressAdvancedToString(
  input: ArrayBuffer | Uint8Array,
  options?: DecodeOptions
): string {
  return new TextDecoder('utf-8').decode(decompressAdvancedBrowser(input, options))
}
