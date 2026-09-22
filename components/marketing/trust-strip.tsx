const STATS = [
  { value: '0%', label: 'Commission on bookings' },
  { value: '40+', label: 'Channels kept in sync' },
  { value: '14 days', label: 'Free, full-access trial' },
  { value: '4', label: 'Currencies billed natively' },
]

export function TrustStrip() {
  return (
    <section className="border-y border-border bg-surface/40">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-5 md:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-1 py-8 text-center">
            <dt className="text-3xl font-extrabold tracking-tight text-primary">{stat.value}</dt>
            <dd className="text-sm text-muted-foreground">{stat.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
