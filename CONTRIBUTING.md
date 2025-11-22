# Contributing to Comprexia

🎉 First off, thanks for taking the time to contribute! ❤️

We welcome contributions from everyone, regardless of experience level. This document provides guidelines and instructions for contributing to Comprexia.

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **C++20 compatible compiler** (GCC 10+, Clang 10+, MSVC 2019+)
- **CMake 3.12+**
- **Git**

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/comprexia.git
   cd comprexia
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Run tests** to verify setup:
   ```bash
   npm test
   ```

## 📋 Contribution Guidelines

### Types of Contributions

We welcome various types of contributions:

#### 🐛 Bug Reports
- Use the GitHub issue template
- Include clear reproduction steps
- Provide expected vs actual behavior
- Include environment details (OS, Node version, etc.)

#### 💡 Feature Requests
- Describe the problem you're solving
- Explain proposed solution
- Provide use cases and examples

#### 📚 Documentation
- Fix typos and improve clarity
- Add examples and usage guides
- Translate documentation

#### 🔧 Code Contributions
- Bug fixes
- Performance improvements
- New features
- Test coverage

### Code Quality Standards

#### C++ Code (Core Library)
- Follow **Google C++ Style Guide**
- Use modern C++20 features appropriately
- Include Doxygen-style comments for public APIs
- Write comprehensive unit tests
- Ensure no memory leaks or undefined behavior

#### JavaScript/TypeScript Code (Bindings)
- Use **Prettier** for formatting
- Follow **ESLint** rules
- Use JSDoc for documentation
- Write tests with **Jest**

#### Commit Messages
Use **Conventional Commits** format:
```
feat: add JSON streaming compression
fix: resolve memory leak in decoder
docs: update API documentation
test: add benchmark tests
chore: update dependencies
```

### Development Workflow

1. **Create a branch** for your feature:
   ```bash
   git checkout -b feat/amazing-feature
   ```

2. **Make your changes** following code style guidelines

3. **Add tests** for new functionality

4. **Run tests** to ensure everything works:
   ```bash
   npm test
   npm run lint
   npm run build
   ```

5. **Commit your changes** with descriptive messages

6. **Push to your fork**:
   ```bash
   git push origin feat/amazing-feature
   ```

7. **Create a Pull Request** on GitHub

### Pull Request Process

1. **Fill out the PR template** completely
2. **Link related issues** using keywords (fixes #123, closes #456)
3. **Request reviews** from maintainers
4. **Address review feedback** promptly
5. **Ensure CI passes** all checks
6. **Squash commits** if requested during review

## 🏗️ Project Structure

Understanding the project structure will help you contribute effectively:

```
comprexia/
├── src/                    # Source code
│   ├── cx_core/           # C++20 core compression library
│   │   ├── encoder.cpp    # Compression implementation
│   │   ├── decoder.cpp    # Decompression implementation
│   │   ├── preprocessor.cpp # JSON structure optimization
│   │   ├── preprocessor.h  # Preprocessor interface
│   │   ├── simd_utils.cpp # SIMD optimizations
│   │   └── simd_utils.h   # SIMD utilities
│   └── cx_bindings/       # Node.js N-API bindings
│       └── addon.cc       # Native module entry point
├── node/                  # TypeScript definitions and wrapper
│   └── index.ts          # Public API exports
├── include/               # Public C++ headers
│   └── comprexia/
│       ├── decoder.h     # Decoder interface
│       ├── encoder.h     # Encoder interface
│       └── stream.h      # Stream processing
├── examples/             # Usage examples
│   ├── express/          # Express.js server examples
│   ├── fastify/          # Fastify server examples
│   ├── file-compressor.js # CLI compression tool
│   ├── database-storage.js # Database optimization
│   └── real-time-streaming.js # WebSocket streaming
├── benchmarks/           # Performance benchmarks
│   ├── datasets/         # Test data
│   └── runner/           # Benchmark runners
├── test/                 # Test suite
│   └── node/            # Node.js binding tests
│       ├── roundtrip.test.js # Compression tests
│       └── stream.test.js    # Stream tests
└── .github/             # GitHub configurations
    └── workflows/       # CI/CD workflows
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:node    # Node.js binding tests
npm run test:core    # C++ core tests (if available)

# Run with coverage
npm run test:coverage
```

### Writing Tests

- **Test both success and error cases**
- **Include edge cases** and boundary conditions
- **Test performance characteristics** for critical paths
- **Mock external dependencies** appropriately

## 📊 Performance Considerations

When contributing performance-related code:

1. **Benchmark before and after** changes
2. **Consider memory usage** as well as speed
3. **Test on multiple platforms** (Linux, macOS, Windows)
4. **Profile with real-world data**

Run benchmarks:
```bash
npm run benchmark
```

## 🐛 Debugging

### C++ Debugging

```bash
# Build with debug symbols
npm run build:debug

# Use GDB/LLDB for debugging
gdb --args node test/your-test.js
```

### Node.js Debugging

```bash
# Debug with Chrome DevTools
node --inspect test/your-test.js

# Or use debugger statement
debugger;
```

## 📝 Documentation

### Code Comments

- Use **Doxygen-style** for C++ public APIs
- Use **JSDoc** for JavaScript/TypeScript
- Document **parameters, returns, and exceptions**
- Include **usage examples** in comments

### User Documentation

- Update **README.md** for user-facing changes
- Add **examples** for new features
- Document **breaking changes** clearly

## 🚨 Security

- **Never commit secrets** or sensitive information
- **Report security vulnerabilities** privately
- **Follow secure coding practices**
- **Validate all inputs** thoroughly

## ❓ Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and ideas
- **Pull Requests**: Code contributions

### Asking Questions

When asking for help:

1. **Search existing issues** first
2. **Provide clear context** about your problem
3. **Include code examples** and error messages
4. **Share what you've tried** already

## 📜 Code of Conduct

We follow the **Contributor Covenant Code of Conduct**. Please be respectful and inclusive in all interactions.

## 🙏 Recognition

All contributors will be recognized in:

- **GitHub contributors list**
- **Release notes**
- **Project documentation** (if significant contribution)

## 🎉 Your First Contribution

Looking for a good first issue? Check issues labeled:
- `good first issue`
- `help wanted`
- `documentation`

### Quick Start Issues

1. **Fix a typo** in documentation
2. **Add a test case** for edge conditions
3. **Improve error messages**
4. **Write an example** for existing feature

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's **MIT License**.

---

Thank you for contributing to Comprexia! 🚀

Your efforts help make compression better for everyone. ❤️