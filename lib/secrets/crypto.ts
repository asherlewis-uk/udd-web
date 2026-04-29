import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto"

const CREDENTIAL_CIPHERTEXT_VERSION = "v2"
const CREDENTIAL_KDF_SALT = "udd-web:user-secrets:v1"

function deriveKey(): Buffer {
  const raw = process.env.UDD_SECRET_KEY
  if (!raw) throw new Error("UDD_SECRET_KEY is not set — credential storage is unavailable.")
  // Fixed application salt is intentional: UDD_SECRET_KEY is an app-managed env secret, not a per-user password.
  return scryptSync(raw, CREDENTIAL_KDF_SALT, 32)
}

function deriveLegacyKey(): Buffer {
  const raw = process.env.UDD_SECRET_KEY
  if (!raw) throw new Error("UDD_SECRET_KEY is not set — credential storage is unavailable.")
  return createHash("sha256").update(raw).digest()
}

export function encrypt(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [CREDENTIAL_CIPHERTEXT_VERSION, iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":")
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":")
  if (parts.length === 4) {
    const [version, ivB64, tagB64, dataB64] = parts
    if (version !== CREDENTIAL_CIPHERTEXT_VERSION) throw new Error("Unsupported ciphertext version")
    return decryptParts(deriveKey(), ivB64, tagB64, dataB64)
  }
  if (parts.length === 3) {
    const [ivB64, tagB64, dataB64] = parts
    return decryptParts(deriveLegacyKey(), ivB64, tagB64, dataB64)
  }
  throw new Error("Invalid ciphertext format")
}

function decryptParts(
  key: Buffer,
  ivB64: string,
  tagB64: string,
  dataB64: string,
): string {
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(tagB64, "base64")
  const data = Buffer.from(dataB64, "base64")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
