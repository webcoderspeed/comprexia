# comprexia

<p align="center">
  <strong>A JSON-aware compression codec for Node.js APIs, written in C++20.</strong><br/>
  Native N-API addon &middot; Streaming encoder &middot; Express middleware &middot; Browser decoder<br/>
  <em>Status: v0.x prototype — see <a href="#honest-status">Honest status</a> before you deploy it.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comprexia/cx"><img src="https://img.shields.io/npm/v/@comprexia/cx" alt="npm version"/></a>
  <a href="https://github.com/webcoderspeed/comprexia/actions/workflows/ci.yml"><img src="https://github.com/webcoderspeed/comprexia/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="https://github.com/webcoderspeed/comprexia/actions/workflows/codeql.yml"><img src="https://github.com/webcoderspeed/comprexia/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT"/></a>
  <img src="https://img.shields.io/badge/C%2B%2B-20-blue" alt="C++20"/>
  <img src="https://img.shields.io/badge/Node.js-18%2B-green" alt="Node 18+"/>
  <img src="https://img.shields.io/badge/ASan%20%C2%B7%20UBSan-enforced-brightgreen" alt="sanitizers enforced"/>
</p>

<p align="center">
  <a href="https://github.com/webcoderspeed/comprexia">GitHub</a> &middot;
  <a href="https://www.npmjs.com/package/@comprexia/cx">npm</a> &middot;
  <a href="https://github.com/webcoderspeed/comprexia/issues">Issues</a> &middot;
  <a href="docs/DESIGN.md">Design doc</a>
</p>

---

## Honest status

Most compression libraries open with a benchmark that flatters them. This one
opens with the benchmark that does not.

