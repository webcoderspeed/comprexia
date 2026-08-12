# Comprexia v2 — Format & Algorithm Design

This is the working design for the from-scratch rewrite of the codec (the
"cx2" format). It exists so every implementation decision has a written
rationale and so the mistakes of v0.1 are not repeated.

## Lessons from v0.1

These are confirmed defects in the current codebase, each reproduced with a
failing input. The v2 format is designed so this class of bug cannot exist.

1. **Token collisions with raw UTF-8.** The JSON preprocessor assigns tokens
   in `0xE0–0xF9`, which overlap lead bytes of 3- and 4-byte UTF-8 sequences.
   Devanagari (`0xE0 0xA4 …`) round-tripped as the interned token for `"id"`.
   *Rule for v2: transformed output must live in an unambiguous space —
   length-prefixed events, never in-band magic bytes.*
2. **Non-invertible delta transform.** UTF-8 continuation-byte deltas were
   encoded against the previous *original* byte but decoded against the
   previous *encoded* byte. Any character with two or more continuation bytes
   corrupts. *Rule: every transform ships with a property test proving
   `decode(encode(x)) == x` over fuzzed inputs before it is wired in.*
3. **Incomplete JSON string parsing.** Only `\"` was special-cased, so a
   string ending in an escaped backslash (`"C:\\Users\\"`) desynchronized the
   parser. *Rule: the structure layer uses a real JSON string scanner
   (all escapes, surrogate pairs) or it does not ship.*
4. **Unbounded back-references in the decoder.** `out.size() - dist`
   underflowed on crafted input — an out-of-bounds read on attacker-controlled
   bytes. *Rule: the v2 decoder validates every offset/length against the
   window before copying, and callers can cap the output size.*
5. **Slow match finder.** `std::unordered_map<uint32_t, size_t>` per-position
   insert dominated encode time. *Rule: flat arrays only on the hot path.*
   **Fixed in 0.2.0** — a flat, input-sized table plus 64-bit match comparison
   made encoding 2–8× faster.
7. **Header collision at match length 130.** A short match block encodes
   `len - 3` in seven bits, so `len == 130` produced header `0xFF` — the
   extended-match marker — and the decoder misread it, silently corrupting any
   payload containing a 130-byte repeat. Random fuzzing never landed on the one
   length that breaks. *Rule: sweep boundary values exhaustively; do not rely on
   random inputs to find format edge cases.* **Fixed in 0.2.0.**
6. **No framing.** v0.1 streams carry no magic, version, or checksum, so
   corruption is undetectable and format evolution is impossible.

## Where the codec actually stands (measured, Aug 2026)

`npm run bench:honest` on realistic payloads, competitors at production
settings. Full tables in the README; the summary that drives this design:

- **gzip level 1 beats comprexia on both ratio and encode speed** on four of
  five datasets. It is built into Node and needs no addon.
- **LZ4 is 3–8× faster to compress** at a comparable ratio (1458–3587 MB/s vs
  our 81–671 MB/s), with prebuilt npm binaries.
- The one axis we win: **decompression of small payloads**, 439 MB/s vs gzip's
  93 MB/s. A decoder with no entropy stage is genuinely fast; that is the
  property worth building on.

The old "1206 MB/s" figure came from a benchmark that concatenated one file to
1 MB — near-pure repetition. Any new claim must come from `bench:honest`.

**Update (0.2.0):** the first half of that gap is closed. Replacing the hash map
with a flat, input-sized table and comparing eight bytes at a time made encoding
2–8× faster — comprexia now compresses 2–6× faster than `gzip -1` and sits
within ~1.5× of LZ4. Sizing the table to the input rather than fixing it at 64 k
entries mattered most for small payloads, where clearing a 256 kB table had cost
more than the compression itself: 81 → 660 MB/s on a 1.5 kB response.

What remains is **ratio**, and it needs an entropy coding stage — Huffman or
FSE over literals and lengths. That is the difference between LZ4-class output
and gzip-class output, and no amount of match-finder tuning substitutes for it.
Decode also still trails LZ4 badly (216 vs 965 MB/s) because matches are copied
through `std::vector`'s append path instead of an over-allocated wildcopy.

## Competitive landscape — why v2 targets dictionaries

The ecosystem moved while v0.1 was being written:

- **Zstd ships inside Node** (`node:zlib`, since v23.8). A native addon that
  offers general-purpose ratio now competes with something already installed,
  maintained by Meta, and tuned for a decade. That race is unwinnable and not
  worth entering.
- **LZ4 owns the fast lane** and already has npm prebuilds.
- **msgpackr / cbor-x attack the problem one layer up**, replacing
  `JSON.stringify` entirely and beating it on both speed and size.

The open gap is **dictionary compression**. A dictionary trained on a family of
similar payloads takes small JSON from roughly 32% of original size to under
10% — precisely the regime where every general-purpose codec is weakest, and
where comprexia is worst today (0.454 on a 1.5 kB response). Dictionaries also
*speed up* compression rather than trading against it.

