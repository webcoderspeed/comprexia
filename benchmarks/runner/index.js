const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
let lz4 = null
let zstd = null
try { lz4 = require('lz4') } catch {}
try { zstd = require('zstd-codec') } catch {}
const lib = require('../../dist/index.js')

function loadDataset() {
  const p = path.join(__dirname, '../datasets/sample.json')
  const s = fs.readFileSync(p)
  const target = 1 * 1024 * 1024
  const chunks = []
  while (Buffer.concat(chunks).length < target) chunks.push(s)
  return Buffer.concat(chunks)
}

function measure(fn, iterations, input) {
  const start = process.hrtime.bigint()
  let last
  for (let i = 0; i < iterations; i++) last = fn(input)
  const end = process.hrtime.bigint()
  const ns = Number(end - start)
  const ms = ns / 1e6
  const mb = (input.length * iterations) / (1024 * 1024)
  return { ms, mbps: mb / (ms / 1000), last }
}

function mbpsFromProcessedBytes(ms, bytesProcessed) {
  const mb = bytesProcessed / (1024 * 1024)
  return mb / (ms / 1000)
}

function ratio(input, output) {
  return (output.length / input.length)
}

function run() {
  const buf = loadDataset()
  const iterations = 30

  const cxC = measure((b) => lib.compress(b), iterations, buf)
  const gzC = measure((b) => zlib.gzipSync(b), iterations, buf)
  const brC = measure((b) => zlib.brotliCompressSync(b), iterations, buf)

  const cxD = measure((b) => lib.decompress(b), iterations, cxC.last)
  const gzD = measure((b) => zlib.gunzipSync(b), iterations, gzC.last)
  const brD = measure((b) => zlib.brotliDecompressSync(b), iterations, brC.last)

  const rows = [
    ['algo', 'comp_ratio', 'comp_MBps', 'decomp_MBps'],
    ['cx', ratio(buf, cxC.last).toFixed(3), cxC.mbps.toFixed(1), mbpsFromProcessedBytes(cxD.ms, buf.length * iterations).toFixed(1)],
    ['gzip', ratio(buf, gzC.last).toFixed(3), gzC.mbps.toFixed(1), mbpsFromProcessedBytes(gzD.ms, buf.length * iterations).toFixed(1)],
    ['brotli', ratio(buf, brC.last).toFixed(3), brC.mbps.toFixed(1), mbpsFromProcessedBytes(brD.ms, buf.length * iterations).toFixed(1)]
  ]

  if (lz4) {
    const lz4C = measure((b) => lz4.encode(b), iterations, buf)
    const lz4D = measure((b) => lz4.decode(b), iterations, lz4C.last)
    rows.push(['lz4', ratio(buf, lz4C.last).toFixed(3), lz4C.mbps.toFixed(1), mbpsFromProcessedBytes(lz4D.ms, buf.length * iterations).toFixed(1)])
  }

  if (zstd) {
    const results = []
    zstd.ZstdCodec.run((zcodec) => {
      const simple = new zcodec.Simple()
      const zC = measure((b) => Buffer.from(simple.compress(b)), iterations, buf)
      const zD = measure((b) => Buffer.from(simple.decompress(b)), iterations, zC.last)
      results.push(['zstd', ratio(buf, zC.last).toFixed(3), zC.mbps.toFixed(1), mbpsFromProcessedBytes(zD.ms, buf.length * iterations).toFixed(1)])
      const colWidths = [8, 12, 12, 12]
      const line = (cols) => cols.map((c, i) => String(c).padEnd(colWidths[i])).join(' ')
      rows.forEach((r, i) => {
        if (i === 1) console.log('-'.repeat(colWidths.reduce((a, b) => a + b + 1, 0)))
        console.log(line(r))
      })
      results.forEach((r) => console.log(line(r)))
    })
    return
  }

  const colWidths = [8, 12, 12, 12]
  const line = (cols) => cols.map((c, i) => String(c).padEnd(colWidths[i])).join(' ')
  rows.forEach((r, i) => {
    if (i === 1) console.log('-'.repeat(colWidths.reduce((a, b) => a + b + 1, 0)))
    console.log(line(r))
  })
}

run()