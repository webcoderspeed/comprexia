import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

interface Post {
  id: number
  title: string
  body: string
  userId: number
}

interface User {
  id: number
  name: string
  email: string
  username: string
}

interface ApiResponse<T> {
  success: boolean
  data: T
  metadata: {
    count?: number
    source: string
    timestamp: string
  }
}

function App() {
  const [posts, setPosts] = useState<Post[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [compressionInfo, setCompressionInfo] = useState<{
    ratio?: string
    originalSize?: number
    compressedSize?: number
  }>({})

  // Create axios instance; request Comprexia and handle binary payloads
  const apiClient = axios.create({
    baseURL: '/api',
    timeout: 10000,
    headers: {
      'Accept-Encoding': 'cx',
    },
  })

  // Response interceptor to capture compression headers for UI
  apiClient.interceptors.response.use(
    (response) => {
      const contentEncoding = response.headers['content-encoding']
      const compressionRatio = response.headers['x-compression-ratio']
      const originalSize = response.headers['x-original-size']
      const compressedSize = response.headers['x-compressed-size']

      if (contentEncoding === 'cx' && compressionRatio) {
        setCompressionInfo({
          ratio: compressionRatio,
          originalSize: originalSize ? parseInt(originalSize) : undefined,
          compressedSize: compressedSize ? parseInt(compressedSize) : undefined,
        })
      }
      return response
    },
    (error) => Promise.reject(error)
  )

  const bufferToString = (data: ArrayBuffer) => {
    return new TextDecoder('utf-8').decode(new Uint8Array(data))
  }

  const decodeCxOnServer = async (payload: ArrayBuffer) => {
    const res = await apiClient.post<string>('/decode', payload, {
      headers: { 'Content-Type': 'application/octet-stream' },
      responseType: 'text',
    })
    return res.data
  }

  const fetchDecoded = async <T,>(path: string) => {
    const response = await apiClient.get(path, { responseType: 'arraybuffer' })
    const contentEncoding = response.headers['content-encoding']
    if (contentEncoding === 'cx') {
      const jsonStr = await decodeCxOnServer(response.data as ArrayBuffer)
      return JSON.parse(jsonStr) as ApiResponse<T>
    } else {
      const jsonStr = bufferToString(response.data as ArrayBuffer)
      return JSON.parse(jsonStr) as ApiResponse<T>
    }
  }

  const fetchPosts = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDecoded<Post[]>('/posts')
      setPosts(data.data)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch posts')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDecoded<User[]>('/users')
      setUsers(data.data)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllData = async () => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([fetchPosts(), fetchUsers()])
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Comprexia Full-Stack Example</h1>
        <p>React + Vite + TypeScript frontend with Comprexia compression</p>
        
        {compressionInfo.ratio && (
          <div className="compression-info">
            <h3>Compression Stats</h3>
            <p>Ratio: {compressionInfo.ratio}</p>
            {compressionInfo.originalSize && compressionInfo.compressedSize && (
              <p>
                Size: {compressionInfo.compressedSize.toFixed(0)}B / 
                {compressionInfo.originalSize.toFixed(0)}B
              </p>
            )}
          </div>
        )}
      </header>

      <div className="app-content">
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">Error: {error}</div>}

        <div className="data-sections">
          <section className="data-section">
            <h2>Posts ({posts.length})</h2>
            <button onClick={fetchPosts} disabled={loading}>
              Refresh Posts
            </button>
            <div className="data-list">
              {posts.slice(0, 5).map((post) => (
                <div key={post.id} className="data-item">
                  <h3>{post.title}</h3>
                  <p>{post.body.slice(0, 100)}...</p>
                </div>
              ))}
              {posts.length > 5 && (
                <div className="more-items">
                  + {posts.length - 5} more posts
                </div>
              )}
            </div>
          </section>

          <section className="data-section">
            <h2>Users ({users.length})</h2>
            <button onClick={fetchUsers} disabled={loading}>
              Refresh Users
            </button>
            <div className="data-list">
              {users.slice(0, 5).map((user) => (
                <div key={user.id} className="data-item">
                  <h3>{user.name}</h3>
                  <p>{user.email}</p>
                  <small>@{user.username}</small>
                </div>
              ))}
              {users.length > 5 && (
                <div className="more-items">
                  + {users.length - 5} more users
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="actions">
          <button onClick={fetchAllData} disabled={loading}>
            Refresh All Data
          </button>
        </div>
      </div>
    </div>
  )
}

export default App