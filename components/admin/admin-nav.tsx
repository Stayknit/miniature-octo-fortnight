"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Shared top navigation for every owner-only admin page. Lives in one place so
// the set of links stays identical across pages and the current page is always
// highlighted. Add a new admin page here once and it appears everywhere.
const ADMIN_LINKS: { href: string; label: string }[] = [
  { href: "/admin", label: "Home" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/marketing", label: "Marketing & ads" },
  { href: "/admin/invite", label: "Invitations" },
  { href: "/admin/docs", label: "Docs" },
]

export function AdminNav({ email }: { email?: string }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin sections" className="mb-6 border-b border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <Link href="/admin" className="text-sm font-semibold tracking-tight text-foreground">
          StayKnit admin
        </Link>
        {email ? <span className="text-xs text-muted-foreground">Signed in as {email}</span> : null}
      </div>
      <ul className="flex flex-wrap gap-1">
        {ADMIN_LINKS.map((link) => {
          const active =
            link.href === "/admin"
              ? pathname === "/admin"
              : pathname === link.href || pathname.startsWith(link.href + "/")
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-block rounded-t-lg border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground"
                    : "inline-block rounded-t-lg border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
