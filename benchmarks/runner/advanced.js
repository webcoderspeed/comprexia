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

function runAdvancedBenchmark() {
  const buf = loadDataset()
  const iterations = 20

  console.log('🚀 COMPREXIA ADVANCED BENCHMARK - WORLD DOMINATION MODE 🚀\n')

  // Test all Comprexia modes
  const cxBasicC = measure((b) => lib.compress(b), iterations, buf)
  const cxBasicD = measure((b) => lib.decompress(b), iterations, cxBasicC.last)

  const cxJsonC = measure((b) => lib.compressJson(b), iterations, buf)
  const cxJsonD = measure((b) => lib.decompressJson(b), iterations, cxJsonC.last)

  const cxAdvancedC = measure((b) => lib.compressAdvanced(b), iterations, buf)
  const cxAdvancedD = measure((b) => lib.decompressAdvanced(b), iterations, cxAdvancedC.last)

  // Test competitors
  const gzC = measure((b) => zlib.gzipSync(b), iterations, buf)
  const gzD = measure((b) => zlib.gunzipSync(b), iterations, gzC.last)

  const brC = measure((b) => zlib.brotliCompressSync(b), iterations, buf)
  const brD = measure((b) => zlib.brotliDecompressSync(b), iterations, brC.last)

  let lz4C, lz4D, zstdC, zstdD
  
  if (lz4) {
    lz4C = measure((b) => lz4.encode(b), iterations, buf)
    lz4D = measure((b) => lz4.decode(b), iterations, lz4C.last)
  }

  if (zstd && zstd.ZstdCodec) {
    try {
      zstd.ZstdCodec.run((zcodec) => {
        const simple = new zcodec.Simple()
        zstdC = measure((b) => Buffer.from(simple.compress(b)), iterations, buf)
        zstdD = measure((b) => Buffer.from(simple.decompress(b)), iterations, zstdC.last)
      })
    } catch (e) {
      console.warn('zstd not available:', e.message)
    }
  }

  // Prepare results
  const rows = [
    ['algo', 'comp_ratio', 'comp_MBps', 'decomp_MBps'],
    ['cx-basic', ratio(buf, cxBasicC.last).toFixed(3), cxBasicC.mbps.toFixed(1), mbpsFromProcessedBytes(cxBasicD.ms, buf.length * iterations).toFixed(1)],
    ['cx-json', ratio(buf, cxJsonC.last).toFixed(3), cxJsonC.mbps.toFixed(1), mbpsFromProcessedBytes(cxJsonD.ms, buf.length * iterations).toFixed(1)],
    ['cx-advanced', ratio(buf, cxAdvancedC.last).toFixed(3), cxAdvancedC.mbps.toFixed(1), mbpsFromProcessedBytes(cxAdvancedD.ms, buf.length * iterations).toFixed(1)],
    ['gzip', ratio(buf, gzC.last).toFixed(3), gzC.mbps.toFixed(1), mbpsFromProcessedBytes(gzD.ms, buf.length * iterations).toFixed(1)],
    ['brotli', ratio(buf, brC.last).toFixed(3), brC.mbps.toFixed(1), mbpsFromProcessedBytes(brD.ms, buf.length * iterations).toFixed(1)]
  ]

  if (lz4) {
    rows.push(['lz4', ratio(buf, lz4C.last).toFixed(3), lz4C.mbps.toFixed(1), mbpsFromProcessedBytes(lz4D.ms, buf.length * iterations).toFixed(1)])
  }

  if (zstd && zstdC) {
    rows.push(['zstd', ratio(buf, zstdC.last).toFixed(3), zstdC.mbps.toFixed(1), mbpsFromProcessedBytes(zstdD.ms, buf.length * iterations).toFixed(1)])
  }

  // Display results
  const colWidths = [12, 12, 12, 12]
  const line = (cols) => cols.map((c, i) => String(c).padEnd(colWidths[i])).join(' ')
  
  console.log('🏆 COMPREXIA VS THE WORLD - ULTIMATE SHOWDOWN 🏆\n')
  
  rows.forEach((r, i) => {
    if (i === 1) console.log('-'.repeat(colWidths.reduce((a, b) => a + b + 1, 0)))
    console.log(line(r))
  })

  console.log('\n🎯 KEY INSIGHTS:')
  console.log('• cx-advanced: Structure-aware + UTF-8 optimization')
  console.log('• cx-json: JSON token mapping only')
  console.log('• cx-basic: Raw LZ compression (baseline)')
  console.log('\n💡 Comprexia understands your data structure while others see only bytes!')
}

runAdvancedBenchmark()