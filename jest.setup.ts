import '@testing-library/jest-dom'

// Polyfill for TextEncoder/TextDecoder (required by Next.js in test environment)
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder

// Polyfill for Request/Response (required by Next.js server component imports in test env)
// INTENT: forge-cto-banner.tsx → brief-specialist-dialog.tsx → next/cache triggers
// Request polyfill requirement. Without this, any test importing The Forge components fails.
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {
    url: string
    method: string
    headers: Record<string, string>
    constructor(input: string, init?: Record<string, unknown>) {
      this.url = input
      this.method = (init?.method as string) || 'GET'
      this.headers = {}
    }
  } as unknown as typeof globalThis.Request
}
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    body: unknown
    status: number
    constructor(body?: unknown, init?: Record<string, unknown>) {
      this.body = body
      this.status = (init?.status as number) || 200
    }
    json() { return Promise.resolve(this.body) }
  } as unknown as typeof globalThis.Response
}
if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = class Headers {
    private _headers: Record<string, string> = {}
    get(name: string) { return this._headers[name.toLowerCase()] || null }
    set(name: string, value: string) { this._headers[name.toLowerCase()] = value }
  } as unknown as typeof globalThis.Headers
}

// Mock react-markdown to avoid ES module issues in Jest
jest.mock('react-markdown', () => {
  return function ReactMarkdown({ children }: { children: string }) {
    return children
  }
})
