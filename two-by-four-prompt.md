# Build prompt — Two by Four

The prompt this app was built from. Kept in the repo so the build is reproducible
and so the next change starts from the same brief.

---

## The ask

Build **Two by Four**, a shared daily-activity tracker that a whole Northwestern
Mutual office runs on their own phones — iPhone and Android — from one link. It
has to be robust, aesthetically pleasing, and stimulating enough that people
*want* to open it and log.

## The domain (this is not generic habit tracking)

It implements O. Alfred Granum's **Fixed Activity Commitment Chart** from the One
Card System. Everything below is a term of art and must be used exactly:

- **Qualified suspect** — a name is only a suspect when all four are known: name
  and approximate age; a daytime phone, address or email; occupation or title;
  approximate income. Miss one and it stays a name and does not count.
- **Fact finder set** — a fact finding interview with a date and time on the
  calendar. The 20-minute Zoom counts. A warm reply does not.
- **The commitment** — set **2** fact finders and obtain **4** qualified suspects
  in a day. Do both and one box on a 200-box card fills, stamped with the date.
  Do one of the two and the box stays open. This is the "two by four".
- **Activity points** — 1 point per fact finder set, 0.5 per qualified suspect.
  100 points in a month is 100% efficiency.
- **10:3:1** — 10 qualified suspects produce 3 fact finders produce 1 client,
  most of it arriving over the following two to three years.
- **Activity × (Validation + Good Attitudes) = Results** — the formula printed on
  the real card.
- Weekends never count against anyone. Days marked **vacation** or **training**
  are tracked on their own 30-box grids and protect a streak.

## What it must do

0. **Hand out the link.** A share control that copies the page URL, because the
   link is how the office joins.
1. **Log a day** in two taps. Two counters — fact finders set, qualified suspects
   obtained — with big steppers, progress rings, and immediate feedback the
   moment the day is kept.
2. **Fill the card.** A 200-box Fixed Activity Commitment card, each kept day
   stamped with its date, plus the vacation and training grids.
3. **Show the office.** Live standings across everyone using the link, rankable
   by boxes, streak, kept rate, and monthly activity points.
4. **Give management a view** behind a code: who has logged today, who hasn't,
   streaks, rates, weekly totals, CSV export, PIN reset, chart removal.
5. **Back-fill.** Any of the last seven days can be edited, never a future day.

## Technical requirements

- **One self-contained, standalone HTML file** that opens from a plain URL — it
  ships on this repo's GitHub Pages site, and the office gets that link. No build
  step, no framework, no external JS. Google Fonts is the only outside resource.
  Not a Claude artifact.
- **Shared across phones** through the same Supabase project the dashboard and
  the Granum game already use, one row per person in `two_by_four_cards`. Talk to
  PostgREST with the browser's own `fetch` and the public anon key, exactly as
  `granum-game.html` does: no SDK for a content blocker to break, and no realtime
  WebSocket, which Safari and office wifi often drop. Poll to stay live. Ship a
  one-time `two-by-four-schema.sql` alongside it.
- **Robust when the network isn't.** Render from a local cache instantly on open;
  keep working and keep logging when the board is unreachable; merge remote and
  local day-by-day on the newer timestamp so two phones logging the same person
  never lose an entry; debounce writes; retry connection failures with backoff
  but never retry a request the server rejected outright; show sync state
  honestly instead of pretending.
- **Built for a phone.** Safe-area insets, 16px inputs so iOS doesn't zoom,
  `touch-action: manipulation`, no horizontal scroll at 320px, real 44px+ touch
  targets, haptics, and a bottom tab bar that clears the home indicator.
- **Identity** is a name plus a 4-digit PIN, hashed with SHA-256. Say plainly in
  the app that this keeps cards from being opened by accident and is not a
  security lock — the page is on the open web, the link is what keeps it private,
  and only activity counts belong in it, never client names.

## Design direction

Honor the identity already established for this app: deep navy ground,
periwinkle, electric blue, Playfair Display over Source Sans 3.

Push it somewhere specific: **the One Card System is a physical card.** Make the
app a stack of white card stock floating on a navy ground, and stamp kept days
the way a date stamp actually marks a card — typewriter face, carmine ink, each
one rotated a degree or two off square, no two alike. That stamp is the reward
the whole app is built around, so spend the animation budget there: it slams
down, the ring closes, confetti, a chime, a haptic knock. Milestones at 1, 10,
25, 50, 100, 150 and 200 boxes get the bigger version.

Keep everything around that quiet. Respect `prefers-reduced-motion`. Design all
three theme states — explicit dark, explicit light, and the unstamped default
where only `prefers-color-scheme` decides.

## Copy

Write from the advisor's side of the screen. Plain declarative sentences, no
exclamation marks, no coaching voice. "Kept." not "Great job!". Name things the
way Granum names them.
