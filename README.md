# Comprexia

High‑performance HTTP compression for modern APIs and real‑time backends, with a JSON‑aware codec, Node.js native bindings, and a lightweight browser decoder. As principal architects, we design compression systems around the realities of web payloads: repetitive keys, structured layouts, and latency over perfect minimum size. Comprexia is engineered to be operationally simple, streaming‑friendly, and flexible enough to serve both high‑throughput and higher‑ratio requirements.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![C++20](https://img.shields.io/badge/C++-20-blue.svg)](https://isocpp.org/)

## Why Another Codec

- Most web payloads are JSON. General‑purpose codecs (gzip, Brotli, Zstd) excel universally but don’t exploit JSON’s structure unless you pre‑condition data (dictionary, transforms). Comprexia integrates structure awareness directly.
- Latency matters more than extreme ratio for many APIs. A codec that returns in sub‑10 ms on typical responses with consistent decode is often better than one that shaves a few extra kilobytes.
- Streaming and negotiation must be straightforward. Comprexia’s stream format is simple, and the middleware negotiates `Accept-Encoding` seamlessly.

Comprexia isn’t meant to replace gzip/Brotli/Zstd outright. It’s a practical alternative to combine compression wins and operational simplicity for JSON‑heavy workloads.

## Core Concepts

- JSON‑aware preprocessing: Interns common keys/tokens and stabilizes structure to improve repetition. This yields better matches and lowers header overhead compared to naive LZ on raw JSON.
- Two encoder levels:
  - `fast`: prioritizes throughput with a single‑position hash finder and short match extension. It’s the default for web APIs.
  - `advanced`: searches longer matches and uses extended match headers to reduce overhead on large repeats. It achieves better ratios at increased CPU.
- Stream format:
  - Literal block: `header<0x80` followed by `header` literal bytes
  - Match block: `0x80|(len-3)` followed by 2‑byte distance
  - Extended match block: `0xFF` followed by 2‑byte length and 2‑byte distance (for longer matches)
- Browser decode: A tiny JS decoder reproduces the stream expansion client‑side. For `fast`, you get fully correct JSON without a server decode route.

## Install

```bash
npm install @comprexia/cx
```

Requirements: Node 18+, C++20 compiler, CMake. The native addon builds automatically during install.

## Quick Start

```ts
import { compress, decompress } from '@comprexia/cx'

const src = Buffer.from('hello world')
const c = compress(src)
const d = decompress(c)
console.log(d.toString())
```

## Integration Patterns

### Express Middleware (Recommended)

```ts
import express from 'express'
import { createComprexiaMiddleware } from '@comprexia/cx'

const app = express()

// Default to fast for latency; opt into advanced where ratio matters
app.use(createComprexiaMiddleware({ level: 'fast' }))

app.get('/api/posts', (_req, res) => {
  res.json({ success: true, data: [{ id: 1, title: 'hello' }] })
})

app.listen(3001)
```

When clients send `Accept-Encoding: cx`, responses include:

- `Content-Encoding: cx`
- `X-Compression-Ratio`
- `X-Original-Size`
- `X-Compressed-Size`

### Fastify

```ts
import Fastify from 'fastify'
import { createComprexiaMiddleware } from '@comprexia/cx'

const app = Fastify()

// Wrap composable middleware
app.addHook('onRequest', (req, reply, done) => done())
app.addHook('preHandler', (req, reply, done) => done())

// Use Comprexia in reply decorator
app.decorateReply('cxJson', function (payload: any) {
  const enc = (this.request.headers['accept-encoding'] || '') as string
  if (enc.includes('cx')) {
    const s = JSON.stringify(payload)
    const { compressFast } = require('@comprexia/cx')
    const out = compressFast(Buffer.from(s))
    this.header('Content-Encoding', 'cx')
    this.header('Content-Type', 'application/json')
    return this.send(out)
  }
  return this.send(payload)
})

app.get('/api/posts', async (_req, reply) => {
  return (reply as any).cxJson({ success: true, data: [] })
})

app.listen({ port: 3002 })
```

### NestJS

```ts
import { Injectable, NestMiddleware } from '@nestjs/common'
import { compressFast, negotiateEncoding } from '@comprexia/cx'

@Injectable()
export class ComprexiaMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      const enc = negotiateEncoding(req.headers['accept-encoding'] || '')
      if (enc === 'cx') {
        const s = JSON.stringify(body)
        const out = compressFast(Buffer.from(s))
        res.setHeader('Content-Encoding', 'cx')
        res.setHeader('Content-Type', 'application/json')
        return res.send(out)
      }
      return originalJson(body)
    }
    next()
  }
}
```

### WebSocket / Streaming

```js
const { negotiateEncoding, createCompressorStream } = require('@comprexia/cx')

// Express chunked response
app.get('/events', (req, res) => {
  const enc = negotiateEncoding(req.headers['accept-encoding'])
  if (enc === 'cx') {
    res.setHeader('Content-Encoding', 'cx')
    const c = createCompressorStream()
    c.pipe(res)
    c.write(Buffer.from(JSON.stringify({ type: 'init' })))
    setInterval(() => c.write(Buffer.from(JSON.stringify({ type: 'tick', t: Date.now() }))), 1000)
  } else {
    res.write(JSON.stringify({ type: 'init' }))
    setInterval(() => res.write(JSON.stringify({ type: 'tick', t: Date.now() })), 1000)
  }
})
```

## Frontend Decode (No Server Decode Route)

Use the provided browser decoder for `cx` payloads in the client.

```ts
import axios from 'axios'
import { decompressToString } from '@comprexia/cx/web/decoder'

const api = axios.create({ baseURL: '/api', headers: { 'Accept-Encoding': 'cx' } })

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

This decoder expands the literal/match stream and extended matches. It is intentionally small and latency‑oriented. For advanced post‑processing stages (e.g., deep token interning or UTF‑8 normalization), WASM support may be introduced in future versions; today, `fast` delivers the best client‑side experience.

## API Reference

- `compress(input: Buffer): Buffer` — basic compression, streaming‑compatible
- `decompress(input: Buffer): Buffer` — basic decompression
- `compressFast(input: Buffer): Buffer` — speed‑optimized encoder
- `compressAdvanced(input: Buffer): Buffer` — ratio‑optimized encoder
- `decompressAdvanced(input: Buffer): Buffer` — reverses advanced transforms server‑side
- `createComprexiaMiddleware(opts?: { level?: 'fast' | 'advanced' })` — plug‑and‑play Express middleware
- `createCompressorStream()` — Node stream for chunked responses
- `negotiateEncoding(acceptEncodingHeader?: string): 'cx' | 'identity'` — checks client support
- `@comprexia/cx/web/decoder` — browser decoder export

## Architecture Overview

- Encoder: LZ‑style match finder keyed by 4‑byte hash, with single‑position lookup in `fast` and longer extension in `advanced`. Extended match blocks (`0xFF`) reduce header costs for very long repeats.
- Decoder: deterministic replay of literal blocks and back‑references. The browser module mirrors the native decoder’s logic, excluding server‑side JSON/UTF‑8 post‑processing used by `advanced`.
- Preprocessor: for `advanced` mode, common JSON tokens/keys can be interned to compact values, and simple transforms stabilize repeated structures. This increases match quality and compressibility. Server‑side `decompressAdvanced` reverses these transforms.
- Node bindings: N‑API addon compiled in Release mode for production throughput.

## Performance Characteristics

- Large JSON (3k users, benchmark snapshot):
  - Comprexia‑Fast: ratio ≈ 0.080, compress ≈ 1206 MB/s
  - Comprexia‑Adv: ratio ≈ 0.054, compress ≈ 150 MB/s
  - Gzip: ratio ≈ 0.028, compress ≈ 355 MB/s
  - Brotli: ratio ≈ 0.008, compress ≈ 250 MB/s
  - Zstd: ratio ≈ 0.010, compress ≈ 153 MB/s
- Nested JSON: ratio differences reflect structural complexity; fast favors speed, advanced yields parity with its own settings but may trail Brotli/Zstd in minimum sizes.
- Text 256KB: Comprexia provides respectable speed; general‑purpose codecs can produce very small outputs due to entropy coding.

Interpretation: Choose `fast` for latency‑critical JSON APIs where middle‑of‑the‑road ratios are acceptable and speed consistency matters. Choose `advanced` when you control both ends and absolute size becomes more important.

## Operational Guidance

- Negotiation: Rely on `Accept-Encoding`. If `cx` isn’t present, fall back to standard `res.json` or existing gzip middleware. This ensures broad compatibility and incremental rollouts.
- Telemetry: Expose compression headers to monitor effectiveness. Track ratio and absolute bytes to inform level adjustments.
- Compatibility: Maintain gzip/Brotli for third‑party clients. Comprexia serves as an opt‑in compression for capable clients.
- Streaming: Prefer `createCompressorStream()` for event streams and long polls; it integrates naturally and saves intermediate allocations.

## When To Use Comprexia

- High‑traffic APIs with JSON payloads where latency and throughput are paramount
- Real‑time systems (chat, telemetry) that benefit from streaming compression
- Internal microservices using stable schemas, where structure‑aware transforms improve matches
- Mixed environments where you can negotiate `cx` with your own clients and keep gzip for others

## When To Prefer gzip/Brotli/Zstd

- Static assets and text blobs where the smallest possible size is the primary goal
- Public internet clients where a custom codec negotiation is impractical
- Infrastructure locked to specific codecs by policy or platform constraints

## Migration Plan

- Phase 1: Add middleware in `fast` mode. Ship clients with `Accept-Encoding: cx`. Confirm headers reflect expected ratios.
- Phase 2: Move selected endpoints to `advanced` where payloads are large and controlled. Keep browser decoding to `fast` unless WASM is introduced.
- Phase 3: Consider dictionary seeding and additional transforms if your schemas are highly repetitive.

## Troubleshooting

- Build failures: Ensure C++20 compiler and CMake present; `npm run build:release` compiles the addon.
- Module not found: Run `npm run build` to produce TypeScript outputs.
- Unexpected ratios: Review benchmarks on your real payloads; tune `fast` vs `advanced` per route.
- Browser decode errors: Confirm `Content-Encoding: cx` is set and `responseType: 'arraybuffer'` is used. Use the exported `@comprexia/cx/web/decoder` helpers.

## Benchmarks

Run:

```bash
npm run benchmark:depth
```

The benchmark suite compares Comprexia against gzip/Brotli/Zstd across JSON and text datasets. Use it to calibrate level choices and validate improvements.

## Build From Source

```bash
npm install
npm run build             # TypeScript
npm run build:release     # Native addon (Release)
npm test                  # Roundtrip tests
```

Requires Node 18+, a C++20 compiler, and CMake.

## Security Notes

- Do not compress sensitive payloads without transport security (TLS). Compression can amplify side channels if combined with attacker‑controlled inputs; treat compression as an optimization, not a security boundary.
- Avoid logging compressed binary payloads directly; prefer telemetry headers for observability.

## Roadmap

- WASM decoder for advanced transforms to enable full client‑side decode without server involvement
- Adaptive dictionary options tailored to your API schemas
- Advanced entropy stage for headers and distance/length coding to close ratio gaps with Brotli/Zstd
- CLI tooling for batch compression of datasets and logs

## License

MIT