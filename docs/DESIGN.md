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
   insert dominates encode time. *Rule: flat arrays only on the hot path.*
6. **No framing.** v0.1 streams carry no magic, version, or checksum, so
   corruption is undetectable and format evolution is impossible.

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
4. **M4 — ship**: prebuilt binaries (prebuildify) so `npm install` needs no
   toolchain, README rewritten around measured v2 numbers.
