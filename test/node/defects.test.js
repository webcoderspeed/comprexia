// Regression tests for every defect listed in the README's "Known defects".
// Each block names the bug it locks down so a future change cannot quietly
// reintroduce it.

const assert = require('assert')
const path = require('path')
const mod = require(path.join(__dirname, '../../dist/index.js'))
const web = require(path.join(__dirname, '../../dist/web/decoder.js'))

// --- advanced mode corrupted every non-ASCII payload ------------------------
{
  const payloads = [
    JSON.stringify({ id: 1, name: 'hello', active: true, score: null }),
    JSON.stringify({ name: 'संजीव शर्मा', city: 'दिल्ली' }),
    JSON.stringify({ msg: 'great job 🎉🎉🎉', mood: '🔥' }),
    JSON.stringify({ name: 'café résumé naïve' }),
    JSON.stringify({ path: 'C:\\Users\\test\\', note: 'ends with backslash' }),
    '\uFFFD\u00E0\u00FF plain text, not json at all',
  ]

  for (const s of payloads) {
    const input = Buffer.from(s)
    assert.strictEqual(
      mod.decompressAdvanced(mod.compressAdvanced(input)).toString(),
      s,
      `advanced roundtrip failed for: ${s.slice(0, 40)}`
    )
  }

  // Raw bytes across the whole token range, which is what collided with UTF-8.
  const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
  assert.ok(
    mod.decompressAdvanced(mod.compressAdvanced(allBytes)).equals(allBytes),
    'advanced roundtrip failed for all-byte payload'
  )
}

// --- decoder read out of bounds on crafted streams --------------------------
{
  const malformed = [
    [0x85, 0xff, 0xff], // match with no output to reference
    [0x85, 0x00, 0x00], // zero distance
    [0x85, 0x01], // truncated match header
    [0xff, 0x10, 0x00, 0x01], // truncated extended match
    [0x40, 0x01, 0x02], // literal run past end of input
  ]

  for (const bytes of malformed) {
    assert.throws(
      () => mod.decompress(Buffer.from(bytes)),
      /comprexia/,
      `decoder accepted malformed stream: ${bytes}`
    )
    assert.throws(
      () => web.decompressBrowser(Uint8Array.from(bytes)),
      /comprexia/,
      `browser decoder accepted malformed stream: ${bytes}`
    )
  }
}

// --- native and browser decoders must agree ---------------------------------
{
  const input = Buffer.from(JSON.stringify({ data: Array(50).fill({ a: 'x', b: 'नमस्ते' }) }))
  const compressed = mod.compressFast(input)
  const native = mod.decompress(compressed).toString()
  const browser = web.decompressToString(Uint8Array.from(compressed))
  assert.strictEqual(browser, native, 'browser decoder disagrees with native decoder')
  assert.strictEqual(browser, input.toString())
}

