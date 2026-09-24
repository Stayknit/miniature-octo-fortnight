# StayKnit User Manual — Hosts & Owners

*How to use the StayKnit app day to day. Written for two audiences: the **Host** who manages the properties, and the property **Owner** who receives payout statements.*

Last updated: 24 September 2026

---

## 1. What StayKnit is

StayKnit is a short-stay hosting management app. It pulls the calendars from every booking site a property is listed on (Airbnb, Booking.com, Nightsbridge, LekkerSlaap, Vrbo, and others) into one place, tracks direct bookings and owner stays, and produces clean monthly payout statements for the people who own the properties you manage.

There are two ways to sign in:

- **Host portal** — the full management app. This is for the person running the listings.
- **Owner portal** — a read-only view for a property owner to see their own units, upcoming stays, and statements.

> StayKnit is a management and record-keeping tool. It is **best-effort** for calendar accuracy and is **not the system of record** for your bookings — always reconcile against the payouts and dashboards on each booking site. Guest payments and owner payouts are arranged directly between the parties; money does not flow through StayKnit.

---

## 2. Getting started

### 2.1 Create your account
1. Go to the StayKnit sign-up page and register with your email and a password.
2. The first time you enter the app you will be asked to **accept the relay terms**. This is required once before you can use the app.
3. You start on a **free trial**. No card is required to begin.

### 2.2 Signing in later
- Use **Sign in** with your email and password.
- Forgot your password? Use **Forgot password** to receive a reset link.

### 2.3 Switching color theme
- The color-mode switcher (the palette icon) lives at the top of the **Today** tab. Tap it and choose **Dark**, **Light**, **Midnight**, or **Sepia**. Your choice is remembered on that device.

---

## 3. The Host portal

The Host portal has five tabs along the bottom (or side on desktop): **Today**, **Calendar**, **Channels**, **Finances**, and **Plan**. Account settings are reached from the settings control in the top corner.

### 3.1 Today

Your daily operating screen.

- **Needs you** — anything requiring action, such as a newly imported booking to acknowledge or an overlapping-dates conflict between two sites. Acknowledge a booking to clear it from this list.
- **Arrivals today** — guests checking in today.
- **Checking out** — guests checking out today.
- **Direct bookings & owner stays** — stays you entered by hand (see below).
- **New direct booking** — record a booking that did not come from a listing site (a walk-in, a repeat guest, a phone reservation). You capture the property, guest label, dates, and the amount. Direct bookings appear on the owner's statement as revenue.
- **Block dates** — hold dates so no site shows them as available (owner stay, maintenance, personal use). You can add a short reason.
- **Cancel booking** — remove a direct booking or a block you created.

If you have not set anything up yet, Today shows a short **Welcome to StayKnit** checklist: add a property, connect your channels, and invite your owners.

### 3.2 Calendar

A merged month view of every unit's availability, combining all connected booking sites plus your direct bookings and blocks.

- Bars show each stay, colored by the site it came from; blocked dates use a hatched pattern.
- A **Blocked dates** list shows every hold — including far-future ones — with tap-to-jump so a hold months away is never hidden.
- Use this view to spot double-bookings and confirm that a block has propagated.

### 3.3 Channels

Where you connect each listing site's calendar. StayKnit uses the **iCal** standard that every major booking site supports.

**Import availability (incoming)**
- Add **one iCal feed per listing site a unit is on**. A cottage on both Airbnb and Booking.com gets two feeds.
- Use **Connect feed**, choose the property, pick the listing site, and paste that site's iCal **export URL**.
- StayKnit merges every feed into a single calendar, so a stay booked on any site blocks those dates in your combined view.
- **Import iCal now** refreshes all feeds on demand. Each feed shows when it last synced, or an error with an automatic retry if a URL stops working.
- **Edit** or **Remove** a feed at any time from its row.

**Channels (per booking site)**
- Each listing site you have feeds for appears as a channel. Its **units linked** count and **sync status** are read from your real feeds — not typed in — so they always match reality.
- **Edit channel** lets you rename the site label. **Sync now** runs a real import and is disabled when the channel has no feeds connected.

**Export availability (outgoing)**
- Each unit can **publish** its own StayKnit calendar link (a private `.ics` URL). Paste that link into the **Import calendar** box on your booking sites so blocks and direct bookings you create *inside StayKnit* also close those dates on the sites.
- Only holds you make in StayKnit are shared out; imported reservations from a site are never echoed back to it.
- The link is private — anyone with it can see that unit's blocked dates. Use **Regenerate** to rotate the link if it ever leaks, and **Stop publishing** to switch it off.

**Blocking dates across sites (important)**
StayKnit does not force one site to block another for you automatically end-to-end. Each site has its own **Export** link and **Import** box. The reliable pattern, explained in the in-app guide "Block dates across your booking sites":
1. On each site, copy its calendar **Export** link.
2. On every *other* site, paste that link into the **Import** box and name it clearly (for example "Airbnb").
3. Publishing StayKnit's own export link into each site adds your in-app blocks and direct bookings to the mix.

> Booking sites refresh imported calendars on their own schedule — usually every few hours, not instantly. Keep a small safety buffer and check the live calendar before you commit a tight turnaround.

### 3.4 Finances

Everything to do with owners and their money.

