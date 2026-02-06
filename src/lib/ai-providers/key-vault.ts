import crypto from "crypto"

/**
 * Key Vault — encrypts/decrypts AI provider API keys using AES-256-GCM.
 * The encryption key is derived from the PROVIDER_KEY_SECRET env var.
 * If not set, falls back to a deterministic key from SUPABASE_SERVICE_ROLE_KEY.
 */

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
    const secret = process.env.PROVIDER_KEY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) {
        throw new Error("No encryption secret configured (PROVIDER_KEY_SECRET or SUPABASE_SERVICE_ROLE_KEY)")
    }
    // Derive a 32-byte key from the secret
    return crypto.createHash("sha256").update(secret).digest()
}

/**
 * Encrypt a plaintext API key.
 * Returns a string in format: base64(iv):base64(encrypted):base64(authTag)
 */
export function encryptApiKey(plaintext: string): string {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(plaintext, "utf8", "base64")
    encrypted += cipher.final("base64")
    const authTag = cipher.getAuthTag()

    return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`
}

/**
 * Decrypt an encrypted API key.
 * Expects the format: base64(iv):base64(encrypted):base64(authTag)
 */
export function decryptApiKey(ciphertext: string): string {
    const key = getEncryptionKey()
    const parts = ciphertext.split(":")
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted key format")
    }

    const iv = Buffer.from(parts[0], "base64")
    const encrypted = parts[1]
    const authTag = Buffer.from(parts[2], "base64")

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, "base64", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
}

/**
 * Get the last 4 characters of a key for display purposes.
 */
export function getKeyHint(apiKey: string): string {
    if (apiKey.length <= 4) return "****"
    return `...${apiKey.slice(-4)}`
}
