const fastify = require('fastify')()
const lib = require('../../dist/index.js')

fastify.get('/json', async (req, reply) => {
  const enc = lib.negotiateEncoding(req.headers['accept-encoding'])
  const payload = Buffer.from(JSON.stringify({ ok: true, msg: 'hello', time: Date.now() }))
  if (enc === 'cx') {
    reply.header('Content-Encoding', 'cx')
    const c = lib.createCompressorStream()
    c.end(payload)
    return reply.send(c)
  } else {
    return reply.send(payload)
  }
})

const port = process.env.PORT || 3001
fastify.listen({ port }, (err, address) => {
  if (err) throw err
  console.log('fastify example listening on ' + address)
})