**Comprexia v0.1 is a working prototype, not a production codec.** On realistic
API payloads it is beaten by `gzip` at level 1 — which is built into Node, needs
no native addon, and runs everywhere — on both ratio *and* compression speed.
It is beaten far more decisively by LZ4. The numbers are in
[Benchmarks](#benchmarks), reproducible with `npm run bench:honest`.

The earlier version of this README quoted 1206 MB/s. That figure came from a
benchmark that concatenated one sample file until it reached 1 MB — near-pure
repetition, which every LZ codec devours. It was not a lie so much as a
measurement of nothing. It has been replaced.

What is genuinely here today:

- A **correct** fast codec. Arbitrary bytes — UTF-8, Devanagari, emoji, binary —
  round-trip byte-exactly through `compress`/`compressFast` → `decompress`,
  fuzzed under AddressSanitizer and UBSan on every commit.
- **Fast decompression on small payloads**: 439 MB/s on a 1.5 kB response versus
  gzip's 93 MB/s. This is the one axis where the design currently pays off.
- Working **Express middleware**, **Node streams**, and a **browser decoder**
  small enough to inline.

What is not here: a competitive compression ratio, competitive encode speed, or
a working `advanced` mode. See [Known defects](#known-defects) — they are
documented rather than hidden, and [docs/DESIGN.md](docs/DESIGN.md) is the plan
for fixing them properly.

Use this today if you want to read, learn from, or contribute to a compression
codec. Do not use it to serve production traffic yet.

---

## Table of contents

- [Honest status](#honest-status)
- [Benchmarks](#benchmarks)
- [Known defects](#known-defects)
- [Installation](#installation)
- [Quick start](#quick-start)
- [API reference](#api-reference)
- [Integrations](#integrations)
  - [Express](#express)
  - [Fastify](#fastify)
  - [NestJS](#nestjs)
  - [Streaming responses](#streaming-responses)
  - [Browser decoding](#browser-decoding)
- [Stream format](#stream-format)
- [Architecture](#architecture)
- [When to use what](#when-to-use-what)
- [Roadmap](#roadmap)
- [Building from source](#building-from-source)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Benchmarks

Node 20, Apple Silicon, deterministic synthetic payloads that resemble real API
traffic rather than repeated blobs. Competitors run at the settings servers
actually deploy — gzip 6 and brotli 4 for dynamic responses, not brotli 11.
Every result is verified byte-exact before it is timed. Reproduce with:

```bash
npm run bench:honest
```

**API list response — 1000 user records, 189 kB**

| Codec | Ratio | Saved | Compress MB/s | Decompress MB/s |
| --- | ---: | ---: | ---: | ---: |
| comprexia-fast | 0.196 | 80.4% | 436 | 220 |
| gzip-1 | 0.148 | 85.2% | 468 | 173 |
| gzip-6 | 0.114 | 88.6% | 133 | 168 |
| brotli-4 | 0.122 | 87.8% | 241 | 128 |
| brotli-11 | 0.086 | 91.4% | 1 | 95 |
| **lz4** | 0.211 | 78.9% | **1458** | **941** |

**Multilingual JSON — Hindi, Bengali, Tamil, emoji, 355 kB**

| Codec | Ratio | Saved | Compress MB/s | Decompress MB/s |
| --- | ---: | ---: | ---: | ---: |
| comprexia-fast | 0.095 | 90.5% | 595 | 147 |
| gzip-1 | 0.047 | 95.3% | 1046 | 135 |
| brotli-4 | 0.038 | 96.2% | 532 | 112 |
| **lz4** | 0.064 | 93.6% | **3587** | 635 |

**Small API response — 1.5 kB**

| Codec | Ratio | Saved | Compress MB/s | Decompress MB/s |
| --- | ---: | ---: | ---: | ---: |
| comprexia-fast | 0.454 | 54.6% | 81 | **439** |
| gzip-1 | 0.328 | 67.2% | 119 | 93 |
| brotli-4 | 0.296 | 70.4% | 62 | 80 |
| lz4 | 0.432 | 56.8% | 827 | 1105 |

Read honestly: **gzip at level 1 dominates comprexia on four of five datasets
across both axes at once** — smaller output *and* faster compression, with zero
install cost. LZ4 is 3–8× faster to compress at a comparable ratio. The single
column comprexia wins outright is decompression of small payloads, where it is
4.7× faster than gzip; that is a real property of a decoder with no entropy
stage, and it is the thread worth pulling on.

The gap is also explainable rather than mysterious. The match finder inserts
every position into a `std::unordered_map`, which is roughly the slowest data
structure available for the job, and the format spends a full byte of header on
every short literal run with no entropy coding anywhere. Both are fixable, and
fixing them is what [docs/DESIGN.md](docs/DESIGN.md) describes.

---

## Known defects

These are reproduced by tests and documented deliberately. Do not discover them
in production.

**`compressAdvanced` / `decompressAdvanced` corrupt non-ASCII data.** Do not use
them. Three independent bugs: the interned-token range `0xE0–0xF9` collides with
UTF-8 lead bytes, so Devanagari decodes as English key names; the UTF-8 delta
transform encodes against the previous original byte but decodes against the
previous encoded byte, so accented characters and emoji corrupt; and the JSON
string scanner only handles `\"`, so a string ending in an escaped backslash
desynchronizes the parser. The `fast` and default paths are unaffected and
correct.

**No prebuilt binaries.** `npm install` compiles C++ on the consumer's machine,
so anyone without CMake and a C++20 toolchain cannot install the package at all.

**The middleware does not set `Vary: Accept-Encoding`.** A shared cache or CDN
can store a `cx`-encoded response and serve it to a client that cannot decode
it. Set the header yourself until this is fixed.

**`negotiateEncoding` matches loosely.** It substring-matches `cx`, so any
future encoding token containing those characters would false-positive.

---

## Installation

```bash
npm install @comprexia/cx
```

Requires **Node 18+**, a **C++20 compiler**, and **CMake 3.20+** — the native
addon is compiled during install. Verified in CI on Linux (Node 18, 20, 22),
macOS, and Windows.

Prebuilt binaries are the top roadmap item; until they land, treat the toolchain
requirement as a hard install dependency.

---

## Quick start

```typescript
import { compress, decompress } from '@comprexia/cx'

const original = Buffer.from(JSON.stringify({ id: 1, name: 'संजीव' }))

const packed = compress(original)
const restored = decompress(packed)

restored.equals(original) // true — for any input bytes
```

---

## API reference

| Function | Description |
| --- | --- |
| `compress(input: Buffer): Buffer` | Default encoder. Longer match extension, better ratio. |
| `compressFast(input: Buffer): Buffer` | Speed-oriented encoder, shorter match cap. Used by the middleware. |
| `decompress(input: Buffer): Buffer` | Decodes output from either encoder above. |
| `compressAdvanced(input: Buffer): Buffer` | ⚠️ **Broken for non-ASCII.** See [Known defects](#known-defects). |
| `decompressAdvanced(input: Buffer): Buffer` | ⚠️ **Broken for non-ASCII.** |
| `createCompressorStream(): Transform` | Node `Transform` stream for chunked responses. |
| `negotiateEncoding(header?: string): 'cx' \| undefined` | Returns `'cx'` when the client advertises support. |
| `createComprexiaMiddleware(opts?)` | Express middleware. `opts.level` is `'fast'` (default) or `'advanced'`. |
| `@comprexia/cx/web/decoder` | Browser decoder — `decompressBrowser`, `decompressToString`. |

`compress` and `compressFast` emit the same stream format, so a single
`decompress` reads both. There is no header, no version byte, and no checksum —
a limitation the v2 format fixes.

---

## Integrations

### Express

```typescript
import express from 'express'
import { createComprexiaMiddleware } from '@comprexia/cx'

const app = express()

app.use(createComprexiaMiddleware({ level: 'fast' }))

app.get('/api/posts', (_req, res) => {
  res.json({ success: true, data: [{ id: 1, title: 'hello' }] })
})

app.listen(3001)
```

When the client sends `Accept-Encoding: cx`, the response carries:

| Header | Meaning |
| --- | --- |
| `Content-Encoding: cx` | Body is a comprexia stream |
| `X-Compression-Ratio` | Compressed ÷ original, 3 decimal places |
| `X-Original-Size` | Bytes before compression |
| `X-Compressed-Size` | Bytes on the wire |

Add `Vary: Accept-Encoding` yourself — see [Known defects](#known-defects).
Clients that do not advertise `cx` fall through to the original `res.json`, so
existing gzip middleware keeps working untouched.

### Fastify

```typescript
import Fastify from 'fastify'
import { compressFast, negotiateEncoding } from '@comprexia/cx'

const app = Fastify()

app.decorateReply('cxJson', function (payload: unknown) {
  if (negotiateEncoding(this.request.headers['accept-encoding']) !== 'cx') {
    return this.send(payload)
  }
  return this
    .header('Content-Encoding', 'cx')
    .header('Content-Type', 'application/json')
    .header('Vary', 'Accept-Encoding')
    .send(compressFast(Buffer.from(JSON.stringify(payload))))
})

app.get('/api/posts', async (_req, reply) => (reply as any).cxJson({ data: [] }))

app.listen({ port: 3002 })
```

### NestJS

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common'
import { compressFast, negotiateEncoding } from '@comprexia/cx'

@Injectable()
export class ComprexiaMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const originalJson = res.json.bind(res)
    res.json = (body: unknown) => {
      if (negotiateEncoding(req.headers['accept-encoding']) !== 'cx') {
        return originalJson(body)
      }
      res.setHeader('Content-Encoding', 'cx')
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Vary', 'Accept-Encoding')
      return res.send(compressFast(Buffer.from(JSON.stringify(body))))
    }
    next()
  }
}
```

### Streaming responses

```javascript
const { negotiateEncoding, createCompressorStream } = require('@comprexia/cx')

app.get('/events', (req, res) => {
  if (negotiateEncoding(req.headers['accept-encoding']) !== 'cx') {
    return res.json({ error: 'cx encoding required' })
  }

  res.setHeader('Content-Encoding', 'cx')

  const stream = createCompressorStream()
  stream.pipe(res)
  stream.write(Buffer.from(JSON.stringify({ type: 'init' })))

  const timer = setInterval(() => {
    stream.write(Buffer.from(JSON.stringify({ type: 'tick', t: Date.now() })))
  }, 1000)

  req.on('close', () => {
    clearInterval(timer)
    stream.end()
  })
})
```

The encoder keeps its match window across chunks, so repeated structure between
messages still compresses. Always clear timers on `close` — the example in
earlier docs leaked an interval per connection.

### Browser decoding

```typescript
import axios from 'axios'
import { decompressToString } from '@comprexia/cx/web/decoder'

const api = axios.create({ baseURL: '/api' })

async function fetchJson<T>(path: string): Promise<T> {
  const res = await api.get(path, {
    responseType: 'arraybuffer',
    headers: { 'Accept-Encoding': 'cx' },
  })

  if (res.headers['content-encoding'] === 'cx') {
    return JSON.parse(decompressToString(res.data))
  }
  return JSON.parse(new TextDecoder().decode(new Uint8Array(res.data)))
}
```

The browser decoder handles the `fast` and default formats — the only two you
should be using. It is dependency-free and mirrors the native decoder's logic.

> **Note:** browsers control the real `Accept-Encoding` header on `fetch`/`XHR`
> and will strip a manual override. In practice you negotiate `cx` with a custom
> header or a query parameter, or you use this in a non-browser client.

---

## Stream format

The v0.1 format is a bare sequence of blocks with no container, no version, and
no checksum:

| Block | Header | Payload |
| --- | --- | --- |
| Literal | `0x00–0x7F` = byte count | that many literal bytes |
| Match | `0x80 \| (len - 3)`, len ≤ 130 | 2-byte distance, little-endian |
| Extended match | `0xFF` | 2-byte length, then 2-byte distance |

Window size is 64 kB (16-bit distances). Minimum match is 4 bytes.

The absence of framing is a real design flaw, not a simplification: corruption
is undetectable, and the format cannot evolve without silently breaking deployed
decoders. The v2 container fixes this with a magic number, a version byte, a
feature-flag byte, and a checksum over the original data.

---

## Architecture

```
src/cx_core/
  encoder.cpp       LZ77 match finder + block emitter
  decoder.cpp       literal/match replay
  preprocessor.cpp  JSON tokenizer and UTF-8 transforms (advanced mode)
  stream.cpp        chunked encoder state
src/cx_bindings/
  addon.cc          N-API surface
node/               TypeScript wrapper, middleware, browser decoder
test/cpp/           ASan/UBSan roundtrip fuzz harness
```

The encoder hashes 4-byte sequences and keeps one candidate position per hash,
extending matches forward on a hit. `compress` extends up to 258 bytes;
`compressFast` caps at 64 for tighter inner loops. The decoder replays literal
runs and back-references with no entropy stage, which is why decompression is
fast and the ratio is mediocre — the two are the same trade.

Every codec change is compiled with AddressSanitizer and UndefinedBehaviorSanitizer
in CI and run against a deterministic fuzz harness covering random, repetitive,
JSON, and multilingual inputs. That gate has already caught real bugs: an
unaligned `uint32_t` load in the match finder, and missing standard includes that
made the package fail to compile on Linux entirely.

---

## When to use what

| Situation | Use |
| --- | --- |
| Serving production API traffic today | `gzip` level 1–6, built into Node |
| Maximum ratio for static assets | `brotli` level 11 |
| Maximum throughput, ratio secondary | `lz4` |
| Modern Node with the best all-round balance | `zstd` — built into `node:zlib` since Node 23.8 |
| Many small responses sharing a schema | zstd or brotli with a **trained dictionary** |
| Learning how an LZ codec works end to end | this repository |

Being clear about this costs nothing and is the whole point of publishing real
numbers. Comprexia earns a place on that list when the v2 format lands, not
before.

---

## Roadmap

The direction is set by where the ecosystem actually has a gap, not by trying to
out-tune LZ4. Zstd and brotli both ship in Node now; competing with them on
general-purpose ratio is a losing race. **Dictionary compression is the open
niche** — a trained dictionary can take a small JSON payload from roughly 32% of
original size down to under 10%, which is exactly where every general-purpose
codec (including this one, at 0.454) is weakest. The
[Compression Dictionary Transport](https://developer.mozilla.org/en-US/docs/Glossary/Compression_dictionary_transport)
standard shipped in Chrome 130 with the `dcb` and `dcz` encoding tokens, and the
Node ecosystem has no middleware for it.

1. **M1 — v2 container and LZ core.** Framed format with version and checksum,
   flat-array match finder replacing the hash map, fully bounds-checked decoder.
2. **M2 — browser decoder parity.** Shared test vectors between native and JS.
3. **M3 — dictionary support.** Train a dictionary from sample payloads, ship it
   to clients, negotiate it over HTTP.
4. **M4 — prebuilt binaries.** `npm install` with no toolchain.

Full rationale, format sketches, and the design rules derived from each v0.1
defect are in [docs/DESIGN.md](docs/DESIGN.md).

---

## Building from source

```bash
npm install            # installs deps and compiles the addon
npm run build          # TypeScript → dist/
npm run build:release  # native addon, Release mode
npm test               # roundtrip + stream tests
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run bench:honest   # realistic benchmark suite
```

Sanitizer harness, the gate that matters for codec changes:

```bash
g++ -std=c++20 -O1 -g -fsanitize=address,undefined -fno-sanitize-recover=all \
  -Iinclude -Isrc/cx_core \
  test/cpp/roundtrip_fuzz.cpp src/cx_core/*.cpp -o roundtrip_fuzz
./roundtrip_fuzz
```

---

## Security

The decoder parses attacker-controllable bytes by design. Report vulnerabilities
privately — see [SECURITY.md](SECURITY.md). Never open a public issue for one.

Two operational notes that apply to every compressor, not just this one:

- **Do not compress secrets mixed with attacker-controlled input** over a channel
  an attacker can measure. That is the BREACH/CRIME class of attack, and
  compression is an optimization, never a security boundary.
- **Bound your inputs.** A decompressor turns small inputs into large outputs by
  definition; cap the accepted compressed size at your edge.

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md).

The bar for codec changes: the sanitizer harness passes, roundtrip tests cover
non-ASCII input, and any format change updates the native decoder, the browser
decoder, and the format table in this README together. Commits follow
[Conventional Commits](https://www.conventionalcommits.org) — releases are cut
automatically from them.

Good first issues live in [docs/DESIGN.md](docs/DESIGN.md): every defect listed
there is a well-specified, self-contained fix.

---

## License

[MIT](LICENSE) © WebCoderSpeed
