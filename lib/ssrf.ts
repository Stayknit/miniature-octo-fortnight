// Guards server-side fetches of user-supplied URLs (iCal feeds) against SSRF.
// A malicious feed URL could otherwise point at cloud metadata
// (169.254.169.254), loopback, or internal hosts to probe or exfiltrate from
// the private network. We only allow http(s) to public unicast addresses.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 192 && b === 0) return true // 192.0.0.0/24 (incl. 192.0.0.0)
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast + reserved (224.0.0.0/3)
  return false
}

function ipv6IsPrivate(raw: string): boolean {
  const ip = raw.toLowerCase()
  if (ip === '::1' || ip === '::') return true
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4 address.
  const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4IsPrivate(mapped[1])
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true // link-local fe80::/10
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true // unique local fc00::/7
  if (ip.startsWith('ff')) return true // multicast
  return false
}

function addressIsPrivate(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return ipv4IsPrivate(ip)
  if (kind === 6) return ipv6IsPrivate(ip)
  return true // unparseable — treat as unsafe
}

// Throws if the URL is not a public http(s) endpoint safe to fetch. Resolves
// the hostname and rejects if any resolved address falls in a private,
// loopback, link-local, or reserved range.
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('invalid URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('unsupported protocol')
  }

  const host = url.hostname
  // Reject obvious internal names outright.
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('blocked host')
  }

  // A bare IP literal is checked directly; otherwise resolve every A/AAAA
  // record and require all of them to be public.
  if (isIP(host)) {
    if (addressIsPrivate(host)) throw new Error('blocked address')
    return
  }

  const results = await lookup(host, { all: true })
  if (results.length === 0) throw new Error('unresolvable host')
  for (const { address } of results) {
    if (addressIsPrivate(address)) throw new Error('blocked address')
  }
}

// Reads a fetch Response body but aborts once maxBytes is exceeded, so a
// hostile or runaway feed can't exhaust memory.
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.length
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('feed too large')
      }
      chunks.push(value)
    }
  }
  return Buffer.concat(chunks).toString('utf-8')
}
