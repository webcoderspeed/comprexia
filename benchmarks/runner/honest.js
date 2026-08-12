// Honest benchmark: realistic payloads, real-world codec settings.
//
// Two rules this suite exists to enforce:
//
// 1. Datasets must look like traffic, not like a compression demo. The older
//    runner concatenated one sample file until it hit 1 MB, which is almost
//    pure repetition — every LZ codec scores absurdly well on that and the
//    numbers mean nothing.
// 2. Competitors run at the settings people actually deploy. Comparing
//    against brotli quality 11 (an offline-asset setting) makes us look fast;
//    servers compressing dynamic JSON use brotli 4-5 and gzip 6.

const zlib = require('zlib')
const lib = require('../../dist/index.js')

let lz4 = null
try { lz4 = require('lz4') } catch { /* optional: no Windows prebuild */ }

const FIRST_NAMES = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vikram', 'Priya']
const LAST_NAMES = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Khan', 'Bose', 'Gupta']
const CITIES = ['Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Hyderabad', 'Chennai']
const TAGS = ['premium', 'trial', 'churned', 'beta', 'enterprise', 'referral']

// Deterministic PRNG so runs are comparable across machines and commits.
let seed = 0x2545f491
function rand() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 0xffffffff
}
const pick = (arr) => arr[Math.floor(rand() * arr.length) % arr.length]
const int = (n) => Math.floor(rand() * n)

function apiListResponse(count) {
  const data = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: 100000 + i,
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      email: `${pick(FIRST_NAMES).toLowerCase()}.${i}@example.com`,
      city: pick(CITIES),
      active: rand() > 0.3,
      score: Number((rand() * 100).toFixed(2)),
      createdAt: `2026-0${1 + int(9)}-${10 + int(18)}T09:${10 + int(49)}:00Z`,
      tags: [pick(TAGS), pick(TAGS)],
    })
  }
  return Buffer.from(JSON.stringify({ success: true, page: 1, total: count, data }))
}

function nestedResponse(count) {
  const data = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      author: { id: int(5000), name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, verified: rand() > 0.8 },
      content: { title: `Post ${i}`, body: 'Lorem ipsum dolor sit amet, '.repeat(2 + int(4)) },
      metrics: { views: int(100000), likes: int(5000), shares: int(500) },
      comments: Array.from({ length: int(4) }, (_, k) => ({
        id: `${i}-${k}`,
        author: pick(FIRST_NAMES),
        text: 'Great write-up, thanks for sharing.',
      })),
    })
  }
  return Buffer.from(JSON.stringify({ data }))
}

// Non-ASCII is not an edge case for an Indian API — it is the payload.
function multilingualResponse(count) {
  const names = ['संजीव शर्मा', 'प्रिया नायर', 'কবির বসু', 'அன்யா ஐயர்', 'રોહન પટેલ']
  const cities = ['दिल्ली', 'मुंबई', 'বেঙ্গালুরু', 'சென்னை']
  const data = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      name: names[i % names.length],
      city: cities[i % cities.length],
      note: 'ऑर्डर सफलतापूर्वक पूरा हुआ 🎉',
      amount: int(50000) / 100,
    })
  }
  return Buffer.from(JSON.stringify({ data }))
}

function logLines(count) {
  const levels = ['info', 'warn', 'error', 'debug']
  const lines = []
  for (let i = 0; i < count; i++) {
    lines.push(
      `2026-08-12T${10 + int(13)}:${10 + int(49)}:${10 + int(49)}.${100 + int(899)}Z ` +
      `[${pick(levels)}] request_id=${int(999999)} route=/api/v1/${pick(['users', 'orders', 'posts'])} ` +
      `status=${pick([200, 200, 200, 404, 500])} duration_ms=${int(2000)}`
    )
  }
  return Buffer.from(lines.join('\n'))
}

const DATASETS = [
  { name: 'API list (1k records)', data: apiListResponse(1000) },
  { name: 'Nested JSON (500 posts)', data: nestedResponse(500) },
  { name: 'Multilingual JSON (2k)', data: multilingualResponse(2000) },
  { name: 'Server logs (5k lines)', data: logLines(5000) },
  { name: 'Small API response (2 kB)', data: apiListResponse(8) },
]

