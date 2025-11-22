export function decompressBrowser(input: ArrayBuffer): Uint8Array {
  const data = new Uint8Array(input)
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const h = data[i++]
    if (h === 0xff) {
      if (i + 4 > data.length) break
      const mlen = data[i] | (data[i + 1] << 8)
      i += 2
      const dist = data[i] | (data[i + 1] << 8)
      i += 2
      const start = out.length - dist
      for (let k = 0; k < mlen; k++) {
        out.push(out[start + k])
      }
    } else if ((h & 0x80) === 0) {
      let count = h
      if (i + count > data.length) count = data.length - i
      for (let k = 0; k < count; k++) {
        out.push(data[i + k])
      }
      i += count
    } else {
      const mlen = (h & 0x7f) + 3
      if (i + 2 > data.length) break
      const dist = data[i] | (data[i + 1] << 8)
      i += 2
      const start = out.length - dist
      for (let k = 0; k < mlen; k++) {
        out.push(out[start + k])
      }
    }
  }
  return new Uint8Array(out)
}

export function decompressToString(input: ArrayBuffer): string {
  const bytes = decompressBrowser(input)
  return new TextDecoder('utf-8').decode(bytes)
}