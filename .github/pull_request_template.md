<!--
Thanks for contributing to Comprexia!

Commit titles follow Conventional Commits — the release version is derived
from them automatically:
  feat: …      → minor release
  fix: …       → patch release
  perf: …      → patch release
  docs: …      → patch release
  chore: …     → no release
  feat!: …     → major release (or a "BREAKING CHANGE:" footer)
-->

## What does this change?

<!-- A short description of the change and the problem it solves. -->

## Why?

<!-- Link the issue it closes, e.g. "Closes #123", or explain the motivation. -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds capability)
- [ ] Breaking change (existing API or stream format behaves differently)
- [ ] Performance improvement
- [ ] Documentation only
- [ ] Internal / tooling

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass locally
- [ ] Roundtrip tests cover this change — including non-ASCII input (UTF-8, emoji) where relevant
- [ ] Codec changes ran clean under sanitizers (`test/cpp/roundtrip_fuzz.cpp` with ASan/UBSan)
- [ ] Stream-format changes are reflected in the decoder, the browser decoder, and the README format spec
- [ ] Benchmarks were run for performance-sensitive changes (`npm run bench`) and results included above
- [ ] Public API changes are documented in the README

## Notes for reviewers

<!-- Anything tricky, intentional trade-offs, or areas you want scrutinised. -->
