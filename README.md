# comprexia

<p align="center">
  <strong>A JSON-aware compression codec for Node.js APIs, written in C++20.</strong><br/>
  Native N-API addon &middot; Streaming encoder &middot; Express middleware &middot; Browser decoder<br/>
  <em>Status: v0.x prototype — see <a href="#honest-status">Honest status</a> before you deploy it.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/comprexia"><img src="https://img.shields.io/npm/v/comprexia" alt="npm version"/></a>
  <a href="https://github.com/webcoderspeed/comprexia/actions/workflows/ci.yml"><img src="https://github.com/webcoderspeed/comprexia/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="https://github.com/webcoderspeed/comprexia/actions/workflows/codeql.yml"><img src="https://github.com/webcoderspeed/comprexia/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT"/></a>
  <img src="https://img.shields.io/badge/C%2B%2B-20-blue" alt="C++20"/>
  <img src="https://img.shields.io/badge/Node.js-18%2B-green" alt="Node 18+"/>
  <img src="https://img.shields.io/badge/ASan%20%C2%B7%20UBSan-enforced-brightgreen" alt="sanitizers enforced"/>
</p>

<p align="center">
  <a href="https://github.com/webcoderspeed/comprexia">GitHub</a> &middot;
  <a href="https://www.npmjs.com/package/comprexia">npm</a> &middot;
  <a href="https://github.com/webcoderspeed/comprexia/issues">Issues</a> &middot;
  <a href="docs/DESIGN.md">Design doc</a>
</p>

---

## Honest status

Most compression libraries open with a benchmark that flatters them. This one
opens with the benchmark that does not.

