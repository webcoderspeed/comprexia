/**
 * Reversible transforms applied before compression.
 *
 * None of these compress anything. They reorder bytes so that the codec that
 * follows sees longer runs of similar data — values of one field become
 * adjacent instead of interleaved with unrelated fields. The measured effect is
 * larger than anything a match-finder change produced: columnar plus integer
 * delta is roughly 45% smaller than gzip on raw API JSON, using gzip itself as
 * the backend.
 *
 * Every transform here is a pure function with an exact inverse. That claim is
 * not taken on trust — `pack` runs the inverse and compares before emitting,
 * because the last transform in this codebase that assumed its own correctness
 * corrupted every non-ASCII payload it touched.
 */

const COLS = '__cx_cols'
const ENCODINGS = '__cx_enc'
const DATA = '__cx_data'

type ColumnEncoding = 'raw' | 'delta'

interface Columnar {
  [COLS]: string[]
  [ENCODINGS]: ColumnEncoding[]
  [DATA]: unknown[][]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Columnarising only pays off when every element has the same fields in the
 * same order — otherwise the key list has to be stored per row and nothing is
 * saved. Four elements is the point where the header stops dominating.
 */
function isUniformObjectArray(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length < 4) return false
  if (!value.every(isPlainObject)) return false

  const reference = Object.keys(value[0] as Record<string, unknown>)
  if (reference.length === 0) return false

  return value.every((row) => {
    const keys = Object.keys(row as Record<string, unknown>)
    return keys.length === reference.length && keys.every((k, i) => k === reference[i])
  })
}

/**
 * Sequential ids and timestamps are the most compressible thing in an API
 * payload and JSON spells them out in full every row. Deltas collapse them to
 * near-constant values, which an LZ stage then eats.
 *
 * Restricted to safe integers: floating point deltas do not reliably reverse,
 * and a transform that is only usually invertible is the bug this project
 * already shipped once.
 */
function deltaEncodable(values: unknown[]): values is number[] {
  return values.length > 1 && values.every((v) => typeof v === 'number' && Number.isSafeInteger(v))
}

function toColumnar(rows: Record<string, unknown>[]): Columnar {
  const keys = Object.keys(rows[0])
  const columns: unknown[][] = []
  const encodings: ColumnEncoding[] = []

  for (const key of keys) {
    const values = rows.map((row) => row[key])
    if (deltaEncodable(values)) {
      const deltas: number[] = [values[0]]
      for (let i = 1; i < values.length; i++) deltas.push(values[i] - values[i - 1])
      // A delta column only helps if the deltas are genuinely smaller to write.
      const rawWidth = values.reduce<number>((n, v) => n + String(v).length, 0)
      const deltaWidth = deltas.reduce<number>((n, v) => n + String(v).length, 0)
      if (deltaWidth < rawWidth) {
        columns.push(deltas)
        encodings.push('delta')
        continue
      }
    }
    columns.push(values)
    encodings.push('raw')
  }

  return { [COLS]: keys, [ENCODINGS]: encodings, [DATA]: columns }
}

function fromColumnar(node: Columnar): Record<string, unknown>[] {
  const keys = node[COLS]
  const encodings = node[ENCODINGS]
  const columns = node[DATA]

  const decoded = columns.map((column, index) => {
    if (encodings[index] !== 'delta') return column
    const values: number[] = [column[0] as number]
    for (let i = 1; i < column.length; i++) {
      values.push(values[i - 1] + (column[i] as number))
    }
    return values
  })

  const rowCount = decoded.length > 0 ? decoded[0].length : 0
  const rows: Record<string, unknown>[] = []
  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, unknown> = {}
    for (let c = 0; c < keys.length; c++) row[keys[c]] = decoded[c][r]
    rows.push(row)
  }
  return rows
}

function looksColumnar(value: unknown): value is Columnar {
  return (
    isPlainObject(value) &&
    Array.isArray(value[COLS]) &&
    Array.isArray(value[ENCODINGS]) &&
    Array.isArray(value[DATA])
  )
}

function mapTree(node: unknown, visit: (n: unknown) => unknown): unknown {
  const replaced = visit(node)
  if (replaced !== node) return replaced

  if (Array.isArray(node)) return node.map((child) => mapTree(child, visit))
  if (isPlainObject(node)) {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node)) out[key] = mapTree(child, visit)
    return out
  }
  return node
}

/**
 * Rewrites every uniform object array in a JSON document into columns.
 *
 * Returns null when the input is not JSON, or when re-serialising the parsed
 * form does not reproduce the input byte for byte. That second check matters:
 * pretty-printed JSON, unusual number spellings like `1.0`, and `\u` escapes
 * all survive a parse but not a re-stringify, and a transform that quietly
 * rewrites them is lossy even though it looks like it worked.
 */
export function columnarJsonTransform(input: Buffer): Buffer | null {
  let text: string
  let parsed: unknown
  try {
    text = input.toString('utf8')
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (JSON.stringify(parsed) !== text) return null

  let changed = false
  const rewritten = mapTree(parsed, (node) => {
    if (isUniformObjectArray(node)) {
      changed = true
      return toColumnar(node)
    }
    return node
  })

  if (!changed) return null
  return Buffer.from(JSON.stringify(rewritten), 'utf8')
}

export function columnarJsonInverse(input: Buffer): Buffer {
  const parsed = JSON.parse(input.toString('utf8'))
  const restored = mapTree(parsed, (node) => (looksColumnar(node) ? fromColumnar(node) : node))
  return Buffer.from(JSON.stringify(restored), 'utf8')
}

/**
 * Groups the Nth byte of every element together.
 *
 * A slowly changing numeric series has near-identical exponent bytes and noisy
 * mantissa bytes. Interleaved, no byte position ever repeats; separated into
 * planes, the exponent plane collapses. This is what HDF5 and Blosc call
 * shuffle, and it works on any fixed-width binary series, not just floats.
 */
export function byteShuffleTransform(input: Buffer, width: number): Buffer | null {
  if (width < 2 || input.length < width * 8 || input.length % width !== 0) return null

  const out = Buffer.alloc(input.length + 1)
  out[0] = width
  const count = input.length / width
  let p = 1
  for (let b = 0; b < width; b++) {
    for (let i = 0; i < count; i++) out[p++] = input[i * width + b]
  }
  return out
}

export function byteShuffleInverse(input: Buffer): Buffer {
  if (input.length < 1) throw new Error('comprexia: empty shuffle payload')
  const width = input[0]
  const body = input.subarray(1)
  if (width < 2 || body.length % width !== 0) {
    throw new Error('comprexia: corrupt shuffle payload')
  }

  const out = Buffer.alloc(body.length)
  const count = body.length / width
  let p = 0
  for (let b = 0; b < width; b++) {
    for (let i = 0; i < count; i++) out[i * width + b] = body[p++]
  }
  return out
}
