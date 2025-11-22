const assert = require('assert')
const path = require('path')
const mod = require(path.join(__dirname, '../../dist/index.js'))

const inputs = [
  'hello',
  'aaaaaaaaaaaaaaaaaaaa',
  JSON.stringify({ a: 1, b: 'x', c: [1, 2, 3], d: 'hello hello' })
]

for (const s of inputs) {
  const b = Buffer.from(s)
  const c = mod.compress(b)
  const d = mod.decompress(c)
  assert.strictEqual(d.toString(), s)
}

console.log('roundtrip ok')