// Roundtrip and safety tests for the transform engine.
//
// The bar is byte-exactness on arbitrary input. A transform that is "usually"
// reversible is the exact bug this project already shipped once, so these tests
// lead with the inputs designed to break it.

const assert = require('assert')
const path = require('path')
const zlib = require('zlib')
const { pack, unpack, packWithStats, availableCodecs } = require(
  path.join(__dirname, '../../dist/pack/index.js')
)

const codecs = availableCodecs().filter((c) => c !== 'store')

function roundtrips(label, input, options = {}) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input)
  for (const codec of codecs) {
    const packed = pack(source, { ...options, codec })
    const restored = unpack(packed)
    assert.ok(
      restored.equals(source),
      `${label} failed to roundtrip through ${codec} ` +
      `(${source.length} bytes in, ${restored.length} back)`
    )
  }
}

// --- the payload shape the engine exists for --------------------------------
{
  const rows = []
  for (let i = 0; i < 500; i++) {
    rows.push({
      id: 100000 + i,
      name: `user-${i % 7}`,
      email: `u${i}@example.com`,
      active: i % 3 !== 0,
      score: Number(((i * 37) % 1000) / 10),
      created: 1754000000 + i * 37,
    })
  }
  roundtrips('uniform record array', JSON.stringify({ success: true, data: rows }))
  roundtrips('bare record array', JSON.stringify(rows))
}

// --- inputs built to defeat the transform -----------------------------------
{
  // Non-canonical JSON: parses fine, but re-stringifying changes the bytes.
  // The transform must decline these rather than silently rewrite them.
  const nonCanonical = [
    '{\n  "a": 1,\n  "b": [ {"x":1},{"x":2},{"x":3},{"x":4} ]\n}', // pretty printed
    '{"a":1.0}',                                                     // number spelling
    '{"a":1e2}',                                                     // exponent form
    '{"a":"\\u0041"}',                                               // escaped ASCII
    '{"a":  1}',                                                     // stray space
  ]
  for (const text of nonCanonical) {
    const packed = pack(Buffer.from(text))
    assert.ok(
      unpack(packed).equals(Buffer.from(text)),
      `non-canonical JSON was not preserved byte-exactly: ${text}`
    )
  }

  // A payload that already contains the engine's own marker keys. If the
  // inverse blindly trusted them it would rewrite real user data.
  const collides = JSON.stringify({
    __cx_cols: ['not', 'ours'],
    __cx_enc: ['raw'],
    __cx_data: [[1, 2, 3]],
    rows: Array.from({ length: 8 }, (_, i) => ({ id: i, v: 'x' })),
  })
  roundtrips('marker-key collision', collides)

  // Values that are easy to mangle: unicode, emoji, escapes, nulls, negatives,
  // floats, nested structures, and integers past the delta-safe range.
  const nasty = JSON.stringify({
    data: [
      { id: 1, name: 'संजीव शर्मा', note: null, ok: true, f: 1.5 },
      { id: 2, name: 'emoji 🎉🔥', note: 'C:\\Users\\x\\', ok: false, f: -0.25 },
      { id: 3, name: 'quote " and \n newline', note: '', ok: true, f: 0 },
      { id: 4, name: '\u0000\u001f', note: 'tab\there', ok: false, f: 1e21 },
      { id: Number.MAX_SAFE_INTEGER, name: 'big', note: 'x', ok: true, f: 3.14 },
      { id: -50, name: 'negative', note: 'y', ok: false, f: -1 },
    ],
  })
  roundtrips('hostile values', nasty)
}

