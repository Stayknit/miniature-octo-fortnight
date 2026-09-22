import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "StayKnit — Promo Advert Kit",
  description: "AI-generated advert b-roll clips, voiceover script, and CapCut assembly notes for the StayKnit promo.",
}

type Scene = {
  n: number
  file: string
  title: string
  timecode: string
  vo: string
  onScreen: string
}

const SCENES: Scene[] = [
  {
    n: 1,
    file: "/promo/scene-1.mp4",
    title: "Hook — the host & the home",
    timecode: "0:00 – 0:07",
    vo: "Running a short-stay in South Africa? Meet StayKnit.",
    onScreen: "StayKnit",
  },
  {
    n: 2,
    file: "/promo/scene-2.mp4",
    title: "Problem — bookings everywhere",
    timecode: "0:07 – 0:14",
    vo: "Airbnb, Booking.com, Lekkeslaap — juggling calendars means double bookings and stress.",
    onScreen: "One place for every booking",
  },
  {
    n: 3,
    file: "/promo/scene-3.mp4",
    title: "Solution — one synced calendar",
    timecode: "0:14 – 0:22",
    vo: "StayKnit centralises every calendar in one place, so double bookings simply stop.",
    onScreen: "No more double bookings",
  },
  {
    n: 4,
    file: "/promo/scene-4.mp4",
    title: "Payoff — grow with confidence",
    timecode: "0:22 – 0:30",
    vo: "From one property to many — with owner management and financial oversight built in. StayKnit. Manage smarter, scale simpler.",
    onScreen: "StayKnit — manage smarter, scale simpler",
  },
]

const FULL_VO = SCENES.map((s) => s.vo).join(" ")

// Paternoster / West Coast location b-roll — lifestyle establishing shots you
// can intercut with the story above or cut as a standalone destination reel.
const WC_SCENES: Scene[] = [
  {
    n: 1,
    file: "/promo/paternoster-1.mp4",
    title: "Village & bay — establishing",
    timecode: "0:00 – 0:07",
    vo: "On the West Coast, where whitewashed cottages meet the Atlantic…",
    onScreen: "Paternoster, Western Cape",
  },
  {
    n: 2,
    file: "/promo/paternoster-2.mp4",
    title: "Cottage welcome — golden hour",
    timecode: "0:07 – 0:14",
    vo: "…every stay should feel effortless — for your guests and for you.",
    onScreen: "Effortless hosting",
  },
  {
    n: 3,
    file: "/promo/paternoster-3.mp4",
    title: "Interior — sea breeze",
    timecode: "0:14 – 0:22",
    vo: "StayKnit keeps every booking in sync, so you can focus on the welcome.",
    onScreen: "One synced calendar",
  },
  {
    n: 4,
    file: "/promo/paternoster-4.mp4",
    title: "Beach payoff — golden hour",
    timecode: "0:22 – 0:30",
    vo: "Manage more properties, more easily. StayKnit — hosting, sorted.",
    onScreen: "StayKnit — hosting, sorted",
  },
]

const WC_FULL_VO = WC_SCENES.map((s) => s.vo).join(" ")

// Animated (Pixar-style 3D) advert featuring an animated white male host —
// friendly, playful, great for social and explainer-style placements.
const ANIM_SCENES: Scene[] = [
  {
    n: 1,
    file: "/promo/animated-1.mp4",
    title: "Hero — meet the host",
    timecode: "0:00 – 0:07",
    vo: "Running a short-stay in South Africa? Say hello to StayKnit.",
    onScreen: "StayKnit",
  },
  {
    n: 2,
    file: "/promo/animated-2.mp4",
    title: "Problem — booking chaos",
    timecode: "0:07 – 0:14",
    vo: "Calendars everywhere, notifications non-stop — juggling platforms is exhausting.",
    onScreen: "One place for every booking",
  },
  {
    n: 3,
    file: "/promo/animated-3.mp4",
    title: "Solution — everything snaps into place",
    timecode: "0:14 – 0:22",
    vo: "One tap, and StayKnit brings every booking together in a single synced calendar.",
    onScreen: "No more double bookings",
  },
  {
    n: 4,
    file: "/promo/animated-4.mp4",
    title: "Payoff — scale with a smile",
    timecode: "0:22 – 0:30",
    vo: "From one property to many, managed with ease. StayKnit — manage smarter, scale simpler.",
    onScreen: "StayKnit — manage smarter, scale simpler",
  },
]

const ANIM_FULL_VO = ANIM_SCENES.map((s) => s.vo).join(" ")