- **Owner payouts this month** — the headline total you will pay out; statements send on the 1st.
- **Statement costing** — the cost lines applied to owner statements:
  - **Default commission** — your base management fee, taken off gross revenue.
  - **Add line** — additional charges. A percentage comes off gross revenue; a fixed amount can bill once or per booking. A line can be **scoped to one property** for a per-unit charge, and flagged as a **host fee** so VAT is added on top of it.
  - **VAT** — turn VAT on/off and set the rate; it applies to the lines you flag as host fees.
- **Owners** — add and manage the property owners you pay out.
  - **Add owner** — name, email, and the units they own.
  - **Add property & link owner** — create a unit and attach it to an owner in one step.
  - Open any owner to see their net payout, paid-to-date, amount due, a per-property breakdown, and a **Bookings — payment status** list where you tick off each booking as paid.
- **Owner portal access** — grant an owner their own read-only login:
  - Create the owner login (this sends/sets their access). Access is a read-only calendar and statements only.
  - Access defaults to **off** and can only be switched on once a real linked owner login exists, so an owner can never accidentally see another owner's data or your host tools.
- **Switch to owner view** — preview exactly what a given owner sees.

### 3.5 Plan

Your StayKnit subscription. StayKnit charges a flat fee — there is **no commission on your bookings, ever**.

- **Free trial** — you begin here; the screen shows days remaining.
- **Choose a plan** — paid tiers billed in **South African Rand (ZAR)** through Paystack. Terms are **prepaid** and billed once. Available periods include monthly, 6-month (10% off), and yearly.
- **Promo / access codes** — redeem a code with the code bar. A discount shows as "promo discount applied at checkout"; a discount code applies to one successful payment.
- **Auto-renewal** — **optional and off by default.** Turn it on to have your term extend automatically (requires paying once by card so a card is on file); leave it off to simply re-purchase when you choose.
- **Cancel plan** — you keep access through a **notice period** from the cancel date (1 month for monthly terms, 2 months for 6-month/yearly), then your account reverts to the free trial. Any prepaid balance beyond the notice is refunded **pro-rata**, reviewed and released by StayKnit, and reflects on your card within **5–10 business days, depending on your bank**. Cancelling also switches auto-renewal off. You can **resume** any time before the term ends.

If your trial lapses with no paid term, the app freezes behind a subscribe screen until you choose a plan. A term ending soon shows a dismissible reminder; access continues.

### 3.6 Settings

Reached from the settings control in the top corner. Here you manage:
- **Account details** — currency and time zone (these drive how money and dates display across the app), plus your business name, email, and phone used on statements.
- **Notifications** and other preferences.
- **Sign out** and profile management.

> Note: statement costing (commission and VAT) lives on the **Finances** tab, not in Settings.

---

## 4. The Owner portal

The Owner portal is a **read-only** view for a property owner. Everything is scoped to that owner — they only ever see their own units, stays, and statements. Owners cannot change bookings, pricing, or costing; the host manages all of that.

It has three tabs: **Overview**, **Calendar**, and **Statement**.

### 4.1 Overview
- **You receive** — this month's net payout in large type, with gross revenue and total fees/costs alongside it, and the date the statement sends.
- **Quick stats** — nights booked, gross revenue, and number of units.
- **Your units** — a searchable grid (search appears once you have more than three units), each showing how many upcoming stays it has.
- **Upcoming stays** — your next arrivals with dates, nights, and the site each came from. A link jumps to the Calendar.

### 4.2 Calendar
- A month view with an **occupancy bar per unit** and a percentage booked.
- If the current month has no stays, the view automatically lands on the month that does, so you never open to an empty grid.
- **All stays this month** lists each stay; blocked dates show as "Blocked".

### 4.3 Statement
- **Paid to date** and **Due to you**, reflecting the host's per-booking payment ticks.
- **How this statement splits** — a bar showing what you receive versus the host fee and costs, with percentages.
- A line-by-line breakdown: nights booked, gross revenue, each deduction, and your **net payout**. Multi-unit owners also get a per-property breakdown.
- **Statement format** — choose a format, then **Download** it or **Email to me**.
- **Payout history** — recent months for your records.

> StayKnit tracks these figures for your records. **Payment is arranged directly with your host, not through StayKnit.** Any questions about a statement go to your host.

---

## 5. Frequently asked questions

**Does money move through StayKnit?**
No. Guests pay through the booking sites or directly to the host; the host pays owners directly. StayKnit records and reports the figures.

**Why don't my blocked dates show on another site instantly?**
Booking sites refresh imported calendars on their own schedule (often a few hours). StayKnit publishes and imports promptly, but each site controls how often it pulls. Keep a buffer for tight turnarounds.

**A feed shows an error — what do I do?**
Open the feed on the **Channels** tab and check the URL is still the site's current iCal export link. StayKnit retries automatically; re-paste the URL with **Edit** if the site regenerated it.

**Can an owner see another owner's data?**
No. The owner view is scoped on the server to that owner only, and portal access is off until a real linked owner login exists.

**Which currency am I billed in?**
StayKnit subscriptions are billed in South African Rand (ZAR) via Paystack.

**How do refunds on my subscription work?**
Cancelling gives you a notice period, then a pro-rata refund of any unused prepaid balance, released by StayKnit and reflected on your card within 5–10 business days depending on your bank.

---

## 6. Getting help

- Contact your host for anything about your properties, bookings, or statements (owners).
- Hosts: use the in-app support/contact channel, or email StayKnit support.
- If you are stuck on a booking-site calendar setting, follow the in-app **"Block dates across your booking sites"** and **"Where to find Export / Import"** guides on the Channels tab.
