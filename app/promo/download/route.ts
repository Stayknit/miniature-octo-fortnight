import { SETS, buildKitResponse } from "@/lib/promo-kit"

// Bundles both promo b-roll sets plus a plain-text script/notes file into a
// single StayKnit-promo-kit.zip so the whole advert kit downloads in one click.
export const dynamic = "force-dynamic"

export async function GET() {
  return buildKitResponse(SETS, "StayKnit-promo-kit.zip")
}