export default function PromoPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="mb-10 border-b border-neutral-800 pb-8">
          <p className="mb-2 text-sm font-medium tracking-widest text-teal-400 uppercase">Promo Advert Kit</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Stay<span className="text-teal-400">Knit</span> — advert clips
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-neutral-400">
            One finished vertical advert ready to post, plus three sets of AI-generated b-roll (~8s each, silent 16:9)
            for building your own. Each b-roll set cuts together into a 20–30 second advert — a live-action
            host&apos;s-story arc, a Paternoster / West Coast destination reel, and an animated (Pixar-style) advert.
            Drop a set into CapCut in order, lay the voiceover and music over the top, and add the on-screen text cues.
          </p>
          <a
            href="/promo/download"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-teal-400"
          >
            Download all clips + script (.zip)
          </a>
        </header>

        <FeaturedAd />

        <div className="my-12 border-t border-neutral-800" />

        <SceneSet
          eyebrow="Set A — Story advert"
          heading="The host's story"
          blurb="A narrative arc: hook, problem, solution, payoff. This is the core 30-second advert."
          scenes={SCENES}
          fullVo={FULL_VO}
          downloadHref="/promo/download/story"
          voiceoverSrc="/promo/voiceover-story.mp3"
        />

        <div className="my-12 border-t border-neutral-800" />

        <SceneSet
          eyebrow="Set B — Paternoster / West Coast"
          heading="Destination reel"
          blurb="Whitewashed cottages, turquoise Atlantic and golden-hour beach b-roll from Paternoster. Cut it as a standalone destination reel, or intercut these shots with Set A for a coastal feel."
          scenes={WC_SCENES}
          fullVo={WC_FULL_VO}
          downloadHref="/promo/download/paternoster"
          voiceoverSrc="/promo/voiceover-paternoster.mp3"
        />

        <div className="my-12 border-t border-neutral-800" />

        <SceneSet
          eyebrow="Set C — Animated advert"
          heading="Animated (Pixar-style)"
          blurb="A friendly animated host walks through the same story in a playful 3D style. Great for social, explainer placements, and audiences who respond to character-led animation."
          scenes={ANIM_SCENES}
          fullVo={ANIM_FULL_VO}
          downloadHref="/promo/download/animated"
          voiceoverSrc="/promo/voiceover-animated.mp3"
        />
      </div>
    </main>
  )
}

function FeaturedAd() {
  return (
    <section>
      <div className="mb-6">
        <p className="mb-1 text-xs font-medium tracking-widest text-teal-400 uppercase">Finished advert — ready to post</p>
        <h2 className="text-2xl font-bold tracking-tight">The StayKnit ad</h2>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-neutral-400">
          A finished vertical (9:16) advert — no editing needed. Post it straight to Instagram Reels, TikTok, YouTube
          Shorts, WhatsApp Status, or Facebook. The b-roll sets below are for rolling your own variations.
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:flex-row sm:items-start sm:p-6">
        <div className="w-full max-w-[300px] shrink-0">
          <div className="overflow-hidden rounded-[2rem] border-[6px] border-neutral-800 bg-black shadow-xl">
            <video
              className="aspect-[9/16] w-full bg-black"
              src="/promo/paternoster-ad.mp4"
              controls
              playsInline
              preload="metadata"
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 sm:pt-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs tracking-wide text-neutral-500 uppercase">Format</dt>
              <dd className="mt-0.5 font-medium text-neutral-200">Vertical 9:16 (1080×1920)</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-neutral-500 uppercase">Length</dt>
              <dd className="mt-0.5 font-medium text-neutral-200">~22 seconds</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-neutral-500 uppercase">Best for</dt>
              <dd className="mt-0.5 font-medium text-neutral-200">Reels · TikTok · Shorts · Status</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-neutral-500 uppercase">Status</dt>
              <dd className="mt-0.5 font-medium text-neutral-200">Final — no editing needed</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3">
            <a
              href="/promo/paternoster-ad.mp4"
              download
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-teal-400"
            >
              Download the ad (.mp4)
            </a>
            <a
              href="/promo/paternoster-ad.mp4"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              Open full screen
            </a>
          </div>

          <p className="text-xs text-neutral-500">
            Tip: on a phone, tap Download then share straight from your camera roll to keep full quality.
          </p>
        </div>
      </div>
    </section>
  )
}

function SceneSet({
  eyebrow,
  heading,
  blurb,
  scenes,
  fullVo,
  downloadHref,
  voiceoverSrc,
}: {
  eyebrow: string
  heading: string
  blurb: string
  scenes: Scene[]
  fullVo: string
  downloadHref: string
  voiceoverSrc: string
}) {
  return (
    <section>
      <div className="mb-6">
        <p className="mb-1 text-xs font-medium tracking-widest text-teal-400 uppercase">{eyebrow}</p>
        <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-neutral-400">{blurb}</p>
        <a
          href={downloadHref}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-teal-400"
        >
          Download this set (.zip)
        </a>
      </div>

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        {scenes.map((scene) => (
          <article key={scene.file} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
            <div className="relative aspect-video bg-black">
              <video
                className="h-full w-full object-cover"
                src={scene.file}
                controls
                loop
                muted
                playsInline
                preload="metadata"
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">
                  <span className="mr-2 text-teal-400">{scene.n}.</span>
                  {scene.title}
                </h3>
                <span className="shrink-0 rounded-full bg-neutral-800 px-2.5 py-1 font-mono text-xs text-neutral-300">
                  {scene.timecode}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Voiceover</dt>
                  <dd className="mt-0.5 text-neutral-200">{scene.vo}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">On-screen text</dt>
                  <dd className="mt-0.5 text-neutral-400">{scene.onScreen}</dd>
                </div>
              </dl>
              <a
                href={scene.file}
                download
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-teal-400"
              >
                Download clip
              </a>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <h3 className="mb-3 text-lg font-semibold">Full voiceover script</h3>
        <p className="text-pretty leading-relaxed text-neutral-300">{fullVo}</p>
        <p className="mt-4 text-xs text-neutral-500">
          Paced for ~27–30 seconds at a natural advert read. Trim the last line if you need to land under 30s.
        </p>

        <div className="mt-5 border-t border-neutral-800 pt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-neutral-200">AI voiceover</h4>
            <a
              href={voiceoverSrc}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-neutral-950 transition-colors hover:bg-teal-400"
            >
              Download mp3
            </a>
          </div>
          <audio className="w-full" src={voiceoverSrc} controls preload="none" />
          <p className="mt-2 text-xs text-neutral-500">
            Generated narration of the script above — drop it straight into CapCut, or record your own instead.
          </p>
        </div>
      </div>
    </section>
  )
}
