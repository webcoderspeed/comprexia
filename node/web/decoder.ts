/**
 * Browser decoder for the comprexia stream format.
 *
 * Mirrors the native decoder, including its validation: a back-reference that
 * points before the start of the output is rejected rather than silently
 * reading `undefined` and writing zeros, which is what the previous version
 * did on corrupt input.
 */

export class ComprexiaDecodeError extends Error {
  constructor(message: string) {
    super(`comprexia: ${message}`)
    this.name = 'ComprexiaDecodeError'
  }
}

export function decompressBrowser(input: ArrayBuffer | Uint8Array): Uint8Array {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input)
  const out: number[] = []
  let i = 0

  const copyMatch = (mlen: number, dist: number): void => {
    if (dist === 0 || dist > out.length) {
      throw new ComprexiaDecodeError('invalid back-reference distance')
    }
    const start = out.length - dist
    for (let k = 0; k < mlen; k++) {
      out.push(out[start + k])
    }
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
      for (let k = 0; k < count; k++) out.push(data[i + k])
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

  return new Uint8Array(out)
}

export function decompressToString(input: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('utf-8').decode(decompressBrowser(input))
}
