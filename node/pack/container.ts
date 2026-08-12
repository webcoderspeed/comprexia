/**
 * Container for transformed-then-compressed payloads.
 *
 * The v0.1 stream format carried no header at all, which meant corruption was
 * undetectable and the format could never change without breaking deployed
 * decoders. It also meant `compressAdvanced` output was indistinguishable from
 * plain output, which shipped as a real interop bug. This container fixes the
 * whole class: the bytes say which transform and which codec produced them, so
 * `unpack` never has to guess and a mismatch is caught rather than decoded into
 * garbage.
 *
 *   magic "CXP1"      4 bytes
 *   transform id      1 byte
 *   codec id          1 byte
 *   flags             1 byte   (reserved, must be 0)
 *   original length   varint   (uncompressed size, for allocation and checking)
 *   checksum          4 bytes  (FNV-1a over the ORIGINAL bytes, little-endian)
 *   payload           rest
 */

export const MAGIC = Buffer.from('CXP1', 'ascii')

export enum TransformId {
  None = 0,
  ColumnarJson = 1,
  ByteShuffle = 2,
}

export enum CodecId {
  Store = 0,
  Gzip = 1,
  Brotli = 2,
  Zstd = 3,
  Cx = 4,
}

export interface Header {
  transform: TransformId
  codec: CodecId
  originalLength: number
  checksum: number
}

export class ComprexiaFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`comprexia: ${message}`, options)
    this.name = 'ComprexiaFormatError'
  }
}

/**
 * FNV-1a. Not cryptographic — its job is to notice corruption and to catch a
 * transform that fails to invert, which is a bug class this project has already
 * shipped once.
 */
export function checksum(data: Buffer | Uint8Array): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i]
    // Multiply by the FNV prime (16777619) using shifts, staying in 32 bits.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash >>> 0
}

function writeVarint(value: number, into: number[]): void {
  let v = value
  while (v >= 0x80) {
    into.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  into.push(v & 0x7f)
}

function readVarint(data: Buffer, offset: number): { value: number; next: number } {
  let value = 0
  let shift = 1
  let i = offset
  for (;;) {
    if (i >= data.length) throw new ComprexiaFormatError('truncated header')
    const byte = data[i++]
    value += (byte & 0x7f) * shift
    if ((byte & 0x80) === 0) break
    shift *= 128
    if (shift > Number.MAX_SAFE_INTEGER) {
      throw new ComprexiaFormatError('length field out of range')
    }
  }
  return { value, next: i }
}

export function encodeHeader(header: Header): Buffer {
  const bytes: number[] = [header.transform, header.codec, 0]
  writeVarint(header.originalLength, bytes)
  const checksumBytes = Buffer.alloc(4)
  checksumBytes.writeUInt32LE(header.checksum, 0)
  return Buffer.concat([MAGIC, Buffer.from(bytes), checksumBytes])
}

export function decodeHeader(data: Buffer): { header: Header; payloadOffset: number } {
  if (data.length < MAGIC.length + 3) {
    throw new ComprexiaFormatError('input too short to be a comprexia container')
  }
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new ComprexiaFormatError('bad magic — not a comprexia container')
  }

  let offset = MAGIC.length
  const transform = data[offset++]
  const codec = data[offset++]
  const flags = data[offset++]

  // Reserved bits are a forward-compatibility hinge: refusing unknown flags now
  // is what lets a later version add semantics without older readers silently
  // misinterpreting the payload.
  if (flags !== 0) {
    throw new ComprexiaFormatError(`unsupported flags 0x${flags.toString(16)}`)
  }
  if (!(transform in TransformId)) {
    throw new ComprexiaFormatError(`unknown transform id ${transform}`)
  }
  if (!(codec in CodecId)) {
    throw new ComprexiaFormatError(`unknown codec id ${codec}`)
  }

  const { value: originalLength, next } = readVarint(data, offset)
  offset = next
  if (offset + 4 > data.length) throw new ComprexiaFormatError('truncated header')
  const stored = data.readUInt32LE(offset)
  offset += 4

  return {
    header: { transform, codec, originalLength, checksum: stored },
    payloadOffset: offset,
  }
}
