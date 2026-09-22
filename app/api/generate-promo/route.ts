import { experimental_generateVideo as generateVideo } from "ai"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

// Dev-only utility route: generates one StayKnit advert b-roll clip and writes
// it to public/promo. Kept out of production so it can't be triggered live.
export const maxDuration = 600

const MODEL = "google/veo-3.1-fast-generate-001"
const OUT_DIR = path.join(process.cwd(), "public", "promo")

const STYLE =
  "Cinematic promotional advert b-roll, shot on a full-frame camera with a wide cinema lens, " +
  "shallow depth of field, warm natural South African daylight, smooth gentle camera motion, " +
  "premium yet warm and approachable mood, realistic, high dynamic range, 4k, no on-screen text, no captions, no logos."

// Paternoster / West Coast (Western Cape) look: whitewashed fishing-village
// cottages, turquoise Atlantic, white sand, granite boulders, coastal fynbos.
const WC_STYLE =
  "Cinematic promotional advert b-roll of Paternoster on the West Coast of the Western Cape, South Africa. " +
  "Whitewashed cottages, turquoise Atlantic Ocean, white sandy beaches, rounded granite boulders and coastal " +
  "fynbos. Shot on a full-frame camera with a wide cinema lens, shallow depth of field, bright airy coastal " +
  "light, smooth gentle camera motion, premium yet warm holiday mood, realistic, high dynamic range, 4k, " +
  "no on-screen text, no captions, no logos, no watermark, no stock-footage watermark, clean frame."

// Animated / motion-graphics look: modern 3D character animation, Pixar-style
// stylised render. Host is a friendly white man in his 30s.
const ANIM_STYLE =
  "Modern 3D animated promotional advert in a polished Pixar-style / stylised character-animation look, " +
  "soft global illumination, clean shapes, warm cheerful colour palette, smooth appealing character rigs, " +
  "gentle camera moves, high production value animation, 4k render. The main character is a friendly white " +
  "man in his 30s with short light-brown hair and a neat short beard, wearing a casual button-up shirt. " +
  "No on-screen text, no captions, no logos, no watermark, clean frame."