This is now a web standard, not a niche trick: Compression Dictionary Transport
shipped in Chrome 130 with the `dcb` (brotli) and `dcz` (zstd) content-encoding
tokens, and Google Search measured 23% smaller HTML using it. The Go ecosystem
has middleware for this; **Node has none**.

So v2's differentiator is not "a faster LZ" — it is **making dictionary-based
compression easy for a Node API**: train a dictionary from real traffic samples,
ship it to clients, negotiate it over HTTP, and fall back cleanly. The LZ core
below still has to be correct and fast, but it is the foundation, not the pitch.

## Goals

- **Latency-first**: beat gzip on encode throughput by a wide margin at a
  ratio that is acceptable for JSON APIs; be honest that Brotli/Zstd win on
  ratio.
- **Byte-exact roundtrip** for arbitrary bytes in every mode. JSON awareness
  is an optimization, never an assumption.
- **Safe on hostile input**: the decoder is fully bounds-checked and fuzzed
  under sanitizers in CI.
- **Format stability**: versioned container so v3 can evolve without breaking
  deployed decoders.

Non-goals: competing with Zstd/Brotli on maximum ratio; supporting Node < 18.

## Container format

```
[magic "CX2" (3 bytes)] [version (1)] [flags (1)] [orig_size varint]
[payload …] [xxhash32 of original data (4)]
```

- `flags` bit 0: JSON structure layer applied. Bits 1–7 reserved (must be 0).
- The checksum makes silent corruption (and transform bugs) loud.

## Block format — LZ sequences

LZ4-style sequences replace v0.1's header-byte blocks:

```
token: [litlen:4][matchlen:4]
  litlen  == 15 → varint extension follows
  literals (litlen bytes)
  offset: 2 bytes LE (0 is invalid; offset > window is invalid)
  matchlen == 15 → varint extension; actual match = matchlen + 4 (minmatch)
```

- Window: 64 KB initially (16-bit offsets keep the decoder trivial and the
  browser decoder small). A future flag can widen it.
- Match finder: flat `uint32_t table[1 << 16]` indexed by a real hash
  (multiplicative, e.g. `(load32(p) * 2654435761u) >> 16`), single probe for
  `fast`. `advanced` adds a chained table + lazy one-step-ahead matching.
- End of stream: final sequence carries literals only (per LZ4 convention).

## JSON structure layer (opt-in, flag bit 0)

Applied before LZ, and only when the payload parses as JSON:

1. Scan with a correct JSON tokenizer (full escape handling). If parsing
   fails anywhere, ship the raw bytes with the flag off — never guess.
2. Build a per-message key dictionary: object keys ordered by frequency,
   emitted once in a length-prefixed table. Repeated keys become varint ids.
   This is schema-agnostic — Hindi keys, camelCase, anything.
3. Emit values as tagged, length-prefixed events (string/number/true/false/
   null/object/array). No in-band sentinel bytes anywhere.

The transform is validated by a dedicated invertibility fuzzer before the LZ
stage ever sees it.

## Verification gates (all in CI)

- `test/cpp/roundtrip_fuzz.cpp` — deterministic fuzz roundtrips under
  ASan/UBSan (already running for v0.1 paths).
- Malformed-stream corpus: truncated streams, invalid offsets, varint bombs —
  decoder must reject, never crash, never over-allocate.
- Benchmarks against gzip, Brotli, Zstd **and LZ4** on realistic payloads
  (API JSON incl. Devanagari/emoji, not just synthetic repetition).

## Milestones

1. **M1 — container + LZ core**: framing, checksum, flat-table fast encoder,
   bounds-checked decoder, fuzz gates green. Replaces `compress`/`decompress`.
2. **M2 — browser decoder parity**: TypeScript decoder for the full v2
   format, shared test vectors with the native side.
3. **M3 — JSON layer**: tokenizer + key dictionary behind the flag, its own
   fuzzer, honest before/after benchmarks.
4. **M4 — trained dictionaries**: build a dictionary from sample payloads,
   reference it by hash in the container, negotiate it over HTTP, and provide
   the middleware that makes this a two-line change for an Express app. This is
   the milestone that gives the project a reason to exist alongside zstd.
5. **M5 — ship**: prebuilt binaries (prebuildify) so `npm install` needs no
   toolchain, README rewritten around measured v2 numbers.

## Open question worth settling early

If dictionaries are the differentiator, an honest fork in the road: the
dictionary middleware could sit on top of **Node's built-in zstd** instead of a
custom codec, and would almost certainly beat a hand-written LZ on ratio from
day one. That path trades away the fun of writing a codec for a product people
would actually deploy. Both are legitimate; pick deliberately rather than by
default, and let `bench:honest` decide it with numbers.
