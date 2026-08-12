/**
 * Backend codecs the engine can compress with.
 *
 * The engine's value is the transform stage, not the entropy coder, so it uses
 * whatever proven codec is available rather than insisting on its own. zstd and
 * brotli have had a decade of tuning each; competing with them was the losing
 * race. Composing with them is not.
 */

import * as zlib from 'zlib'
import { CodecId } from './container'

export interface Codec {
  id: CodecId
  name: string
  available: boolean
  compress(input: Buffer, level?: number): Buffer
  decompress(input: Buffer, originalLength: number): Buffer
}

// zstd landed in node:zlib in v23.8; on older runtimes it is simply absent.
const hasZstd =
  typeof (zlib as unknown as Record<string, unknown>).zstdCompressSync === 'function'

const store: Codec = {
  id: CodecId.Store,
  name: 'store',
  available: true,
  compress: (input) => input,
  decompress: (input) => input,
}

const gzip: Codec = {
  id: CodecId.Gzip,
  name: 'gzip',
  available: true,
  compress: (input, level = 6) => zlib.gzipSync(input, { level }),
  decompress: (input) => zlib.gunzipSync(input),
}

const brotli: Codec = {
  id: CodecId.Brotli,
  name: 'brotli',
  available: true,
  compress: (input, level = 5) =>
    zlib.brotliCompressSync(input, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: level,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: input.length,
      },
    }),
  decompress: (input) => zlib.brotliDecompressSync(input),
}

const zstd: Codec = {
  id: CodecId.Zstd,
  name: 'zstd',
  available: hasZstd,
  compress: (input, level = 3) => {
    const fn = (zlib as unknown as Record<string, (b: Buffer, o?: unknown) => Buffer>)
      .zstdCompressSync
    return fn(input, { params: { [(zlib.constants as Record<string, number>).ZSTD_c_compressionLevel]: level } })
  },
  decompress: (input) => {
    const fn = (zlib as unknown as Record<string, (b: Buffer) => Buffer>).zstdDecompressSync
    return fn(input)
  },
}

// The native addon is optional here: the engine is useful without a compiled
// binary, and requiring one would reintroduce the install barrier.
let cxAddon: { compressFast(b: Buffer): Buffer; decompress(b: Buffer, o?: unknown): Buffer } | null =
  null
try {

  cxAddon = require('../../build/Release/comprexia.node')
} catch {
  cxAddon = null
}

const cx: Codec = {
  id: CodecId.Cx,
  name: 'cx',
  available: cxAddon !== null,
  compress: (input) => {
    if (!cxAddon) throw new Error('comprexia: native codec unavailable')
    return cxAddon.compressFast(input)
  },
  decompress: (input, originalLength) => {
    if (!cxAddon) throw new Error('comprexia: native codec unavailable')
    return cxAddon.decompress(input, { maxOutputLength: Math.max(originalLength * 2, 1024) })
  },
}

const ALL: Codec[] = [store, gzip, brotli, zstd, cx]

export function codecById(id: CodecId): Codec {
  const found = ALL.find((c) => c.id === id)
  if (!found) throw new Error(`comprexia: unknown codec id ${id}`)
  if (!found.available) {
    throw new Error(
      `comprexia: payload needs the ${found.name} codec, which this runtime does not provide`
    )
  }
  return found
}

export function codecByName(name: string): Codec {
  const found = ALL.find((c) => c.name === name)
  if (!found) throw new Error(`comprexia: unknown codec "${name}"`)
  if (!found.available) {
    throw new Error(`comprexia: codec "${name}" is not available on this runtime`)
  }
  return found
}

/** Best general-purpose codec present, preferring ratio at similar speed. */
export function defaultCodec(): Codec {
  if (zstd.available) return zstd
  return brotli
}

export function availableCodecs(): string[] {
  return ALL.filter((c) => c.available).map((c) => c.name)
}