const SCENES = [
  {
    file: "scene-1.mp4",
    prompt:
      `${STYLE} A welcoming South African guesthouse host in their 30s opens the front door of a sunlit ` +
      `Cape Dutch style holiday home, smiling as warm morning light spills across a tiled stoep with potted ` +
      `plants and Table Mountain softly out of focus in the far background. Slow push-in toward the doorway.`,
  },
  {
    file: "scene-2.mp4",
    prompt:
      `${STYLE} Over-the-shoulder shot of the same host at a wooden kitchen table looking slightly stressed, ` +
      `juggling a phone in one hand and a laptop showing a cluttered, overlapping calendar. Sticky notes and ` +
      `a paper diary scattered around. Soft focus rack from the messy notes to the host's concerned face.`,
  },
  {
    file: "scene-3.mp4",
    prompt:
      `${STYLE} Clean bright modern desk, close-up of the host relaxed and confident using a laptop and phone ` +
      `that both show a single tidy, colour-coded monthly calendar, everything in sync. Their shoulders drop, ` +
      `they smile with relief. Elegant slow dolly across the desk, sense of order and calm and control.`,
  },
  {
    file: "scene-4.mp4",
    prompt:
      `${STYLE} Uplifting closing shot: the confident host walks through a beautifully styled, sunlit rental ` +
      `living room, then pauses by a window looking out over a South African coastal town, arms relaxed, quietly ` +
      `proud. Bright, aspirational, forward-moving slow steadicam follow. Ends on calm negative space for a logo.`,
  },
  {
    file: "paternoster-1.mp4",
    prompt:
      `${WC_STYLE} Establishing aerial-feel wide shot gliding over a cluster of whitewashed West Coast ` +
      `fishing cottages with thatch and flat roofs in Paternoster, South Africa, right beside a turquoise ` +
      `Atlantic bay. Wooden fishing boats on the white sandy beach, bokkoms and fishing nets, low coastal ` +
      `fynbos and rounded granite boulders. Bright clear midday light. Slow smooth forward drone push.`,
  },
  {
    file: "paternoster-2.mp4",
    prompt:
      `${WC_STYLE} A charming whitewashed Paternoster holiday cottage with a bright blue-framed door and ` +
      `small-paned windows, weathered wooden shutters, a bougainvillea and a couple of Adirondack chairs on ` +
      `a sandy stoep. A guest arrives with a small suitcase and is welcomed inside. Warm late-afternoon ` +
      `golden-hour West Coast light. Gentle slow dolly-in toward the open front door.`,
  },
  {
    file: "paternoster-3.mp4",
    prompt:
      `${WC_STYLE} Interior of a coastal cottage styled in West Coast beach-house decor: whitewashed walls, ` +
      `pale timber, linen and rope textures, driftwood and shells, an open window framing the turquoise ` +
      `Atlantic and white beach beyond, sheer curtains drifting in the sea breeze. Bright airy relaxed mood. ` +
      `Slow elegant dolly across the room toward the ocean view.`,
  },
  {
    file: "paternoster-4.mp4",
    prompt:
      `${WC_STYLE} Uplifting closing shot: a relaxed couple walk barefoot along the wide white Paternoster ` +
      `beach at golden hour, whitewashed cottages and moored wooden fishing boats behind them, calm turquoise ` +
      `sea and soft West Coast dunes. Warm aspirational holiday mood. Forward-moving slow steadicam follow, ` +
      `ending on calm open sky and sea as negative space for a logo.`,
  },
  {
    file: "animated-1.mp4",
    prompt:
      `${ANIM_STYLE} The friendly white male host stands proudly in front of a cheerful stylised holiday ` +
      `cottage with a bright garden and a sunny sky, waving hello to the camera with a big warm smile. ` +
      `Bouncy appealing character animation, slow push-in. Establishing hero shot.`,
  },
  {
    file: "animated-2.mp4",
    prompt:
      `${ANIM_STYLE} The same animated host sits at a desk looking overwhelmed, comically surrounded by ` +
      `floating calendar cards, sticky notes and notification bubbles swirling around his head, juggling a ` +
      `phone and laptop. Exaggerated stressed expression, playful motion-graphics chaos around him.`,
  },
  {
    file: "animated-3.mp4",
    prompt:
      `${ANIM_STYLE} The animated host taps a glowing tablet and all the chaotic floating calendar cards ` +
      `smoothly snap together into one tidy colour-coded calendar hovering beside him. His expression turns ` +
      `to relief and delight, shoulders relax. Satisfying snap-into-place motion-graphics animation.`,
  },
  {
    file: "animated-4.mp4",
    prompt:
      `${ANIM_STYLE} Uplifting closing shot: the animated host stands confidently between several cheerful ` +
      `stylised properties lined up along a sunny street, arms relaxed and proud as a soft glow rises behind ` +
      `him. Bright aspirational mood, gentle push-out ending on clean sky as negative space for a logo.`,
  },
]

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "disabled in production" }, { status: 403 })
  }
  const idx = Number(new URL(req.url).searchParams.get("scene") ?? "0")
  const scene = SCENES[idx]
  if (!scene) return Response.json({ error: `no scene ${idx}` }, { status: 400 })

  const started = Date.now()
  try {
    const { videos, warnings } = await generateVideo({
      model: MODEL,
      prompt: scene.prompt,
      aspectRatio: "16:9",
      duration: 8,
      generateAudio: false,
    })
    await mkdir(OUT_DIR, { recursive: true })
    const fileData = videos[0]
    await writeFile(path.join(OUT_DIR, scene.file), fileData.uint8Array)
    return Response.json({
      ok: true,
      scene: idx,
      file: `/promo/${scene.file}`,
      mediaType: fileData.mediaType,
      seconds: Math.round((Date.now() - started) / 1000),
      warnings,
    })
  } catch (err) {
    return Response.json(
      { ok: false, scene: idx, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
