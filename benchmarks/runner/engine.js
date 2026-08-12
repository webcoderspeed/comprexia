// Does transforming before compressing actually pay?
//
// Every engine result is verified by unpacking and comparing to the original
// before it is reported, so a number here cannot come from a lossy shortcut.

const zlib = require('zlib')
const { pack, unpack, packWithStats } = require('../../dist/pack/index.js')

let seed = 0x2545f491
function rand() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
  return (seed >>> 0) / 0xffffffff
}
const pick = (a) => a[Math.floor(rand() * a.length) % a.length]
const int = (n) => Math.floor(rand() * n)

function apiRecords(n) {
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({
      id: 100000 + i,
      userId: int(5000),
      name: `${pick(['Aarav', 'Diya', 'Kabir', 'Meera'])} ${pick(['Sharma', 'Patel', 'Nair'])}`,
      email: `user${i}@example.com`,
      city: pick(['Mumbai', 'Delhi', 'Pune', 'Chennai']),
      active: rand() > 0.3,
      score: Number((rand() * 100).toFixed(2)),
      createdAt: 1754000000 + i * 37,
    })
  }
  return Buffer.from(JSON.stringify({ success: true, total: n, data: rows }))
}

function multilingualRecords(n) {
  const names = ['संजीव शर्मा', 'প্রিয়া নায়ার', 'அன்யா ஐயர்', 'રોહન પટેલ']
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({
      id: i,
      name: names[i % names.length],
      city: ['दिल्ली', 'मुंबई', 'চেন্নাই'][i % 3],
      note: 'ऑर्डर सफलतापूर्वक पूरा हुआ 🎉',
      amount: int(50000),
      at: 1754000000 + i * 61,
    })
  }
  return Buffer.from(JSON.stringify({ data: rows }))
}

function telemetry(n) {
  const values = new Float32Array(n)
  let v = 22.5
  for (let i = 0; i < n; i++) { v += (rand() - 0.5) * 0.05; values[i] = v }
  return Buffer.from(values.buffer.slice(0))
}

function prose(n) {
  const words = 'the quick brown fox jumps over a lazy dog while rain falls softly'.split(' ')
  const out = []
  for (let i = 0; i < n; i++) out.push(pick(words))
  return Buffer.from(out.join(' '))
}

const DATASETS = [
  { name: 'API records (2k)', data: apiRecords(2000) },
  { name: 'API records (200)', data: apiRecords(200) },
  { name: 'Multilingual records (2k)', data: multilingualRecords(2000) },
  { name: 'Float32 telemetry (50k)', data: telemetry(50000), packOptions: { shuffleWidth: 4 } },
  { name: 'Prose (30k words)', data: prose(30000) },
]

function ms(fn) {
  const start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

console.log('\nEngine vs raw codecs. "saved" is versus the same codec with no transform.\n')

let failures = 0

for (const { name, data, packOptions = {} } of DATASETS) {
  console.log(`${name} — ${(data.length / 1024).toFixed(1)} kB`)
  console.log('  variant                       bytes     ratio   vs raw    ms')
  console.log('  ' + '-'.repeat(62))

  for (const codec of ['gzip', 'brotli']) {
    const raw = codec === 'gzip'
      ? zlib.gzipSync(data, { level: 6 })
      : zlib.brotliCompressSync(data, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length,
        },
      })

    const { packed, stats } = packWithStats(data, { ...packOptions, codec })

    // A size claim is worthless unless the bytes survive.
    if (!unpack(packed).equals(data)) {
      console.log(`  ${codec.padEnd(28)} ROUNDTRIP FAILED`)
      failures++
      continue
    }

    const rawMs = ms(() => (codec === 'gzip'
      ? zlib.gzipSync(data, { level: 6 })
      : zlib.brotliCompressSync(data, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
      })))
    const packMs = ms(() => pack(data, { ...packOptions, codec }))

    const line = (label, bytes, millis, delta) =>
      '  ' + label.padEnd(28) +
      String(bytes).padStart(8) +
      (bytes / data.length).toFixed(4).padStart(10) +
      (delta === null ? '        —' : `${delta > 0 ? '-' : '+'}${Math.abs(delta).toFixed(1)}%`.padStart(9)) +
      millis.toFixed(1).padStart(7)

    console.log(line(`${codec} (raw)`, raw.length, rawMs, null))
    console.log(line(
      `engine + ${codec} [${stats.transform}]`,
      packed.length,
      packMs,
      ((raw.length - packed.length) / raw.length) * 100
    ))
  }
  console.log()
}

if (failures) {
  console.error(`${failures} roundtrip failure(s)`)
  process.exit(1)
}
console.log('All engine outputs verified byte-exact against their input.\n')
