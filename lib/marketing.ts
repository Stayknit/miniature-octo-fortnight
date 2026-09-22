// Shared, framework-agnostic marketing constants and types. Kept OUT of the
// "use server" actions file because that file may only export async functions —
// a runtime constant like AD_PLATFORMS would break it. Both the server actions
// and the client hub import from here.

export const AD_PLATFORMS = [
  { slug: "facebook", label: "Facebook", adManagerUrl: "https://www.facebook.com/adsmanager/manage/campaigns" },
  { slug: "instagram", label: "Instagram", adManagerUrl: "https://www.facebook.com/adsmanager/manage/campaigns" },
  { slug: "linkedin", label: "LinkedIn", adManagerUrl: "https://www.linkedin.com/campaignmanager/accounts" },
  { slug: "reddit", label: "Reddit", adManagerUrl: "https://ads.reddit.com/" },
  { slug: "youtube", label: "YouTube", adManagerUrl: "https://ads.google.com/aw/campaigns" },
] as const

export type AdPlatformSlug = (typeof AD_PLATFORMS)[number]["slug"]
export const VALID_SLUGS = new Set<string>(AD_PLATFORMS.map((p) => p.slug))

export type CampaignStatus = "draft" | "active" | "paused" | "ended"
export const VALID_STATUS = new Set<CampaignStatus>(["draft", "active", "paused", "ended"])

export type AdCampaignRow = {
  id: number
  name: string
  platforms: AdPlatformSlug[]
  objective: string
  status: CampaignStatus
  budgetMinor: number
  currency: string
  startDate: string | null // ISO date (yyyy-mm-dd) for form inputs
  endDate: string | null
  destinationUrl: string
  utmUrl: string
  notes: string
  createdAt: string
}

export type CampaignInput = {
  name: string
  platforms: string[]
  objective?: string
  status?: string
  budgetMinor?: number
  currency?: string
  startDate?: string | null
  endDate?: string | null
  destinationUrl?: string
  utmUrl?: string
  notes?: string
}

export type CampaignResult = { ok: true; id: number } | { ok: false; error: string }
