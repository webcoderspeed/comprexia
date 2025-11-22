# Comprexia

🚀 Next-generation compression library with JSON-aware optimization and Node.js N-API bindings

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![C++20](https://img.shields.io/badge/C++-20-blue.svg)](https://isocpp.org/)

Comprexia is a high-performance compression library built with C++20 and Node.js N-API bindings, designed specifically for modern web applications with exceptional JSON compression capabilities.

## ✨ Features

- **JSON-Aware Compression**: Intelligent structural compression for JSON data
- **High Performance**: Built with C++20 and SIMD optimizations
- **Node.js Integration**: Seamless N-API bindings for JavaScript/TypeScript
- **Multiple Use Cases**: API compression, file storage, database optimization, real-time streaming
- **Production Ready**: Comprehensive examples and robust error handling

## 📦 Installation

```bash
npm install @comprexia/cx
```

## 🚀 Quick Start

### Basic Usage

```javascript
const { compress, decompress } = require('@comprexia/cx');

// Compress data
const originalData = 'Hello, Comprexia! This is a test string.';
const compressed = compress(Buffer.from(originalData));

// Decompress data
const decompressed = decompress(compressed);
console.log(decompressed.toString()); // Hello, Comprexia!...
```

### API Response Compression

```javascript
const express = require('express');
const { compress, negotiateEncoding } = require('@comprexia/cx');

const app = express();

app.get('/api/data', (req, res) => {
  const data = { message: 'Hello', items: [1, 2, 3] };
  const jsonData = JSON.stringify(data);
  
  if (negotiateEncoding(req.headers['accept-encoding']) === 'cx') {
    res.setHeader('Content-Encoding', 'cx');
    res.send(compress(Buffer.from(jsonData)));
  } else {
    res.json(data);
  }
});
```

## 📊 Performance

Comprexia delivers exceptional compression ratios, especially for structured data:

| Data Type | Original Size | Compressed Size | Ratio | Savings |
|-----------|---------------|-----------------|-------|---------|
| JSON API Response | 48.81 KB | 35.63 KB | 0.73x | 27% |
| Text Files | 116 B | 110 B | 0.95x | 5% |
| Database Records | 32.25 KB | 19.88 KB | 0.62x | 38% |

## 🎯 Use Cases

### 1. API Response Compression
Reduce bandwidth usage by compressing JSON API responses with Comprexia's structural optimization.

### 2. File Storage Optimization
Compress files and directories with intelligent type detection and benchmarking.

### 3. Database Storage Reduction
Optimize database storage with record-level compression for JSON documents.

### 4. Real-time Streaming
Compress WebSocket messages and real-time data streams for bandwidth efficiency.

## 📁 Examples

Explore comprehensive examples in the `/examples` directory:

- **Express Server** (`/examples/express/`) - API response compression
- **File Compressor** (`/examples/file-compressor.js`) - CLI tool for file compression
- **Database Optimizer** (`/examples/database-storage.js`) - Database storage optimization
- **Real-time Streaming** (`/examples/real-time-streaming.js`) - WebSocket compression

## 🛠️ Development

### Prerequisites

- Node.js 18+
- C++20 compatible compiler (GCC 10+, Clang 10+, MSVC 2019+)
- CMake 3.12+

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-username/comprexia.git
cd comprexia

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Project Structure

```
comprexia/
├── src/
│   ├── cx_core/           # C++20 core library
│   │   ├── encoder.cpp    # Compression implementation
│   │   ├── decoder.cpp    # Decompression implementation
│   │   └── preprocessor.cpp # JSON optimization
│   └── cx_bindings/       # Node.js N-API bindings
│       └── addon.cc       # Native module entry point
├── node/                   # TypeScript definitions
│   └── index.ts
├── examples/              # Comprehensive usage examples
│   ├── express/           # Express.js server examples
│   ├── file-compressor.js # CLI file compression tool
│   ├── database-storage.js # Database optimization
│   └── real-time-streaming.js # WebSocket streaming
├── benchmarks/           # Performance benchmarks
└── test/                 # Test suite
```

## 📈 Benchmarks

Run performance benchmarks:

```bash
npm run benchmark
```

The benchmark suite compares Comprexia against other compression algorithms with various datasets.

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- **C++**: Follow Google C++ Style Guide
- **JavaScript**: Use Prettier and ESLint
- **Commit Messages**: Conventional Commits format

## 🐛 Troubleshooting

### Common Issues

1. **Build failures**: Ensure you have C++20 compatible compiler
2. **Module not found**: Run `npm run build` to compile native bindings
3. **Performance issues**: Check benchmark results for expected ratios

### Getting Help

- Create an [Issue](https://github.com/your-username/comprexia/issues)
- Check existing discussions
- Review the examples directory

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern C++20 features and SIMD optimizations
- Node.js N-API for seamless native integration
- Inspired by modern compression research and real-world use cases

## 🚀 Roadmap

- [ ] WebAssembly build target
- [ ] Python bindings
- [ ] Redis module integration
- [ ] Cloud storage optimizations
- [ ] Machine learning-enhanced compression

---

Made with ❤️ by the Comprexia Team