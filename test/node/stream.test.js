const assert = require('assert')
const path = require('path')
const mod = require(path.join(__dirname, '../../dist/index.js'))
;(async () => {
  const input = 'aaaaaaaaaaabbbbbcccccccccdddddd'
  const compressor = mod.createCompressorStream()
  const chunks = []
  compressor.on('data', (c) => chunks.push(c))
  compressor.on('end', () => {
    const out = Buffer.concat(chunks)
    const back = mod.decompress(out)
    assert.strictEqual(back.toString(), input)
    console.log('stream roundtrip ok')
  })
  compressor.write(Buffer.from(input.slice(0, 10)))
  compressor.write(Buffer.from(input.slice(10, 20)))
  compressor.end(Buffer.from(input.slice(20)))
})()