import { SETS, buildKitResponse } from "@/lib/promo-kit"

// One-click download of a single promo set, e.g. /promo/download/paternoster
export const dynamic = "force-dynamic"

const FILENAMES: Record<string, string> = {
  story: "StayKnit-story-advert.zip",
  paternoster: "StayKnit-paternoster-westcoast.zip",
  animated: "StayKnit-animated-advert.zip",
}

export async function GET(_req: Request, { params }: { params: Promise<{ set: string }> }) {
  const { set: setId } = await params
  const set = SETS.find((s) => s.id === setId)
  if (!set) {
    return new Response("Unknown promo set.", { status: 404 })
  }
  return buildKitResponse([set], FILENAMES[setId] ?? `StayKnit-${setId}.zip`)
}
