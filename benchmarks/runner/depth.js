const { compress, decompress, compressAdvanced, decompressAdvanced } = require('../../dist/index.js')
const zlib = require('zlib')
const { ZstdCodec } = require('zstd-codec')

function genLargeJson(count) {
  const arr = []
  for (let i = 0; i < count; i++) {
    arr.push({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      username: `user_${i + 1}`,
      address: {
        street: `Street ${i % 100}`,
        city: `City ${i % 50}`,
        zipcode: `${10000 + (i % 90000)}`,
      },
      posts: Array.from({ length: 5 }, (_, j) => ({
        id: j + 1,
        title: `Post ${j + 1} by ${i + 1}`,
        body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(4),
      })),
    })
  }
  return JSON.stringify({ users: arr })
}

function genNestedJson(depth, breadth) {
  function node(d) {
    if (d === 0) return { v: Math.random(), t: 'leaf' }
    const obj = {}
    for (let i = 0; i < breadth; i++) obj[`k${i}`] = node(d - 1)
    return obj
  }
  return JSON.stringify(node(depth))
}

function genText(sizeKB) {
  const base = 'The quick brown fox jumps over the lazy dog. '
  let out = ''
  while (Buffer.byteLength(out, 'utf8') < sizeKB * 1024) out += base
  return out
}

function measureSync(name, buf, enc, dec) {
  const startC = process.hrtime.bigint()
  const c = enc(buf)
  const endC = process.hrtime.bigint()

  const startD = process.hrtime.bigint()
  const d = dec(c)
  const endD = process.hrtime.bigint()

  const compMs = Number(endC - startC) / 1e6
  const decompMs = Number(endD - startD) / 1e6
  const ratio = c.length / buf.length
  const mb = buf.length / (1024 * 1024)
  const compMBps = mb / (compMs / 1000)
  const decompMBps = mb / (decompMs / 1000)
  console.log(`${name} | size=${buf.length}B -> ${c.length}B ratio=${ratio.toFixed(3)} comp=${compMs.toFixed(2)}ms (${compMBps.toFixed(2)} MB/s) decomp=${decompMs.toFixed(2)}ms (${decompMBps.toFixed(2)} MB/s) ok=${Buffer.compare(buf, d) === 0}`)
}

async function run() {
  console.log('Dataset: large JSON (3k users)')
  const json1 = Buffer.from(genLargeJson(3000))
  console.log('Dataset: deep nested JSON (depth=5,breadth=6)')
  const json2 = Buffer.from(genNestedJson(5, 6))
  console.log('Dataset: text (256KB)')
  const text1 = Buffer.from(genText(256))

  const cases = [
    ['JSON-10k', json1],
    ['JSON-nested', json2],
    ['TEXT-256KB', text1],
  ]

  await new Promise((resolve) => {
    ZstdCodec.run((zstd) => {
      const simple = new zstd.Simple()
      for (const [label, data] of cases) {
        console.log(`\nCase: ${label}`)
        if (label.startsWith('JSON')) {
          measureSync('Comprexia', data, (b) => compressAdvanced(b), (c) => decompressAdvanced(c))
        } else {
          measureSync('Comprexia', data, (b) => compress(b), (c) => decompress(c))
        }
        measureSync('Gzip', data, (b) => zlib.gzipSync(b, { level: 6 }), (c) => zlib.gunzipSync(c))
        measureSync('Brotli', data, (b) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }), (c) => zlib.brotliDecompressSync(c))
        try {
          measureSync('Zstd', data, (b) => Buffer.from(simple.compress(new Uint8Array(b))), (c) => Buffer.from(simple.decompress(new Uint8Array(c))))
        } catch (e) {
          console.log('Zstd | error during compression/decompression')
        }
      }
      resolve()
    })
  })
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})