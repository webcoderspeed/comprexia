# Changelog

All notable changes to **comprexia** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org).

## [0.1.9](https://github.com/webcoderspeed/comprexia/compare/v0.1.8...v0.1.9) (2026-08-12)

### 📚 Documentation

* correct the release these fixes shipped in ([6261056](https://github.com/webcoderspeed/comprexia/commit/6261056040c82e59c20d06e9fba82a17b145bbf2))

## [0.1.8](https://github.com/webcoderspeed/comprexia/compare/v0.1.7...v0.1.8) (2026-08-12)

### 🐛 Bug Fixes

* repair streaming format, bound decompression, and stop mislabelling advanced payloads ([6b32644](https://github.com/webcoderspeed/comprexia/commit/6b3264443a4d6daae2ee0f3c5fec6c5a6c24812f))

## [0.1.7](https://github.com/webcoderspeed/comprexia/compare/v0.1.6...v0.1.7) (2026-08-12)

### 📚 Documentation

* label the encoder rewrite 0.1.6, not 0.2.0 ([ed46a64](https://github.com/webcoderspeed/comprexia/commit/ed46a64945cb4c565fd5fb84d67e3cf6baba1bae))

## [0.1.6](https://github.com/webcoderspeed/comprexia/compare/v0.1.5...v0.1.6) (2026-08-12)

### ⚡ Performance

* rewrite the match finder and fix a format-level corruption bug ([0a7862c](https://github.com/webcoderspeed/comprexia/commit/0a7862cc2de84b7fc4fe397e784a45d6c3f79c26))

## [0.1.5](https://github.com/webcoderspeed/comprexia/compare/v0.1.4...v0.1.5) (2026-08-12)

### 🐛 Bug Fixes

* **build:** export package.json ([b0fe759](https://github.com/webcoderspeed/comprexia/commit/b0fe759b39345ee0a70a2f3e69f35cc2d46df752))

## [0.1.4](https://github.com/webcoderspeed/comprexia/compare/v0.1.3...v0.1.4) (2026-08-12)

### 🐛 Bug Fixes

* **build:** make the published package actually installable ([b2dba5e](https://github.com/webcoderspeed/comprexia/commit/b2dba5eaac4b851ebf2143df1a151a54c7f14444))

## [0.1.3](https://github.com/webcoderspeed/comprexia/compare/v0.1.2...v0.1.3) (2026-08-12)

### 🐛 Bug Fixes

* harden decoder and repair the advanced transform ([60eb2e3](https://github.com/webcoderspeed/comprexia/commit/60eb2e3a16322171897692f97493f30ae98c526f))

## [0.1.2](https://github.com/webcoderspeed/comprexia/compare/v0.1.1...v0.1.2) (2026-08-12)

### 🐛 Bug Fixes

* **build:** add missing standard includes for gcc ([acbb589](https://github.com/webcoderspeed/comprexia/commit/acbb58950a7f51e5d7a45ebf2ebdc7c3fb021b37))
* **encoder:** replace misaligned uint32 casts with memcpy loads ([a1a31f2](https://github.com/webcoderspeed/comprexia/commit/a1a31f2de302528d72cf420e8576bd058e562fa0))
* restore package entry points broken by dist layout ([004810a](https://github.com/webcoderspeed/comprexia/commit/004810a49a884e1ccfcde00e205b92f85d26e95a))

### 📚 Documentation

* add cx2 design doc, security policy, and code of conduct ([a8262ce](https://github.com/webcoderspeed/comprexia/commit/a8262ce0a50ecd00e2ab648ee1d5bba9fd5baa60))
* expand README to detailed 2000+ words; chore: fix exports and web decoder docs ([8f5a52a](https://github.com/webcoderspeed/comprexia/commit/8f5a52a2bdf4a1e7b15265e68c61fe5ad9e96239))
* rewrite README around measured benchmarks ([2a760b9](https://github.com/webcoderspeed/comprexia/commit/2a760b9feadae3110e16d39d2f82f965d68168c9))