// --- the streaming encoder emitted blocks its own decoder could not read ----
{
  const { Readable } = require('stream')

  // A run long enough to produce a >=130-byte match, which encoded as header
  // 0xFF — the extended-match marker — and was misread.
  const payload = Buffer.concat([
    Buffer.from('PREFIX-'),
    Buffer.alloc(300, 0x41),
    Buffer.from('-MIDDLE-'),
    Buffer.alloc(500, 0x42),
    Buffer.from('-SUFFIX'),
  ])

  const run = async () => {
    for (const chunkSize of [payload.length, 64, 7]) {
      const chunks = []
      for (let i = 0; i < payload.length; i += chunkSize) {
        chunks.push(payload.subarray(i, i + chunkSize))
      }

      const compressor = mod.createCompressorStream()
      const collected = []
      Readable.from(chunks).pipe(compressor)
      for await (const piece of compressor) collected.push(piece)

      const restored = mod.decompress(Buffer.concat(collected))
      assert.ok(
        restored.equals(payload),
        `streaming roundtrip failed at chunk size ${chunkSize}`
      )
    }
  }

  // Keep the rest of this file synchronous; surface any failure loudly.
  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

// --- advanced payloads must be decodable by the browser decoder -------------
{
  // The middleware labels advanced output `cx-adv`; the browser decoder needs
  // a matching entry point, and its interned-token table must stay in step
  // with the C++ one. Compressing natively and decoding in JS proves both.
  const payloads = [
    JSON.stringify({ id: 1, name: 'x', title: 'y', created: 'z', active: true, score: null }),
    JSON.stringify({ name: 'संजीव शर्मा', note: 'ऑर्डर 🎉', url: '/a/b' }),
    JSON.stringify({ description: 'a', timestamp: 1, author: 'b', email: 'c', link: 'd' }),
  ]

  for (const s of payloads) {
    const compressed = mod.compressAdvanced(Buffer.from(s))
    assert.strictEqual(
      web.decompressAdvancedToString(Uint8Array.from(compressed)),
      s,
      'browser advanced decoder disagrees with the native transform'
    )
  }
}

// --- a decompression bomb must be bounded, not fatal ------------------------
{
  // Each extended match block is 5 bytes and emits up to 65535, so this
  // expands roughly 13000x. Unbounded, it decoded to over a gigabyte.
  const bomb = [0x01, 0x41]
  for (let i = 0; i < 5000; i++) bomb.push(0xff, 0xff, 0xff, 0x01, 0x00)
  const hostile = Buffer.from(bomb)

  assert.throws(
    () => mod.decompress(hostile, { maxOutputLength: 1024 * 1024 }),
    /maximum allowed size/,
    'native decoder ignored maxOutputLength'
  )
  assert.throws(
    () => web.decompressBrowser(Uint8Array.from(hostile), { maxOutputLength: 1024 * 1024 }),
    /maximum allowed size/,
    'browser decoder ignored maxOutputLength'
  )

  // The default cap must also be finite.
  const huge = [0x01, 0x41]
  for (let i = 0; i < 60000; i++) huge.push(0xff, 0xff, 0xff, 0x01, 0x00)
  assert.throws(
    () => mod.decompress(Buffer.from(huge)),
    /maximum allowed size/,
    'native decoder has no default output bound'
  )

  // A legitimate payload must still decode with the default in place.
  const ok = Buffer.from(JSON.stringify({ data: Array(500).fill({ a: 1, b: 'x' }) }))
  assert.ok(mod.decompress(mod.compressFast(ok)).equals(ok))
}

// --- negotiateEncoding substring-matched anything containing "cx" -----------
{
  assert.strictEqual(mod.negotiateEncoding('cx'), 'cx')
  assert.strictEqual(mod.negotiateEncoding('gzip, cx'), 'cx')
  assert.strictEqual(mod.negotiateEncoding('gzip, cx;q=0.5'), 'cx')
  assert.strictEqual(mod.negotiateEncoding('CX'), 'cx')
  assert.strictEqual(mod.negotiateEncoding('*'), 'cx')

  assert.strictEqual(mod.negotiateEncoding(undefined), undefined)
  assert.strictEqual(mod.negotiateEncoding('gzip, br'), undefined)
  assert.strictEqual(mod.negotiateEncoding('cx;q=0'), undefined, 'q=0 means not acceptable')
  // These are the false positives the substring test produced.
  assert.strictEqual(mod.negotiateEncoding('cxfuture'), undefined)
  assert.strictEqual(mod.negotiateEncoding('my-cx-codec'), undefined)

  // RFC 9110 §12.5.3: `*` covers only codings not explicitly listed, so an
  // explicit refusal outranks the wildcard regardless of ordering.
  assert.strictEqual(mod.negotiateEncoding('cx;q=0, *'), undefined)
  assert.strictEqual(mod.negotiateEncoding('*, cx;q=0'), undefined)
  assert.strictEqual(mod.negotiateEncoding('gzip, *, cx;q=0'), undefined)
  assert.strictEqual(mod.negotiateEncoding('*, cx'), 'cx')

  // The advanced coding negotiates separately from `cx`.
  assert.strictEqual(mod.acceptsCoding('cx', mod.ADVANCED_CODING), false)
  assert.strictEqual(mod.acceptsCoding('cx-adv', mod.ADVANCED_CODING), true)
  assert.strictEqual(mod.acceptsCoding('cx-adv', 'cx'), false)
}

// --- middleware omitted Vary, letting caches poison non-cx clients ----------
{
  const middleware = mod.createComprexiaMiddleware({ level: 'fast' })
  const headers = {}
  const res = {
    setHeader: (k, v) => { headers[k] = v },
    set: () => res,
    send: (body) => { headers.__body = body; return res },
    json: (body) => { headers.__body = body; return res },
  }

  middleware({ headers: { 'accept-encoding': 'cx' } }, res, () => {})
  res.json({ hello: 'world', items: [1, 2, 3] })

  assert.strictEqual(headers['Content-Encoding'], 'cx')
  assert.strictEqual(headers['Vary'], 'Accept-Encoding', 'middleware must set Vary')
  assert.ok(Buffer.isBuffer(headers.__body), 'compressed body should be a Buffer')
}

// --- a failed send must not leave Content-Encoding on a plain body ----------
{
  const middleware = mod.createComprexiaMiddleware({ level: 'fast' })
  const headers = {}
  let plainBody
  const res = {
    setHeader: (k, v) => { headers[k] = v },
    set: () => { throw new Error('headers already flushed') },
    send: () => { throw new Error('headers already flushed') },
    json: (body) => { plainBody = body },
  }

  middleware({ headers: { 'accept-encoding': 'cx' } }, res, () => {})
  try { res.json({ hello: 'world' }) } catch { /* surfaced below via headers */ }

  if (plainBody !== undefined) {
    assert.notStrictEqual(
      headers['Content-Encoding'], 'cx',
      'fell back to plain JSON but left Content-Encoding: cx set'
    )
  }
}

// --- advanced level must not masquerade as the plain cx coding --------------
{
  const middleware = mod.createComprexiaMiddleware({ level: 'advanced' })
  const headers = {}
  let usedPlain = false
  const res = {
    setHeader: (k, v) => { headers[k] = v },
    set: () => res,
    send: (body) => { headers.__body = body; return res },
    json: () => { usedPlain = true; return res },
  }

  // A client advertising only `cx` cannot decode advanced output, so the
  // middleware must fall through rather than send something undecodable.
  middleware({ headers: { 'accept-encoding': 'cx' } }, res, () => {})
  res.json({ id: 1, name: 'x' })
  assert.ok(usedPlain, 'advanced payload was sent to a client that only accepts cx')
  assert.strictEqual(headers['Content-Encoding'], undefined)

  // A client advertising cx-adv gets it, labelled distinctly.
  const advHeaders = {}
  const advRes = {
    setHeader: (k, v) => { advHeaders[k] = v },
    set: () => advRes,
    send: (body) => { advHeaders.__body = body; return advRes },
    json: () => { throw new Error('should have compressed') },
  }
  middleware({ headers: { 'accept-encoding': 'cx-adv' } }, advRes, () => {})
  advRes.json({ id: 1, name: 'x' })
  assert.strictEqual(advHeaders['Content-Encoding'], 'cx-adv')
  assert.strictEqual(
    web.decompressAdvancedToString(Uint8Array.from(advHeaders.__body)),
    JSON.stringify({ id: 1, name: 'x' })
  )
}

console.log('defect regressions ok')
