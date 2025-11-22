#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const lib = require('../dist/index.js')

class ComprexiaFileCompressor {
  constructor() {
    this.supportedFormats = ['.json', '.txt', '.log', '.csv', '.xml', '.html', '.js', '.ts']
  }

  // Compress a single file
  async compressFile(inputPath, outputPath = null, options = {}) {
    try {
      if (!fs.existsSync(inputPath)) {
        throw new Error(`File not found: ${inputPath}`)
      }

      const stats = fs.statSync(inputPath)
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${inputPath}`)
      }

      const ext = path.extname(inputPath).toLowerCase()
      const fileName = path.basename(inputPath)
      
      if (!outputPath) {
        outputPath = inputPath + '.cx'
      }

      console.log(`📦 Compressing ${fileName} (${this.formatBytes(stats.size)})...`)

      // Read file content
      const content = fs.readFileSync(inputPath)
      
      // Use standard compression for all file types
      let compressed = lib.compress(content)
      console.log('   Using Comprexia compression')

      // Write compressed file
      fs.writeFileSync(outputPath, compressed)
      
      const compressedSize = compressed.length
      const ratio = compressedSize / stats.size
      const saved = stats.size - compressedSize
      
      console.log('✅ Compression completed!')
      console.log(`   Original: ${this.formatBytes(stats.size)}`)
      console.log(`   Compressed: ${this.formatBytes(compressedSize)}`)
      console.log(`   Ratio: ${ratio.toFixed(4)} (${this.formatBytes(saved)} saved)`)
      console.log(`   Output: ${outputPath}`)
      
      return {
        originalSize: stats.size,
        compressedSize,
        ratio,
        saved,
        outputPath
      }
      
    } catch (error) {
      console.error(`❌ Error compressing file: ${error.message}`)
      throw error
    }
  }

  // Decompress a file
  async decompressFile(inputPath, outputPath = null) {
    try {
      if (!fs.existsSync(inputPath)) {
        throw new Error(`File not found: ${inputPath}`)
      }

      const stats = fs.statSync(inputPath)
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${inputPath}`)
      }

      const fileName = path.basename(inputPath)
      
      if (!outputPath) {
        if (fileName.endsWith('.cx')) {
          outputPath = inputPath.slice(0, -3)
        } else {
          outputPath = inputPath + '.decompressed'
        }
      }

      console.log(`📤 Decompressing ${fileName} (${this.formatBytes(stats.size)})...`)

      // Read compressed content
      const compressed = fs.readFileSync(inputPath)
      
      // Decompress (auto-detects compression method)
      const decompressed = lib.decompress(compressed)
      
      // Write decompressed file
      fs.writeFileSync(outputPath, decompressed)
      
      console.log('✅ Decompression completed!')
      console.log(`   Compressed: ${this.formatBytes(stats.size)}`)
      console.log(`   Decompressed: ${this.formatBytes(decompressed.length)}`)
      console.log(`   Output: ${outputPath}`)
      