// --- non-JSON and degenerate inputs -----------------------------------------
{
  roundtrips('empty', Buffer.alloc(0))
  roundtrips('single byte', Buffer.from([0x00]))
  roundtrips('all byte values', Buffer.from(Array.from({ length: 256 }, (_, i) => i)))
  roundtrips('plain text', Buffer.from('the quick brown fox '.repeat(200)))
  roundtrips('not json at all', Buffer.from('{"unterminated'))
  roundtrips('json scalar', Buffer.from('42'))
  roundtrips('json null', Buffer.from('null'))
  roundtrips('empty array', Buffer.from('[]'))
  roundtrips('short array below threshold', Buffer.from(JSON.stringify([{ a: 1 }, { a: 2 }])))
  roundtrips('ragged array', Buffer.from(JSON.stringify(
    [{ a: 1 }, { b: 2 }, { a: 3, b: 4 }, { a: 5 }, { a: 6 }]
  )))

  const random = Buffer.alloc(5000)
  for (let i = 0; i < random.length; i++) random[i] = (i * 2654435761) & 0xff
  roundtrips('pseudo-random binary', random)
}

// --- byte shuffle on a numeric series ---------------------------------------
{
  const floats = new Float32Array(4000)
  let value = 22.5
  for (let i = 0; i < floats.length; i++) {
    value += ((i * 37) % 11) / 400 - 0.0125
    floats[i] = value
  }
  const binary = Buffer.from(floats.buffer.slice(0))
  roundtrips('float32 telemetry', binary, { shuffleWidth: 4 })

  // Widths that do not divide the input must be declined, not misapplied.
  roundtrips('mismatched shuffle width', Buffer.from('abcdefg'), { shuffleWidth: 4 })
}

// --- the engine must never enlarge a payload --------------------------------
{
  const incompressible = Buffer.alloc(4096)
  for (let i = 0; i < incompressible.length; i++) {
    incompressible[i] = (i * 1103515245 + 12345) & 0xff
  }
  const { stats } = packWithStats(incompressible)
  assert.strictEqual(stats.transform, 'none', 'a transform was applied to random bytes')
}

// --- corruption must be detected, not decoded -------------------------------
{
  const source = Buffer.from(JSON.stringify({
    data: Array.from({ length: 20 }, (_, i) => ({ id: i, name: 'x' })),
  }))
  const packed = pack(source)

  assert.throws(() => unpack(Buffer.from('not a container at all')), /bad magic/)
  assert.throws(() => unpack(packed.subarray(0, 4)), /too short|truncated/)

  // Flipping a payload byte must surface as an error, never as wrong data.
  const corrupted = Buffer.from(packed)
  corrupted[corrupted.length - 1] ^= 0xff
  assert.throws(() => unpack(corrupted), /comprexia/)

  // An unknown transform id must be refused rather than guessed at.
  const badTransform = Buffer.from(packed)
  badTransform[4] = 99
  assert.throws(() => unpack(badTransform), /unknown transform/)

  // Reserved flag bits are the forward-compatibility hinge.
  const badFlags = Buffer.from(packed)
  badFlags[6] = 0x01
  assert.throws(() => unpack(badFlags), /unsupported flags/)

  assert.throws(() => unpack(packed, { maxOutputLength: 8 }), /maximum allowed size/)
}

// --- the transform must actually earn its place -----------------------------
{
  const rows = []
  for (let i = 0; i < 2000; i++) {
    rows.push({
      id: 100000 + i,
      userId: (i * 7919) % 5000,
      name: `${['Aarav', 'Diya', 'Kabir', 'Meera'][i % 4]} ${['Sharma', 'Patel'][i % 2]}`,
      city: ['Mumbai', 'Delhi', 'Pune', 'Chennai'][i % 4],
      active: i % 3 !== 0,
      createdAt: 1754000000 + i * 37,
    })
  }
  const source = Buffer.from(JSON.stringify(rows))
  const { stats } = packWithStats(source)
  const gzipBaseline = zlib.gzipSync(source, { level: 6 }).length

  assert.strictEqual(stats.transform, 'columnar-json', 'columnar transform was not selected')
  assert.ok(
    stats.packedSize < gzipBaseline,
    `engine (${stats.packedSize}) should beat gzip -6 (${gzipBaseline})`
  )
}

console.log(`pack engine ok (codecs: ${codecs.join(', ')})`)
