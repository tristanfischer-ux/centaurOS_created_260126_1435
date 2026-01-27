import '@testing-library/jest-dom'

// Polyfill for TextEncoder/TextDecoder (required by Next.js in test environment)
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder
