# Comprexia

High‑performance HTTP compression with a JSON‑aware codec and Node.js native bindings. Designed for modern APIs, real‑time streams, and structured payloads.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![C++20](https://img.shields.io/badge/C++-20-blue.svg)](https://isocpp.org/)

## Why Comprexia

- Structured payload focus: JSON‑aware transforms target keys and layout for better efficiency on API responses
- Performance options: `fast` for latency‑critical endpoints, `advanced` for better ratios
- Streaming friendly: Native compressor stream integrates with chunked transfers and WebSocket
- Simple integration: One middleware call to negotiate and emit `Content-Encoding: cx`

## Install

```bash
npm install @comprexia/cx
```

Native addon builds automatically on install. Requires a C++20 compiler and CMake.

## Quick Start

```ts
import { compress, decompress } from '@comprexia/cx'

const src = Buffer.from('hello world')
const c = compress(src)
const d = decompress(c)
console.log(d.toString())
```

## API Middleware (recommended)

```ts
import express from 'express'
import { createComprexiaMiddleware } from '@comprexia/cx'

const app = express()

// Use fast for latency; switch to advanced where ratio matters
app.use(createComprexiaMiddleware({ level: 'fast' }))

app.get('/api/posts', (_req, res) => {
  res.json({ success: true, data: [{ id: 1, title: 'hello' }] })
})

app.listen(3001)
```

Clients that send `Accept-Encoding: cx` receive compressed payloads with telemetry headers:

- `Content-Encoding: cx`
- `X-Compression-Ratio`
- `X-Original-Size`
- `X-Compressed-Size`

## Frontend Decode (no server decode route)

Use the provided browser decoder to decode `cx` payloads directly in the client.

```ts
import axios from 'axios'
import { decompressToString } from '@comprexia/cx/web/decoder'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Accept-Encoding': 'cx' },
})

async function fetchJson<T>(path: string): Promise<T> {
  const res = await api.get(path, { responseType: 'arraybuffer' })
  if (res.headers['content-encoding'] === 'cx') {
    const jsonStr = decompressToString(res.data as ArrayBuffer)
    return JSON.parse(jsonStr)
  }
  const text = new TextDecoder().decode(new Uint8Array(res.data as ArrayBuffer))
  return JSON.parse(text)
}
```

Note: Browser decoder handles the base literal/match stream used by `fast`. If you opt into `advanced`, use the same decoder for the stream but be aware that extra JSON/UTF‑8 transforms may require WASM support in future versions.

## Streaming Example (Express)

```js
const express = require('express')
const { negotiateEncoding, createCompressorStream } = require('@comprexia/cx')
const app = express()

app.get('/json', (req, res) => {
  const enc = negotiateEncoding(req.headers['accept-encoding'])
  const payload = Buffer.from(JSON.stringify({ ok: true, msg: 'hello' }))
  if (enc === 'cx') {
    res.setHeader('Content-Encoding', 'cx')
    const c = createCompressorStream()
    c.pipe(res)
    c.end(payload)
  } else {
    res.type('application/json').send(payload)
  }
})

app.listen(3000)
```

## API Reference

- `compress(input: Buffer): Buffer`
- `decompress(input: Buffer): Buffer`
- `compressFast(input: Buffer): Buffer`
- `compressAdvanced(input: Buffer): Buffer`
- `decompressAdvanced(input: Buffer): Buffer`
- `createComprexiaMiddleware(opts?: { level?: 'fast' | 'advanced' })`
- `createCompressorStream()`
- `negotiateEncoding(acceptEncodingHeader?: string): 'cx' | 'identity'`

## Benchmarks (snapshot)

Large JSON (3k users):

- Comprexia‑Fast: ratio ≈ 0.080, compress ≈ 1206 MB/s
- Comprexia‑Adv: ratio ≈ 0.054, compress ≈ 150 MB/s
- Gzip: ratio ≈ 0.028, compress ≈ 355 MB/s
- Brotli: ratio ≈ 0.008, compress ≈ 250 MB/s
- Zstd: ratio ≈ 0.010, compress ≈ 153 MB/s

Use `npm run benchmark:depth` to reproduce.

## When To Use Comprexia

- High‑traffic JSON APIs: prioritize latency and consistent decode with `fast`
- Real‑time/WebSocket: streaming compressor integrates with chunked flows
- Internal services with stable schemas: token interning improves efficiency
- Hybrid stacks: negotiate `cx` for capable clients, fall back to gzip for others

## When To Prefer Gzip/Brotli/Zstd

- Static assets and general text where smallest size is the only goal
- Broad client support without custom negotiation
- Existing infra mandates specific codecs (e.g., CDN constraints)

## Build From Source

```bash
npm install
npm run build             # TypeScript
npm run build:release     # Native addon (Release)
npm test                  # Roundtrip tests
```

Requires Node 18+, C++20 compiler, and CMake.

## License

MIT