// Settings servers actually run in production, not maximum-effort presets.
const CODECS = [
  {
    name: 'comprexia-fast',
    compress: (b) => lib.compressFast(b),
    decompress: (b) => lib.decompress(b),
  },
  {
    name: 'comprexia',
    compress: (b) => lib.compress(b),
    decompress: (b) => lib.decompress(b),
  },
  {
    name: 'gzip-1',
    compress: (b) => zlib.gzipSync(b, { level: 1 }),
    decompress: (b) => zlib.gunzipSync(b),
  },
  {
    name: 'gzip-6',
    compress: (b) => zlib.gzipSync(b, { level: 6 }),
    decompress: (b) => zlib.gunzipSync(b),
  },
  {
    name: 'brotli-4',
    compress: (b) =>
      zlib.brotliCompressSync(b, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length,
        },
      }),
    decompress: (b) => zlib.brotliDecompressSync(b),
  },
  {
    name: 'brotli-11',
    compress: (b) =>
      zlib.brotliCompressSync(b, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
      }),
    decompress: (b) => zlib.brotliDecompressSync(b),
  },
]

if (typeof zlib.zstdCompressSync === 'function') {
  CODECS.push({
    name: 'zstd-3',
    compress: (b) => zlib.zstdCompressSync(b),
    decompress: (b) => zlib.zstdDecompressSync(b),
  })
}

if (lz4) {
  CODECS.push({
    name: 'lz4',
    compress: (b) => {
      const out = Buffer.alloc(lz4.encodeBound(b.length))
      return out.subarray(0, lz4.encodeBlock(b, out))
    },
    decompress: (b, originalSize) => {
      const out = Buffer.alloc(originalSize)
      lz4.decodeBlock(b, out)
      return out
    },
  })
}

function timed(fn, input, minMs = 400) {
  fn(input) // warm up JIT and any lazy init
  let iterations = 0
  const start = process.hrtime.bigint()
  let elapsed = 0n
  const budget = BigInt(minMs) * 1000000n
  do {
    fn(input)
    iterations++
    elapsed = process.hrtime.bigint() - start
  } while (elapsed < budget)
  const seconds = Number(elapsed) / 1e9
  return (input.length * iterations) / seconds / (1024 * 1024)
}

function run() {
  const failures = []

  for (const dataset of DATASETS) {
    const { name, data } = dataset
    console.log(`\n${name} — ${(data.length / 1024).toFixed(1)} kB`)
    console.log('  codec            ratio    saved   comp MB/s   decomp MB/s')
    console.log('  ' + '-'.repeat(58))

    for (const codec of CODECS) {
      let compressed
      try {
        compressed = codec.compress(data)
      } catch (e) {
        console.log(`  ${codec.name.padEnd(16)} failed: ${e.message}`)
        continue
      }

      // A ratio is meaningless if the bytes do not survive the roundtrip.
      const restored = codec.decompress(compressed, data.length)
      if (!Buffer.from(restored).equals(data)) {
        failures.push(`${codec.name} / ${name}`)
        console.log(`  ${codec.name.padEnd(16)} ROUNDTRIP FAILED`)
        continue
      }

      const ratio = compressed.length / data.length
      const compMBps = timed(codec.compress, data)
      const decompMBps = timed((b) => codec.decompress(b, data.length), compressed)

      console.log(
        '  ' +
        codec.name.padEnd(16) +
        ratio.toFixed(3).padStart(5) +
        `${((1 - ratio) * 100).toFixed(1)}%`.padStart(9) +
        compMBps.toFixed(0).padStart(12) +
        decompMBps.toFixed(0).padStart(14)
      )
    }
  }

  console.log(`\nNode ${process.version} · ${process.platform}/${process.arch}`)
  console.log('Lower ratio is better. Competitors run at production settings.')

  if (failures.length) {
    console.error(`\n${failures.length} roundtrip failure(s): ${failures.join(', ')}`)
    process.exit(1)
  }
}

run()
