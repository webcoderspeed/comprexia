# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅ latest release only |

## Reporting a Vulnerability

Please **do not** open a public issue for security problems.

Report privately via [GitHub Security Advisories](https://github.com/webcoderspeed/comprexia/security/advisories/new),
or email **webcoderspeed@gmail.com** with `[SECURITY comprexia]` in the subject.

You can expect an acknowledgement within 72 hours. Once a fix is released,
the advisory is published with credit to the reporter (unless you prefer to
stay anonymous).

## Scope Notes for a Compression Library

The decoder parses attacker-controllable bytes by design. Reports we consider
in scope include, but are not limited to:

- Out-of-bounds reads/writes or crashes triggered by crafted compressed streams
- Decompression bombs — small inputs producing pathologically large outputs
  without a way for callers to bound the result
- Memory exhaustion or hangs on malformed input
- Incorrect roundtrips that silently corrupt data

Out of scope:

- Compression-side-channel attacks (BREACH/CRIME-style). Like every
  compressor, Comprexia must not be applied to payloads mixing secrets with
  attacker-controlled data; this is documented in the README and is the
  caller's responsibility.
- Vulnerabilities in example applications under `examples/`

## Hardening Expectations

Every codec change runs under AddressSanitizer and UBSan in CI against a
deterministic roundtrip fuzzing harness (`test/cpp/roundtrip_fuzz.cpp`).
If you find an input that crashes it, that is a reportable bug.
