import { experimental_generateSpeech as generateSpeech } from "ai"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { SETS } from "@/lib/promo-kit"

// Dev-only utility route: generates an AI voiceover mp3 for one advert set from
// its script and writes it to public/promo. Kept out of production.
export const maxDuration = 300

const MODEL = "openai/tts-1-hd"
// Warm, confident, friendly read that suits a hospitality advert.
const DEFAULT_VOICE = "nova"
// Per-set voice overrides. The animated set has a male host, so it gets a
// warm male read ("onyx") to match the character on screen.
const VOICE_BY_SET: Record<string, string> = { animated: "onyx" }
const OUT_DIR = path.join(process.cwd(), "public", "promo")

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not available in production.", { status: 403 })
  }

  const id = new URL(req.url).searchParams.get("set") ?? "story"
  const set = SETS.find((s) => s.id === id)
  if (!set) {
    return Response.json({ error: `Unknown set "${id}". Use one of: ${SETS.map((s) => s.id).join(", ")}` }, { status: 400 })
  }

  // Join scene lines into one continuous read; the ellipses in the script give
  // the model natural pauses between beats.
  const script = set.scenes.map((s) => s.vo).join(" ")

  try {
    const started = Date.now()
    const { audio } = await generateSpeech({
      model: MODEL,
      voice: VOICE_BY_SET[set.id] ?? DEFAULT_VOICE,
      text: script,
      outputFormat: "mp3",
      speed: 0.95,
      instructions: "Warm, upbeat and confident advertising voiceover. Friendly South African hospitality brand tone. Clear, unhurried pacing with natural pauses between sentences.",
    })

    await mkdir(OUT_DIR, { recursive: true })
    const file = `voiceover-${set.id}.mp3`
    await writeFile(path.join(OUT_DIR, file), Buffer.from(audio.uint8Array))

    return Response.json({
      ok: true,
      set: set.id,
      file: `/promo/${file}`,
      words: script.split(/\s+/).length,
      seconds: Math.round((Date.now() - started) / 1000),
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
