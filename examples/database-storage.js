#!/usr/bin/env node

const lib = require('../dist/index.js')

class ComprexiaDatabaseOptimizer {
  constructor() {
    this.compressionStats = {
      totalCompressed: 0,
      totalOriginal: 0,
      totalSavings: 0,
      operations: 0
    }
  }

  // Compress database record
  compressRecord(record, options = {}) {
    const originalSize = this.calculateSize(record)
    const recordBuffer = Buffer.from(JSON.stringify(record))
    
    // Use standard compression
    let compressed = lib.compress(recordBuffer)

    const compressedSize = compressed.length
    const ratio = compressedSize / originalSize
    const savings = originalSize - compressedSize

    this.compressionStats.totalOriginal += originalSize
    this.compressionStats.totalCompressed += compressedSize
    this.compressionStats.totalSavings += savings
    this.compressionStats.operations++

    return {
      compressedData: compressed,
      metadata: {
        originalSize,
        compressedSize,
        compressionRatio: ratio,
        spaceSaved: savings,
        compressionMethod: options.useJsonOptimization ? 'json-aware' : 
                         options.useAdvanced ? 'advanced' : 'basic',
        timestamp: new Date().toISOString()
      }
    }
  }

  // Decompress database record
  decompressRecord(compressedData) {
    const decompressed = lib.decompress(compressedData)
    return JSON.parse(decompressed.toString())
  }

  // Benchmark different data types
  async runStorageBenchmark() {
    console.log('🏗️  Comprexia Database Storage Optimization Benchmark\n')

    // Test 1: E-commerce products
    console.log('1. 📦 E-commerce Products')
    const products = this.generateProducts(100)
    await this.benchmarkData('products', products, { useJsonOptimization: true })

    // Test 2: User profiles
    console.log('\n2. 👥 User Profiles')
    const users = this.generateUsers(50)
    await this.benchmarkData('users', users, { useJsonOptimization: true })

    // Test 3: Analytics data
    console.log('\n3. 📊 Analytics Data')
    const analytics = this.generateAnalyticsData(50)
    await this.benchmarkData('analytics', analytics, { useAdvanced: true })

    console.log('\n✅ Benchmark completed!')
    console.log(`📊 Overall stats: ${this.compressionStats.operations} records`)
    console.log(`   Total original: ${this.formatBytes(this.compressionStats.totalOriginal)}`)
    console.log(`   Total compressed: ${this.formatBytes(this.compressionStats.totalCompressed)}`)
    console.log(`   Total saved: ${this.formatBytes(this.compressionStats.totalSavings)}`)
    console.log(`   Avg ratio: ${(this.compressionStats.totalCompressed / this.compressionStats.totalOriginal).toFixed(4)}`)
  }

  async benchmarkData(name, data, options) {
    const originalSizes = []
    const compressedSizes = []

    for (const item of data) {
      const result = this.compressRecord(item, options)
      originalSizes.push(result.metadata.originalSize)
      compressedSizes.push(result.metadata.compressedSize)
    }

    const totalOriginal = originalSizes.reduce((a, b) => a + b, 0)
    const totalCompressed = compressedSizes.reduce((a, b) => a + b, 0)
    const avgRatio = totalCompressed / totalOriginal

    console.log(`   Records: ${data.length}`)
    console.log(`   Original: ${this.formatBytes(totalOriginal)}`)
    console.log(`   Compressed: ${this.formatBytes(totalCompressed)}`)
    console.log(`   Ratio: ${avgRatio.toFixed(4)}`)
    console.log(`   Saved: ${this.formatBytes(totalOriginal - totalCompressed)}`)
    console.log(`   Efficiency: ${((1 - avgRatio) * 100).toFixed(1)}%`)
  }

  // Data generation utilities
  generateProducts(count) {
    const products = []
    for (let i = 0; i < count; i++) {
      products.push({
        id: `prod_${i}`,
        name: `Product ${i}`,
        price: Math.random() * 1000,
        category: ['electronics', 'clothing', 'home', 'books'][i % 4],
        description: 'Sample product description '.repeat(5),
        specifications: {
          weight: Math.random() * 10,
          features: ['Feature 1', 'Feature 2', 'Feature 3']
        }
      })
    }
    return products
  }

  generateUsers(count) {
    const users = []
    for (let i = 0; i < count; i++) {
      users.push({
        id: `user_${i}`,
        username: `user${i}`,
        email: `user${i}@example.com`,
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          age: 20 + (i % 50),
          address: {
            street: `${i} Main St`,
            city: ['New York', 'London', 'Tokyo', 'Paris'][i % 4],
            country: 'USA'
          }
        }
      })
    }
    return users
  }

  generateAnalyticsData(count) {
    const data = []
    for (let i = 0; i < count; i++) {
      data.push({
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        eventType: ['page_view', 'purchase', 'signup', 'click'][i % 4],
        userId: `user_${Math.floor(Math.random() * 1000)}`,
        properties: {
          path: `/products/${Math.floor(Math.random() * 100)}`,
          referrer: 'https://example.com'
        }
      })
    }
    return data
  }

  calculateSize(obj) {
    return Buffer.byteLength(JSON.stringify(obj))
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// Command line interface
if (require.main === module) {
  const optimizer = new ComprexiaDatabaseOptimizer()
  
  console.log('\n🏗️  Comprexia Database Storage Optimization Demo\n')
  
  optimizer.runStorageBenchmark().catch(console.error)
}

module.exports = ComprexiaDatabaseOptimizer