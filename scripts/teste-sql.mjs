// Roda supabase/tests/fluxos_criticos.sql direto no Postgres (tudo é desfeito no final).
// Uso: TEST_DATABASE_URL="postgresql://postgres:SENHA@db.<ref>.supabase.co:5432/postgres" npm run test:db
// (Supabase > Project Settings > Database > Connection string). Alternativa: colar o arquivo no SQL Editor.
import { readFile } from "node:fs/promises"
import { config } from "dotenv"
import pg from "pg"

config({ path: ".env.local" })
const url = process.env.TEST_DATABASE_URL
if (!url) {
  console.error("Defina TEST_DATABASE_URL (ou cole supabase/tests/fluxos_criticos.sql no SQL Editor do Supabase).")
  process.exit(2)
}

const sql = await readFile(new URL("../supabase/tests/fluxos_criticos.sql", import.meta.url), "utf8")
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(sql)
  console.error("Inesperado: o bloco de teste deveria terminar com RAISE.")
  process.exitCode = 1
} catch (e) {
  if (/TODOS OS TESTES PASSARAM/.test(e.message)) {
    console.log(`✔ ${e.message}`)
  } else {
    console.error(`✘ ${e.message}`)
    process.exitCode = 1
  }
} finally {
  await client.end()
}