      return {
        compressedSize: stats.size,
        decompressedSize: decompressed.length,
        outputPath
      }
      
    } catch (error) {
      console.error(`❌ Error decompressing file: ${error.message}`)
      throw error
    }
  }

  // Compress entire directory
  async compressDirectory(dirPath, outputDir = null, options = {}) {
    try {
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found: ${dirPath}`)
      }

      const stats = fs.statSync(dirPath)
      if (!stats.isDirectory()) {
        throw new Error(`Not a directory: ${dirPath}`)
      }

      if (!outputDir) {
        outputDir = dirPath + '-compressed'
      }

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      console.log(`📁 Compressing directory: ${path.basename(dirPath)}`)
      
      const files = this.getFiles(dirPath)
      const results = []
      let totalOriginal = 0
      let totalCompressed = 0

      for (const file of files) {
        const relativePath = path.relative(dirPath, file)
        const outputFile = path.join(outputDir, relativePath + '.cx')
        
        // Create subdirectories if needed
        const outputDirPath = path.dirname(outputFile)
        if (!fs.existsSync(outputDirPath)) {
          fs.mkdirSync(outputDirPath, { recursive: true })
        }

        try {
          const result = await this.compressFile(file, outputFile)
          results.push({
            file: relativePath,
            ...result
          })
          totalOriginal += result.originalSize
          totalCompressed += result.compressedSize
        } catch (error) {
          console.warn(`⚠️  Skipping ${relativePath}: ${error.message}`)
        }
      }

      const totalRatio = totalCompressed / totalOriginal
      const totalSaved = totalOriginal - totalCompressed
      
      console.log('\n📊 Directory Compression Summary:')
      console.log(`   Files processed: ${results.length}`)
      console.log(`   Total original: ${this.formatBytes(totalOriginal)}`)
      console.log(`   Total compressed: ${this.formatBytes(totalCompressed)}`)
      console.log(`   Overall ratio: ${totalRatio.toFixed(4)}`)
      console.log(`   Total space saved: ${this.formatBytes(totalSaved)}`)
      console.log(`   Output directory: ${outputDir}`)
      
      return {
        totalFiles: results.length,
        totalOriginalSize: totalOriginal,
        totalCompressedSize: totalCompressed,
        overallRatio: totalRatio,
        totalSaved,
        results,
        outputDir
      }
      
    } catch (error) {
      console.error(`❌ Error compressing directory: ${error.message}`)
      throw error
    }
  }

  // Benchmark compression on sample files
  async runBenchmark(testFiles = []) {
    console.log('🚀 Comprexia File Compression Benchmark\n')
    
    const results = []
    
    for (const filePath of testFiles) {
      if (fs.existsSync(filePath)) {
        try {
          const result = await this.compressFile(filePath, null)
          results.push({
            file: path.basename(filePath),
            ...result
          })
        } catch (error) {
          console.warn(`⚠️  Benchmark failed for ${filePath}: ${error.message}`)
        }
      }
    }

    if (results.length > 0) {
      console.log('\n🏆 Benchmark Results:')
      console.log('='.repeat(80))
      console.log('File'.padEnd(30) + 'Original'.padEnd(12) + 'Compressed'.padEnd(12) + 'Ratio'.padEnd(10) + 'Saved')
      console.log('-'.repeat(80))
      
      let totalOriginal = 0
      let totalCompressed = 0
      
      for (const result of results) {
        console.log(
          result.file.padEnd(30) +
          this.formatBytes(result.originalSize).padEnd(12) +
          this.formatBytes(result.compressedSize).padEnd(12) +
          result.ratio.toFixed(4).padEnd(10) +
          this.formatBytes(result.saved)
        )
        totalOriginal += result.originalSize
        totalCompressed += result.compressedSize
      }
      
      const overallRatio = totalCompressed / totalOriginal
      const totalSaved = totalOriginal - totalCompressed
      
      console.log('-'.repeat(80))
      console.log(
        'TOTAL'.padEnd(30) +
        this.formatBytes(totalOriginal).padEnd(12) +
        this.formatBytes(totalCompressed).padEnd(12) +
        overallRatio.toFixed(4).padEnd(10) +
        this.formatBytes(totalSaved)
      )
    }
    
    return results
  }

  // Utility methods
  isTextFile(ext) {
    return this.supportedFormats.includes(ext)
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  getFiles(dir) {
    const files = []
    
    function traverse(currentDir) {
      const items = fs.readdirSync(currentDir)
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item)
        const stat = fs.statSync(fullPath)
        
        if (stat.isDirectory()) {
          traverse(fullPath)
        } else if (stat.isFile()) {
          files.push(fullPath)
        }
      }
    }
    
    traverse(dir)
    return files
  }
}

// Command line interface
if (require.main === module) {
  const compressor = new ComprexiaFileCompressor()
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
🔧 Comprexia File Compressor - Command Line Tool

Usage:
  node file-compressor.js compress <input> [output]
  node file-compressor.js decompress <input> [output]
  node file-compressor.js compress-dir <directory> [output-directory]
  node file-compressor.js benchmark [file1] [file2] ...

Examples:
  node file-compressor.js compress data.json
  node file-compressor.js compress data.json data.json.cx
  node file-compressor.js decompress data.json.cx
  node file-compressor.js compress-dir ./data
  node file-compressor.js benchmark data1.json data2.log
`)
    process.exit(0)
  }
  
  const command = args[0]
  const input = args[1]
  const output = args[2]
  
  async function run() {
    try {
      switch (command) {
        case 'compress':
          await compressor.compressFile(input, output)
          break
        case 'decompress':
          await compressor.decompressFile(input, output)
          break
        case 'compress-dir':
          await compressor.compressDirectory(input, output)
          break
        case 'benchmark':
          await compressor.runBenchmark(args.slice(1))
          break
        default:
          console.log(`Unknown command: ${command}`)
          process.exit(1)
      }
    } catch (error) {
      console.error(`Error: ${error.message}`)
      process.exit(1)
    }
  }
  
  run()
}

module.exports = ComprexiaFileCompressor