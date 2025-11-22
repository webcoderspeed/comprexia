const express = require('express')
const lib = require('../../dist/index.js')

const app = express()

app.get('/json', (req, res) => {
  const enc = lib.negotiateEncoding(req.headers['accept-encoding'])
  const payload = Buffer.from(JSON.stringify({ ok: true, msg: 'hello', time: Date.now() }))
  if (enc === 'cx') {
    res.setHeader('Content-Encoding', 'cx')
    const c = lib.createCompressorStream()
    c.pipe(res)
    c.end(payload)
  } else {
    res.type('application/json').send(payload)
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log('express example listening on http://localhost:' + port)
})