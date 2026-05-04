import { execFile, execFileSync, spawnSync, type ExecFileOptionsWithStringEncoding } from 'node:child_process'
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import postgres from 'postgres'

const scriptRelativePath = 'scripts/smoke-user-secrets-roundtrip.ts'
const reexecEnvKey = 'UDD_SMOKE_REEXEC_REACT_SERVER'

if (!process.env[reexecEnvKey]) {
  reexecWithReactServerCondition()
} else {
  void main().catch((error: unknown) => {
    console.error(`smoke: FAIL ${formatError(error)}`)
    process.exit(1)
  })
}

function reexecWithReactServerCondition(): never {
  const result = spawnSync('pnpm', ['tsx', scriptRelativePath], {
    cwd: repoRoot(),
    env: {
      ...process.env,
      [reexecEnvKey]: '1',
      NODE_OPTIONS: appendReactServerCondition(process.env.NODE_OPTIONS),
    },
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`smoke: FAIL ${result.error.message}`)
    process.exit(1)
  }

  process.exit(typeof result.status === 'number' ? result.status : 1)
}

function appendReactServerCondition(nodeOptions: string | undefined): string {
  if (nodeOptions?.includes('--conditions=react-server')) return nodeOptions
  return [nodeOptions, '--conditions=react-server'].filter(Boolean).join(' ')
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

async function main(): Promise<void> {
  const plaintext = 'hello-world-α'
  const secretKey = 'smoke-test-user-secrets-key'
  const containerName = `smoke-user-secrets-${process.pid}-${randomUUID().slice(0, 8)}`
  let cleanupStatus = 'not-started'

  installSignalCleanup(containerName)

  try {
    process.env.UDD_SECRET_KEY = secretKey
    console.log(`smoke: launching postgres:16 container ${containerName}`)
    const { stdout: containerId } = await execFileText('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '-e',
      'POSTGRES_USER=udd_smoke',
      '-e',
      'POSTGRES_PASSWORD=udd_smoke_password',
      '-e',
      'POSTGRES_DB=udd_smoke',
      '-p',
      '127.0.0.1::5432',
      'postgres:16',
    ])
    cleanupStatus = 'container-running'
    console.log(`smoke: container id ${containerId.trim()}`)

    const hostPort = await waitForMappedPort(containerName)
    const databaseUrl = `postgres://udd_smoke:udd_smoke_password@127.0.0.1:${hostPort}/udd_smoke`
    await waitForPostgres(databaseUrl)
    console.log(`smoke: postgres ready on 127.0.0.1:${hostPort}`)

    const sql = postgres(databaseUrl, { max: 1 })
    try {
      const statementCount = await applyMigration(sql)
      console.log(`smoke: applied migration (${statementCount} statements)`)

      const userId = randomUUID()
      await sql`
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        values (${userId}, 'Smoke User', 'smoke@example.test', true, now(), now())
      `
      console.log(`smoke: inserted fake user ${userId}`)

      const { encrypt, decrypt } = await import('../lib/secrets/crypto')

      await assertRoundTrip(sql, {
        ownerId: userId,
        format: 'v2',
        ciphertext: encrypt(plaintext),
        plaintext,
        decrypt,
      })
      console.log('smoke: v2 ciphertext round-tripped (format v2:iv:tag:data)')

      await assertRoundTrip(sql, {
        ownerId: userId,
        format: 'legacy',
        ciphertext: encryptLegacy(plaintext, secretKey),
        plaintext,
        decrypt,
      })
      console.log('smoke: legacy ciphertext round-tripped (format iv:tag:data)')
    } finally {
      await sql.end()
    }
  } finally {
    if (cleanupStatus === 'container-running') {
      await execFileText('docker', ['rm', '-f', containerName])
      cleanupStatus = 'removed'
      console.log(`smoke: cleanup removed container ${containerName}`)
    }
    console.log(`smoke: cleanup status ${cleanupStatus}`)
  }

  console.log('smoke: PASS user_secrets ciphertext round-trip')
}

async function applyMigration(sql: postgres.Sql): Promise<number> {
  const migrationPath = path.join(repoRoot(), 'drizzle/0000_curvy_firelord.sql')
  const migrationSql = await readFile(migrationPath, 'utf8')
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await sql.unsafe(statement)
  }

  return statements.length
}

async function assertRoundTrip(
  sql: postgres.Sql,
  input: {
    ownerId: string
    format: 'v2' | 'legacy'
    ciphertext: string
    plaintext: string
    decrypt: (ciphertext: string) => string
  },
): Promise<void> {
  await sql`
    insert into user_secrets (owner_id, kind, name, encrypted_value)
    values (${input.ownerId}, 'ai', ${`smoke-${input.format}`}, ${input.ciphertext})
  `

  const rows = await sql`
    select encrypted_value
    from user_secrets
    where owner_id = ${input.ownerId}
      and kind = 'ai'
      and name = ${`smoke-${input.format}`}
  `
  const persistedCiphertext = rows[0]?.encrypted_value

  assert.equal(typeof persistedCiphertext, 'string')
  assert.equal(persistedCiphertext, input.ciphertext)
  assert.equal(input.decrypt(persistedCiphertext), input.plaintext)
}

function encryptLegacy(plaintext: string, secretKey: string): string {
  const key = createHash('sha256').update(secretKey).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':')
}

async function waitForMappedPort(containerName: string): Promise<string> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const { stdout } = await execFileText('docker', ['port', containerName, '5432/tcp'])
    const match = stdout.trim().match(/:(\d+)$/)
    if (match) return match[1]
    await sleep(250)
  }

  throw new Error('Timed out waiting for Docker to map Postgres port')
}

async function waitForPostgres(databaseUrl: string): Promise<void> {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const sql = postgres(databaseUrl, { max: 1, connect_timeout: 1 })
    try {
      await sql`select 1`
      await sql.end()
      return
    } catch (error) {
      await sql.end().catch(() => undefined)
      if (attempt === 60) throw error
      await sleep(500)
    }
  }
}

function execFileText(
  file: string,
  args: string[],
  options: Partial<ExecFileOptionsWithStringEncoding> = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function installSignalCleanup(containerName: string): void {
  const cleanupAndExit = (signal: NodeJS.Signals) => {
    try {
      execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' })
    } catch {
      // The container may not have started yet.
    }
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }

  process.once('SIGINT', cleanupAndExit)
  process.once('SIGTERM', cleanupAndExit)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const detail = [error.message]
    const maybeOutput = error as Error & { stdout?: string; stderr?: string }
    if (maybeOutput.stderr) detail.push(`stderr: ${maybeOutput.stderr.trim()}`)
    if (maybeOutput.stdout) detail.push(`stdout: ${maybeOutput.stdout.trim()}`)
    return detail.join(' | ')
  }
  return String(error)
}
