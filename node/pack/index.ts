/**
 * Transform-then-compress engine.
 *
 * `pack` reshapes data so a codec can do better on it, then compresses it with
 * whichever codec is best available. `unpack` reverses both, using the container
 * header rather than inferring anything.
 *
 * The engine picks by trying: it compresses the candidates it considers
 * plausible and keeps the smallest result, so a transform can never make a
 * payload larger — the untransformed candidate is always in the running.
 */

import {
  ComprexiaFormatError,
  Header,
  TransformId,
  checksum,
  decodeHeader,
  encodeHeader,
} from './container'
import { Codec, codecById, codecByName, defaultCodec } from './codecs'
import {
  byteShuffleInverse,
  byteShuffleTransform,
  columnarJsonInverse,
  columnarJsonTransform,
} from './transforms'

export { availableCodecs } from './codecs'
export { ComprexiaFormatError, TransformId, CodecId } from './container'

export interface PackOptions {
  /** Force a codec by name instead of choosing the best available. */
  codec?: string
  /** Codec-specific compression level. */
  level?: number
  /**
   * Verify that the chosen transform inverts byte-exactly before emitting.
   * On by default. Turning it off trades the guarantee for encode speed.
   */
  verify?: boolean
  /** Element width in bytes for the byte-shuffle transform on binary input. */
  shuffleWidth?: number
}

export interface UnpackOptions {
  /** Cap on decoded size, defaulting to 256 MB. */
  maxOutputLength?: number
}

export interface PackStats {
  originalSize: number
  packedSize: number
  ratio: number
  transform: string
  codec: string
}

const DEFAULT_MAX_OUTPUT = 256 * 1024 * 1024
const TRANSFORM_NAMES: Record<TransformId, string> = {
  [TransformId.None]: 'none',
  [TransformId.ColumnarJson]: 'columnar-json',
  [TransformId.ByteShuffle]: 'byte-shuffle',
}

interface Candidate {
  transform: TransformId
  body: Buffer
}

function applyInverse(transform: TransformId, body: Buffer): Buffer {
  switch (transform) {
    case TransformId.None:
      return body
    case TransformId.ColumnarJson:
      return columnarJsonInverse(body)
    case TransformId.ByteShuffle:
      return byteShuffleInverse(body)
    default:
      throw new ComprexiaFormatError(`unknown transform id ${transform}`)
  }
}

function buildCandidates(input: Buffer, options: PackOptions): Candidate[] {
  const candidates: Candidate[] = [{ transform: TransformId.None, body: input }]

  const columnar = columnarJsonTransform(input)
  if (columnar) candidates.push({ transform: TransformId.ColumnarJson, body: columnar })

  // Only attempted when asked for: guessing an element width on arbitrary bytes
  // produces a worse payload more often than a better one.
  if (options.shuffleWidth) {
    const shuffled = byteShuffleTransform(input, options.shuffleWidth)
    if (shuffled) candidates.push({ transform: TransformId.ByteShuffle, body: shuffled })
  }

  return candidates
}

export function pack(input: Buffer | Uint8Array | string, options: PackOptions = {}): Buffer {
  const source = Buffer.isBuffer(input)
    ? input
    : typeof input === 'string'
      ? Buffer.from(input, 'utf8')
      : Buffer.from(input)

  const codec: Codec = options.codec ? codecByName(options.codec) : defaultCodec()
  const verify = options.verify !== false

  let best: { transform: TransformId; payload: Buffer } | null = null
  for (const candidate of buildCandidates(source, options)) {
    // A transform that does not invert exactly is discarded rather than
    // trusted. This is deliberately paranoid: the previous transform in this
    // codebase corrupted every non-ASCII payload precisely because nothing
    // checked its own claim to be reversible.
    if (verify && candidate.transform !== TransformId.None) {
      try {
        if (!applyInverse(candidate.transform, candidate.body).equals(source)) continue
      } catch {
        continue
      }
    }

    const payload = codec.compress(candidate.body, options.level)
    if (!best || payload.length < best.payload.length) {
      best = { transform: candidate.transform, payload }
    }
  }

  // buildCandidates always includes the identity transform, so this holds.
  if (!best) throw new Error('comprexia: no viable candidate')

  const header: Header = {
    transform: best.transform,
    codec: codec.id,
    originalLength: source.length,
    checksum: checksum(source),
  }
  return Buffer.concat([encodeHeader(header), best.payload])
}

export function unpack(input: Buffer | Uint8Array, options: UnpackOptions = {}): Buffer {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const { header, payloadOffset } = decodeHeader(data)

  const limit = options.maxOutputLength ?? DEFAULT_MAX_OUTPUT
  if (limit !== 0 && header.originalLength > limit) {
    throw new ComprexiaFormatError('output exceeds maximum allowed size')
  }

  const codec = codecById(header.codec)

  // Backend codecs raise their own errors — brotli says only "Decompression
  // failed" — which leaves a caller unable to tell which library rejected their
  // data or why. Everything thrown from here identifies itself.
  let body: Buffer
  try {
    body = codec.decompress(data.subarray(payloadOffset), header.originalLength)
  } catch (cause) {
    throw new ComprexiaFormatError(
      `${codec.name} could not decode the payload — data is corrupt or truncated`,
      { cause }
    )
  }

  let restored: Buffer
  try {
    restored = applyInverse(header.transform, body)
  } catch (cause) {
    throw new ComprexiaFormatError(
      `the ${TRANSFORM_NAMES[header.transform as TransformId]} transform could not be reversed`,
      { cause }
    )
  }

  // The header records what the original looked like, so a transform that fails
  // to invert is caught here instead of being handed back as plausible garbage.
  if (restored.length !== header.originalLength) {
    throw new ComprexiaFormatError(
      `length mismatch: expected ${header.originalLength}, got ${restored.length}`
    )
  }
  if (checksum(restored) !== header.checksum) {
    throw new ComprexiaFormatError('checksum mismatch — data is corrupt')
  }

  return restored
}

/** Packs and reports what the engine chose, for benchmarking and telemetry. */
export function packWithStats(
  input: Buffer | Uint8Array | string,
  options: PackOptions = {}
): { packed: Buffer; stats: PackStats } {
  const source = Buffer.isBuffer(input)
    ? input
    : typeof input === 'string'
      ? Buffer.from(input, 'utf8')
      : Buffer.from(input)

  const packed = pack(source, options)
  const { header } = decodeHeader(packed)

  return {
    packed,
    stats: {
      originalSize: source.length,
      packedSize: packed.length,
      ratio: packed.length / source.length,
      transform: TRANSFORM_NAMES[header.transform as TransformId],
      codec: codecById(header.codec).name,
    },
  }
}
