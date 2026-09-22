// One-time, admin-only export of real user accounts to an .xlsx file.
//
// SECURITY / PRIVACY:
//   - Writes to ./private/ which is git-ignored — the file is never committed
//     and is not served by any app route. Only someone with project access
//     (you) can open it.
//   - Passwords are NOT included and cannot be: Better Auth stores only a
//     salted hash in the `account` table, so there is no plaintext to export.
//   - The file contains user PII (emails). Delete it when you're done.
//
// Usage:  node simulation/export-accounts.mjs

import { Pool } from 'pg'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'

const OUT_DIR = resolve(process.cwd(), 'private')
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const OUT_FILE = resolve(OUT_DIR, `stayknit-accounts-${stamp}.xlsx`)

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function fmt(d) {
  return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : ''
}

try {
  // Join each user to their credential provider(s) and plan so the sheet is
  // useful at a glance. Passwords are deliberately excluded.
  const { rows } = await pool.query(`
    select
      u.email,
      u.name,
      u.role,
      u."emailVerified" as verified,
      u."hostUserId"    as host_user_id,
      coalesce(string_agg(distinct a."providerId", ', '), '') as auth_providers,
      s.plan,
      s.status          as plan_status,
      u."lastActiveAt"  as last_active,
      u."createdAt"     as created
    from "user" u
    left join "account" a on a."userId" = u.id
    left join "subscription" s on s."userId" = u.id
    group by u.id, s.plan, s.status
    order by u."createdAt" asc
  `)

  const sheetRows = rows.map((r, i) => ({
    '#': i + 1,
    Email: r.email,
    Name: r.name,
    Role: r.role,
    Verified: r.verified ? 'yes' : 'no',
    'Auth providers': r.auth_providers,
    Plan: r.plan ?? '',
    'Plan status': r.plan_status ?? '',
    'Owner of (host id)': r.host_user_id ?? '',
    'Last active': fmt(r.last_active),
    Created: fmt(r.created),
  }))

  const ws = XLSX.utils.json_to_sheet(sheetRows)
  ws['!cols'] = [
    { wch: 4 }, { wch: 34 }, { wch: 22 }, { wch: 8 }, { wch: 9 },
    { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 18 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Accounts')

  mkdirSync(OUT_DIR, { recursive: true })
  XLSX.writeFile(wb, OUT_FILE)

  console.log(`Exported ${sheetRows.length} account(s) to:`)
  console.log(`  ${OUT_FILE}`)
  console.log('Note: passwords are not included (stored only as salted hashes).')
} catch (e) {
  console.error('Export failed:', e.message)
  process.exit(1)
} finally {
  await pool.end()
}
