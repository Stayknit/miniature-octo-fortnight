import { readFile } from "node:fs/promises"
import path from "node:path"
import JSZip from "jszip"

export type Scene = { file: string; title: string; vo: string; onScreen: string }
export type SceneSet = { id: string; label: string; folder: string; voiceover: string; scenes: Scene[] }

export const SETS: SceneSet[] = [
  {
    id: "story",
    label: "Set A — Story advert",
    folder: "01-story-advert",
    voiceover: "voiceover-story.mp3",
    scenes: [
      {
        file: "scene-1.mp4",
        title: "1. Hook — the host & the home (0:00-0:07)",
        vo: "Running a short-stay in South Africa? Meet StayKnit.",
        onScreen: "StayKnit",
      },
      {
        file: "scene-2.mp4",
        title: "2. Problem — bookings everywhere (0:07-0:14)",
        vo: "Airbnb, Booking.com, Lekkeslaap — juggling calendars means double bookings and stress.",
        onScreen: "One place for every booking",
      },
      {
        file: "scene-3.mp4",
        title: "3. Solution — one synced calendar (0:14-0:22)",
        vo: "StayKnit centralises every calendar in one place, so double bookings simply stop.",
        onScreen: "No more double bookings",
      },
      {
        file: "scene-4.mp4",
        title: "4. Payoff — grow with confidence (0:22-0:30)",
        vo: "From one property to many — with owner management and financial oversight built in. StayKnit. Manage smarter, scale simpler.",
        onScreen: "StayKnit — manage smarter, scale simpler",
      },
    ],
  },
  {
    id: "paternoster",
    label: "Set B — Paternoster / West Coast destination reel",
    folder: "02-paternoster-westcoast",
    voiceover: "voiceover-paternoster.mp3",
    scenes: [
      {
        file: "paternoster-1.mp4",
        title: "1. Village & bay — establishing (0:00-0:07)",
        vo: "On the West Coast, where whitewashed cottages meet the Atlantic…",
        onScreen: "Paternoster, Western Cape",
      },
      {
        file: "paternoster-2.mp4",
        title: "2. Cottage welcome — golden hour (0:07-0:14)",
        vo: "…every stay should feel effortless — for your guests and for you.",
        onScreen: "Effortless hosting",
      },
      {
        file: "paternoster-3.mp4",
        title: "3. Interior — sea breeze (0:14-0:22)",
        vo: "StayKnit keeps every booking in sync, so you can focus on the welcome.",
        onScreen: "One synced calendar",
      },
      {
        file: "paternoster-4.mp4",
        title: "4. Beach payoff — golden hour (0:22-0:30)",
        vo: "Manage more properties, more easily. StayKnit — hosting, sorted.",
        onScreen: "StayKnit — hosting, sorted",
      },
    ],
  },
  {
    id: "animated",
    label: "Set C — Animated advert",
    folder: "03-animated",
    voiceover: "voiceover-animated.mp3",
    scenes: [
      {
        file: "animated-1.mp4",
        title: "1. Hero — meet the host (0:00-0:07)",
        vo: "Running a short-stay in South Africa? Say hello to StayKnit.",
        onScreen: "StayKnit",
      },
      {
        file: "animated-2.mp4",
        title: "2. Problem — booking chaos (0:07-0:14)",
        vo: "Calendars everywhere, notifications non-stop — juggling platforms is exhausting.",
        onScreen: "One place for every booking",
      },
      {
        file: "animated-3.mp4",
        title: "3. Solution — everything snaps into place (0:14-0:22)",
        vo: "One tap, and StayKnit brings every booking together in a single synced calendar.",
        onScreen: "No more double bookings",
      },
      {
        file: "animated-4.mp4",
        title: "4. Payoff — scale with a smile (0:22-0:30)",
        vo: "From one property to many, managed with ease. StayKnit — manage smarter, scale simpler.",
        onScreen: "StayKnit — manage smarter, scale simpler",
      },
    ],
  },
]

function buildReadme(sets: SceneSet[]): string {
  const multi = sets.length > 1
  const lines: string[] = [
    "StayKnit — Promo Advert Kit",
    "===========================",
    "",
    multi
      ? "Two sets of AI-generated b-roll clips (~8s each, silent, 16:9). Each set cuts"
      : "AI-generated b-roll clips (~8s each, silent, 16:9). This set cuts",
    "together into a 20-30 second advert. Import a set into CapCut in order, lay the",
    "voiceover and music over the top, and add the on-screen text cues.",
  ]
  for (const set of sets) {
    lines.push("", "", set.label.toUpperCase(), "=".repeat(set.label.length), `folder: ${set.folder}/`)
    for (const s of set.scenes) {
      lines.push("", s.title, `  file:      ${s.file}`, `  voiceover: ${s.vo}`, `  on-screen: ${s.onScreen}`)
    }
    lines.push(
      "",
      "Full voiceover:",
      "  " + set.scenes.map((s) => s.vo).join(" "),
      "",
      `AI voiceover audio (ready to drop into CapCut): ${set.voiceover}`,
    )
  }
  lines.push(
    "",
    "",
    "CAPCUT ASSEMBLY",
    "---------------",
    "1. Import the clips in order onto the timeline.",
    "2. Add 0.3s cross-dissolves between clips; trim each to ~7s for a tight 28s cut.",
    "3. Drop in the included AI voiceover mp3 (or record your own), aligning each line to its scene.",
    "4. Add soft, uplifting background music at ~20% under the VO.",
    "5. Add the on-screen text cues; end on the StayKnit logo over the final clip's negative space.",
    "6. Export 1080p, 16:9. For social, duplicate and re-crop to 9:16.",
    "",
  )
  return lines.join("\n")
}

// Builds a zip Response for the given sets. Returns a 404 Response if the clip
// files aren't present on disk yet.
export async function buildKitResponse(sets: SceneSet[], filename: string): Promise<Response> {
  const zip = new JSZip()
  const promoDir = path.join(process.cwd(), "public", "promo")
  const flatten = sets.length > 1

  try {
    await Promise.all(
      sets.flatMap((set) =>
        set.scenes.map(async (s) => {
          const buf = await readFile(path.join(promoDir, s.file))
          zip.file(flatten ? `${set.folder}/${s.file}` : s.file, buf)
        }),
      ),
    )
  } catch {
    return new Response("Promo clips are not available.", { status: 404 })
  }

  // Include the AI voiceover mp3 per set when it has been generated. Optional:
  // the kit is still valid (silent clips) if a voiceover file isn't present.
  await Promise.all(
    sets.map(async (set) => {
      try {
        const buf = await readFile(path.join(promoDir, set.voiceover))
        zip.file(flatten ? `${set.folder}/${set.voiceover}` : set.voiceover, buf)
      } catch {
        /* voiceover not generated yet — skip */
      }
    }),
  )

  zip.file("README.txt", buildReadme(sets))

  const blob = await zip.generateAsync({ type: "uint8array" })
  return new Response(new Uint8Array(blob), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(blob.length),
    },
  })
}
