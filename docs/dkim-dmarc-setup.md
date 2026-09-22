# Email authentication setup — DKIM & DMARC (stayknit.org)

_Last verified: 18 September 2026 (re-checked live via DNS-over-HTTPS)_

## Where things stand (checked live via DNS)

**All four records are correct and live. Nothing needs to be added.** The only optional
improvement left is tightening DMARC enforcement from `p=none` → `p=quarantine` once you've
watched SPF/DKIM pass consistently for a week or two (see "Tighten DMARC" below).

| Record | Status | Value seen live |
| --- | --- | --- |
| **SPF** | ✅ correct | `v=spf1 include:spf.privateemail.com ~all` |
| **MX** | ✅ correct | `mx1.privateemail.com`, `mx2.privateemail.com` (Namecheap Private Email) |
| **DKIM** | ✅ **published** | valid 2048-bit key at **`privateemail._domainkey`** (`v=DKIM1; k=rsa; p=MIIBIjAN…`) |
| **DMARC** | ✅ present (monitor mode) | `v=DMARC1; p=none; rua=mailto:info@stayknit.org; fo=1` |
| **Nameservers** | Vercel DNS | `ns1.vercel-dns.com`, `ns2.vercel-dns.com` |

> **Selector note:** Namecheap Private Email subscriptions from **2 June 2026 onward** publish DKIM on
> `privateemail._domainkey` (older ones used `default._domainkey`). This domain uses `privateemail._domainkey` —
> that is why an earlier lookup of `default._domainkey` came back empty and made it *look* missing. It is not missing.

Because the domain's nameservers are Vercel, any future record changes are made in the Vercel dashboard
(Domains → `stayknit.org` → DNS records), _not_ in Namecheap's Advanced DNS. Namecheap is only the mail host.

---

## DKIM — already done ✅

DKIM signing is enabled in Namecheap Private Email and its public key is published in Vercel DNS at
`privateemail._domainkey.stayknit.org`. No action required. (Historical setup steps removed — they described
adding a record that already exists.)

## Tighten DMARC (the only remaining, optional step)

DMARC is live in **monitor mode** (`p=none`) with a working reporting inbox. That authenticates mail and
collects reports but does not yet instruct receivers to quarantine spoofed mail. Once you've confirmed
SPF + DKIM pass consistently (see Verify below) for ~1–2 weeks, tighten enforcement:

- Vercel → **Domains → stayknit.org → DNS records**. Find the existing **TXT** record named `_dmarc` and **edit** it (don't add a second).
- Change the value to:
  ```
  v=DMARC1; p=quarantine; rua=mailto:info@stayknit.org; fo=1
  ```
- Later, for full protection, `p=reject`.

Leaving it at `p=none` is safe indefinitely — it only means spoofed mail isn't actively quarantined. There is no deadline.

## Verify (anytime)

Check the records resolve:

```bash
# DKIM (expect a v=DKIM1; k=rsa; p=... string)
curl -s -H 'accept: application/dns-json' \
  "https://dns.google/resolve?name=privateemail._domainkey.stayknit.org&type=TXT" | tr ',' '\n' | grep -i dkim

# DMARC (expect lowercase p=none/quarantine with rua)
curl -s -H 'accept: application/dns-json' \
  "https://dns.google/resolve?name=_dmarc.stayknit.org&type=TXT" | tr ',' '\n' | grep -i dmarc
```

Then send a real email from the app (e.g. trigger a password-reset or use Support → Email) to a Gmail account and check **Show original**:
- **SPF: PASS**, **DKIM: PASS**, **DMARC: PASS**.

That confirms the sending domain is fully authenticated and mail will stay out of spam.

---

## Notes

- StayKnit sends via Namecheap Private Email (`mail.privateemail.com`) from `resetpasswords@stayknit.org`; DKIM signing is applied by Namecheap once enabled, so the DNS public key must match their key. No app code change is involved.
- Fonts are self-hosted (`next/font/google`), so Google is not a mail or data sub-processor — unrelated to email auth, noted only to avoid confusion.