**Comprexia is a working prototype, not yet a production codec.** As of 0.1.6 it
compresses 2–6× faster than `gzip -1`, but `gzip -1` still produces *smaller*
output on every dataset tested — and it is built into Node, needs no native
addon, and runs everywhere. Until the ratio gap closes, that is the honest
trade. The numbers are in [Benchmarks](#benchmarks), reproducible with
`npm run bench:honest`.

An earlier version of this README quoted 1206 MB/s. That figure came from a
benchmark that concatenated one sample file until it reached 1 MB — near-pure
repetition, which every LZ codec devours. It was not a lie so much as a
measurement of nothing. It has been replaced.

What is genuinely here today:

- A **correct** codec on every path. Arbitrary bytes — UTF-8, Devanagari, emoji,
  binary, every value 0x00–0xFF — round-trip byte-exactly through all three
  encoders, fuzzed under AddressSanitizer and UBSan on every commit.
- A **hardened decoder**. Malformed streams raise a catchable error instead of
  reading out of bounds, in both the native and browser decoders.
- **Fast decompression on small payloads**: 439 MB/s on a 1.5 kB response versus
  gzip's 93 MB/s. This is the one axis where the design currently pays off.
- Working **Express middleware**, **Node streams**, and a **browser decoder**
  small enough to inline.

What is not here: a competitive compression ratio or competitive encode speed.
See [Known limitations](#known-limitations) — they are documented rather than
hidden, and [docs/DESIGN.md](docs/DESIGN.md) is the plan for fixing them.

Use this today if you want to read, learn from, or contribute to a compression
codec. Do not use it to serve production traffic yet.

---

## Table of contents

- [Honest status](#honest-status)
- [Benchmarks](#benchmarks)
- [Known limitations](#known-limitations)
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
| comprexia-fast | 0.197 | 80.3% | 959 | 216 |
| gzip-1 | 0.148 | 85.2% | 465 | 178 |
| gzip-6 | 0.114 | 88.6% | 133 | 170 |
| brotli-4 | 0.122 | 87.8% | 232 | 126 |
| brotli-11 | 0.086 | 91.4% | 1 | 98 |
| **lz4** | 0.211 | 78.9% | **1451** | **965** |

**Multilingual JSON — Hindi, Bengali, Tamil, emoji, 355 kB**

| Codec | Ratio | Saved | Compress MB/s | Decompress MB/s |
| --- | ---: | ---: | ---: | ---: |
| comprexia-fast | 0.095 | 90.5% | 2195 | 275 |
| gzip-1 | 0.047 | 95.3% | 1080 | 135 |
| brotli-4 | 0.038 | 96.2% | 532 | 112 |
| **lz4** | 0.064 | 93.6% | **3617** | 626 |

**Small API response — 1.5 kB**

| Codec | Ratio | Saved | Compress MB/s | Decompress MB/s |
| --- | ---: | ---: | ---: | ---: |
| comprexia-fast | 0.456 | 54.4% | 660 | 472 |
| gzip-1 | 0.328 | 67.2% | 128 | 102 |
| brotli-4 | 0.296 | 70.4% | 62 | 79 |
| lz4 | 0.432 | 56.8% | 877 | **1028** |

Read honestly: after the 0.1.6 encoder rewrite, **comprexia compresses 2–6×
faster than gzip level 1** on every dataset, and small responses — its worst
case at 81 MB/s before — improved 8× to 660 MB/s. Against LZ4 the compression
gap narrowed from 3–8× to roughly 1.5×.

What has not changed is the **ratio**, and that is still the honest weak spot:
gzip level 1 produces smaller output than comprexia on every dataset here, at a
third of the speed. Decompression also remains far behind LZ4 (216 vs 965 MB/s
on the API list) because the decoder still copies matches through
`std::vector`'s append path rather than the over-allocated wildcopy LZ4 uses.

Both gaps have known causes rather than mysterious ones. The ratio needs an
entropy coding stage, which is what separates LZ4 from gzip and zstd; the
decoder needs wildcopy. Both are described in [docs/DESIGN.md](docs/DESIGN.md).

---

## Known limitations

Honest boundaries of the current release. Each is a limitation of scope, not a
correctness bug — the correctness bugs that used to live here are fixed and
locked down by [`test/node/defects.test.js`](test/node/defects.test.js).

**No prebuilt binaries.** `npm install` compiles C++ on the consumer's machine,
so anyone without CMake and a C++20 toolchain cannot install the package at all.
This is the single biggest barrier to adoption and the top roadmap item.

**No container framing.** The stream carries no magic number, version, or
checksum, so corruption is undetectable and the format cannot evolve without
breaking deployed decoders. Fixed by the v2 container.

**Streaming does not match across chunk boundaries.** `createCompressorStream`
restarts its match search for each chunk, so repeated structure *between*
messages is not exploited. Correct, but it leaves ratio on the table for event
streams — exactly the workload streaming exists for.

**The ratio is not competitive.** See [Benchmarks](#benchmarks). This is the
honest state of a hand-written LZ with no entropy coding stage — the missing
piece is Huffman or FSE over literals and lengths, not more match-finder tuning.

**Decompression trails LZ4 by ~4×.** Matches are copied through `std::vector`'s
append path rather than the over-allocated wildcopy LZ4 uses.

### Fixed in 0.1.8

- **The streaming encoder produced output its own decoder rejected.** It was a
  second, independent implementation of the block format and never received the
  130-byte fix below, so any stream containing a repeat of that length either
  threw or silently decoded to wrong bytes. Both encoders now write blocks
  through one shared definition, and the fuzz harness exercises the streaming
  path across several chunk sizes.
- **Decompression was unbounded.** Five bytes of extended match block emit up to
  65535, so 100 kB of crafted input decoded to 1.3 GB and could exhaust a
  server's memory. All decode entry points now accept `maxOutputLength` and
  default to 256 MB.
- **`level: 'advanced'` sent undecodable responses.** It labelled its output
  `Content-Encoding: cx` — the same coding as the fast format, which reverses a
  different transform — so clients silently decoded corrupt JSON. Advanced
  payloads now use `cx-adv`, negotiated separately, and the browser decoder
  gained `decompressAdvancedToString` to read them.
- **A failed send left `Content-Encoding` on a plain body.** The middleware set
  headers before compressing, so falling back to uncompressed JSON kept the
  encoding header committed.
- **`Accept-Encoding: cx;q=0, *` was read as acceptance.** Per RFC 9110 §12.5.3
  a wildcard only covers codings not explicitly listed, so an explicit refusal
  now wins regardless of ordering.

### Fixed in 0.1.6

- **A 130-byte match silently corrupted data.** Short match blocks encode
  `len - 3` in seven bits, so `len == 130` emitted header `0xFF` — which is the
  extended-match marker. The decoder misread it and returned wrong bytes, or
  threw, depending on what followed. Random fuzzing never happened to land on
  the single length that breaks; a systematic sweep of every match length from
  1 to 320 now runs on every commit. Short blocks stop at 129, which keeps
  `0xFF` unambiguous and leaves the format readable by older decoders.

### Fixed in 0.1.3

- **Advanced mode corrupted all non-ASCII data.** Three separate bugs — a token
  range colliding with UTF-8 lead bytes, a delta transform that was not
  invertible, and a JSON string scanner that mishandled escaped backslashes.
  The transform was rebuilt to be byte-exact and escape-safe; it no longer
  parses JSON at all, which is why it can be fuzzed against arbitrary bytes.
- **The decoder read out of bounds on crafted streams.** A back-reference
  distance larger than the output produced a buffer underflow — reachable from
  any untrusted response body. Every field is now validated, and both the native
  and browser decoders raise a catchable error instead.
- **The middleware omitted `Vary: Accept-Encoding`**, letting a shared cache
  serve a `cx` body to a client that cannot decode it.
- **`negotiateEncoding` substring-matched `cx`**, so `cxfuture` was a false
  positive and `cx;q=0` — an explicit refusal — was treated as support.

---

## Installation

```bash
npm install comprexia
```

Requires **Node 18+**, a **C++20 compiler**, and **CMake 3.20+** — the native
addon is compiled during install. Verified in CI on Linux (Node 18, 20, 22),
macOS, and Windows.

Prebuilt binaries are the top roadmap item; until they land, treat the toolchain
requirement as a hard install dependency.

---

## Quick start

```typescript
import { compress, decompress } from 'comprexia'

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
| `decompress(input, options?)` | Decodes output from either encoder above. `options.maxOutputLength` caps the result, defaulting to 256 MB. |
| `compressAdvanced(input: Buffer): Buffer` | Applies the substitution transform before compressing. ~5% smaller than `compress` when common keys appear; neutral otherwise. |
| `decompressAdvanced(input, options?)` | Reverses `compressAdvanced`. Not interchangeable with `decompress`. |
| `createCompressorStream(): Transform` | Node `Transform` stream for chunked responses. |
| `negotiateEncoding(header?: string): 'cx' \| undefined` | Parses `Accept-Encoding` per RFC 9110 — whole tokens, `q=0`, explicit entries outranking `*`. |
| `acceptsCoding(header, coding): boolean` | The same negotiation for any coding, e.g. `cx-adv`. |
| `createComprexiaMiddleware(opts?)` | Express middleware. `opts.level` is `'fast'` (default) or `'advanced'`. |
| `comprexia/web/decoder` | Browser decoder — `decompressToString`, `decompressAdvancedToString`, `decompressBrowser`, `decompressAdvancedBrowser`, `ComprexiaDecodeError`. |

`compress` and `compressFast` emit the same stream format, so a single
`decompress` reads both. `compressAdvanced` does not — it applies a transform
that only `decompressAdvanced` reverses. Because the format carries no version
byte, nothing detects that mismatch for you; pair them correctly.

All decode entry points throw on malformed input rather than returning partial
or garbage data, so wrap them in `try`/`catch` when the bytes come from
somewhere you do not control. They also bound their output at 256 MB by
default: five bytes of extended match block expand to 65535, so an unbounded
decoder turns a small hostile body into gigabytes. Pass
`{ maxOutputLength: 0 }` to lift the cap, and only for input you produced.

---

## Integrations

### Express

```typescript
import express from 'express'
import { createComprexiaMiddleware } from 'comprexia'

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

`Vary: Accept-Encoding` is set automatically, so shared caches key the response
correctly. Clients that do not advertise `cx` fall through to the original
`res.json`, leaving existing gzip middleware untouched.

### Fastify

```typescript
import Fastify from 'fastify'
import { compressFast, negotiateEncoding } from 'comprexia'

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
import { compressFast, negotiateEncoding } from 'comprexia'

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
const { negotiateEncoding, createCompressorStream } = require('comprexia')

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

Each chunk is matched independently — repeated structure *between* messages is
not yet exploited, so streaming trades ratio for incrementality. See
[Known limitations](#known-limitations). Always clear timers on `close`; the
example in earlier docs leaked an interval per connection.

### Browser decoding

```typescript
import axios from 'axios'
import { decompressToString } from 'comprexia/web/decoder'

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

The browser decoder is dependency-free and mirrors the native decoder,
including its validation and its 256 MB output cap. Match the function to the
coding the server sent: `Content-Encoding: cx` decodes with
`decompressToString`, and `cx-adv` with `decompressAdvancedToString`. The two
formats are not interchangeable and nothing in the bytes distinguishes them —
that is exactly why advanced payloads carry their own coding.

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

The encoder hashes 4-byte sequences into a flat, power-of-two table sized to the
input, keeping one candidate position per slot and extending matches eight bytes
at a time. `compress` extends up to 258 bytes and uses extended match blocks for
long repeats; `compressFast` caps at 64 for tighter inner loops. The decoder
replays literal runs and back-references with no entropy stage, which is why the
ratio is mediocre — speed and ratio are the same trade here.

Sizing the hash table to the input matters more than it looks: a fixed 64 k-entry
table costs a 256 kB clear, which for a 1.5 kB API response is far more work than
the compression itself.

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
