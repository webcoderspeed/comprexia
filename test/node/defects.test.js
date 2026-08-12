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

console.log('defect regressions ok')
