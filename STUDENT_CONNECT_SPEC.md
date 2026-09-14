# Student Connect & Mentor — Build Specification

**Status:** Ready to build from, with one open decision (§2) that must be resolved with the client
before backend work starts — it changes the data model. This document is the single source of
truth for turning the approved design artifact into real Angular + Express code. It captures
**every** screen, field, state, copy string and business rule shown in the artifact, plus the full
backend data model and API surface needed to power it, for **both** candidate approaches the
artifact now demonstrates.

**Reference artifact (visual/interaction source of truth):**
`https://claude.ai/code/artifact/5cd2c535-86f8-4802-abea-94390212aaf3`
The artifact is a static, in-memory HTML/CSS/JS click-through prototype — no Angular, no backend,
nothing persists on reload. Every visual and interaction detail below was read directly out of that
file. When this document and the artifact ever disagree, the artifact is correct and this document
has drifted — update the doc.

---

## 1. Product Summary & Guardrails

**Objective:** make Tamilya the place where a Tamil student can find someone who is already
studying where they want to go — student-to-student experience and practical guidance.

**Positioning — must never promise:**
- University admission
- Visa approval
- Immigration approval
- Guaranteed jobs
- Guaranteed accommodation
- Guaranteed application success

Mentors share personal experience, not professional advice. Where professional immigration/legal
advice is needed, direct users to a qualified professional.

> **Open item:** the artifact previously showed this as a persistent banner strip at the top of the
> module; it was removed on client feedback to keep the page as plain/context-only as the rest of
> the app. The *disclaimer text itself is still a stated requirement* (§1) — it just no longer has a
> UI home in the artifact. Decide where it lives in the real build: a one-time modal on first visit,
> a line in the registration gate's privacy notice (§4.1 step 4 already carries a related but
> narrower privacy notice), a permanent footer note, or the module's help/terms page. Don't let it
> silently disappear along with the banner.

**Privacy rules (enforced by both UI and API, not just hidden client-side):**
- Never publicly display student ID numbers or verification documents.
- Never expose phone/email until a connection request is accepted by both sides — **or, under the
  In-App Chat model (§2), never expose them at all.**
- Only verification **status** (Verified Student / Verification Pending) is shown — not the method
  or documents used.
- Users can report/block another user at any time.
- Admin moderation queue is required before any profile shows the Verified Student badge.

**Scalability rule:** the location/education taxonomy is `Country → Region/State → City →
University → Course`. Do not hard-code any country's universities (the artifact's own sample data
spans Germany, UK, Ireland and Canada for exactly this reason). Admin must eventually be able to
add/edit this data without a code deploy.

---

## 2. Open Decision: Contact Sharing vs. In-App Chat

The client never confirmed whether this module should reveal contact details (email/phone) once
two students connect, or keep every conversation inside Tamilya via a real chat feature — the
original plan listed "Basic Tamilya chat" as a Phase 1 item, it was descoped from the artifact on
an earlier pass pending confirmation, and has since been added back **as a second, toggleable
concept** so both can be compared side by side instead of choosing from a written description
alone. **This is the single biggest decision blocking real backend work** — the two models imply
different database tables, different privacy guarantees, and different Phase 2 monetization paths.

The artifact's module header now carries a **concept toggle** — "Contact Sharing" / "In-App Chat" —
visible on every tab, with a framing note: *"Two possible approaches — not yet confirmed by the
client. Toggle to compare how connecting and mentoring work under each model."* Switching it changes:
- Whether the profile page's mentor-info card shows an email/phone reveal block, or a "Chat is
  locked / Open Chat" block that never shows contact details at all.
- Whether a **Chat** tab appears in the local tab strip at all.
- Whether My Profile's Mentoring Type radio group allows Paid chat / Paid call to be selected, or
  keeps them permanently disabled ("Coming soon").

### Model A — Contact Sharing
- **What it is:** once a connection request is accepted, both sides' email and phone become visible
  on each other's profile (§4.3). No chat UI, no message storage.
- **Pros:** smallest possible backend — no real-time infrastructure, no message storage, no chat
  content moderation surface. Fastest to ship.
- **Cons:** once contact details are shared, the conversation (and any money that changes hands)
  happens completely off-platform. There is no way to safely support **paid** mentoring under this
  model — nothing stops a payment being arranged outside Tamilya once contact info is exchanged, so
  Paid chat/Paid call must stay disabled indefinitely, not just in Phase 1. There's also no
  in-platform record to inspect if a report is filed about what was actually said.

### Model B — In-App Chat
- **What it is:** connecting unlocks an in-app chat thread instead of contact details; email/phone
  are never shown to other members, ever. All conversation — free or paid — happens inside Tamilya.
- **Pros:** the only one of the two models that can safely support Phase 2 paid consultations
  (funds and conversation both stay on-platform, so Tamilya can take a commission and adjudicate
  disputes — see §8.4). Full message history for moderation if a report is filed. Matches "Basic
  Tamilya chat" from the client's original plan.
- **Cons:** meaningfully more Phase 1 backend (real-time delivery, message storage, retention
  policy, its own moderation surface — see §8.3). Bigger scope than Model A.

**Recommendation (non-binding):** if paid mentoring is a near-term goal for this module, Model B is
close to a prerequisite for it — Model A cannot be safely upgraded to support payments later without
also becoming Model B. If the priority is shipping the smallest possible v1 fast and paid mentoring
is a distant maybe, Model A is meaningfully less work. Either way, get the client's answer in
writing before starting §8's backend build — it is not a decision to make unilaterally mid-build.

---

## 3. Information Architecture & Navigation

- **Sidebar entry:** a new nav item **"Student Connect"** with a graduation-cap icon and a `NEW`
  pill badge, positioned between **Jobs** and **Events** in the "Explore" section of the existing
  user sidebar (`user-layout.component.html`). Clicking it while unregistered goes straight to the
  registration gate (§4.1); once registered (even if still pending) it opens Discover (§4.2).
- **Module header:** the shared top header's title becomes `Student Connect / {Section}`, where
  `{Section}` is one of: `Register` (gate), `Discover`, `Discover / Profile` (detail view),
  `My Profile`, `Requests`, `Chat` (Model B only), `Connections`, `Saved`.
- **Concept toggle bar** (§2) — sits above the tab strip, on every tab, once registered. This is a
  comparison/demo device for this artifact, **not a real per-user setting** — the real build ships
  exactly one model, chosen once, not a switch end users see.
- **Local tab strip** (only visible once registered): **Discover · My Profile · Requests (count
  badge) · [Chat — Model B only] · Connections · Saved**.
- There is **no separate promotional/teaser banner** anywhere in the module — an earlier pass added
  a homepage-style teaser banner (campus-skyline illustration) atop Discover, then atop every tab;
  it was removed entirely on client feedback so this page reads like every other listing page in the
  app (plain title + subtitle, then straight into filters/tabs), not a bolted-on marketing module.

---

## 4. Profile / Verification State Machine

```
unregistered ──(submit registration)──► pending ──(admin approves)──► verified
                                            │
                                            └──(admin rejects)──► pending (stays, admin can request more info)
```

- **`unregistered`**: only the registration gate is reachable. Nothing else in the module renders.
- **`pending`**: full module access (Discover, Requests, Connections, Saved, My Profile) — **the
  user is not blocked from using the module while awaiting verification.** Their own profile shows
  a "Verification Pending" badge everywhere instead of "Verified Student". A pending banner with a
  3-step progress tracker (Profile submitted ✓ → Under admin review → Verified Student badge) shows
  on **My Profile**.
- **`verified`**: "Verified Student" badge replaces "Verification Pending" everywhere the user's
  profile is shown (their own card, their own profile page, other users' view of them).

This state only gates the **badge**, not access — a pending user can still search, view profiles,
send/receive connection requests, and connect (contact reveal or chat, per §2) once accepted.

---

## 5. Screens — exact specification

### 5.1 Registration Gate (multi-step wizard)

Shown full-page, centered, max-width 640px, the moment an unregistered user opens the module.

**Header:** eyebrow "Step _N_ of 4 · _Step name_" (updates per step) · title "Register as a
Student" · sub "Create your student profile to unlock search, connections and mentoring — approval
usually takes 1–2 business days."

**Stepper:** 4 numbered circles connected by a line — **Basic Info → Education → Languages →
Review**. Current step: outlined amber ring. Completed steps: filled amber circle with a checkmark,
label darkens, connecting line to its right fills solid amber.

**Step 1 — Basic Info**
| Field | Type | Required | Notes |
|---|---|---|---|
| Profile photo | image upload | optional | placeholder circle only in artifact; copy: "Optional, but verified students with a photo get 3× more connection requests." |
| First name | text | ✓ | |
| Country | select | ✓ | artifact list: Germany, United Kingdom, Ireland, Canada, Australia, New Zealand, United States — **replace with the real Country→Region→City cascading picker from master-data in the actual build** (see §10) |
| City | text | ✓ | |

Nav: `Next: Education` (primary, full row).

**Step 2 — Education**
| Field | Type | Required |
|---|---|---|
| University | text | ✓ |
| Course / Programme | text | ✓ |
| Study level | select (Master's / Bachelor's / PhD / Diploma) | ✓ |
| Year of study | select (1st year / 2nd year / 3rd year / Final year) | ✓ |

Nav: `Back` (outline) / `Next: Languages` (primary).

**Step 3 — Languages & About**
| Field | Type | Required |
|---|---|---|
| Languages | multi-select chip picker (Tamil, English, German, French, Hindi — extend as needed) | ✓ |
| Short introduction | textarea | ✓ |
| *Optional details (collapsed `<details>`):* Previous country (text), Academic/professional background (textarea), Areas you could help with — if you'd like to mentor later (chip picker: University Life, Accommodation, Course Experience, Cultural Adjustment) | all optional |

Nav: `Back` / `Next: Review`.

**Step 4 — Review & Submit**
- Live read-only summary of everything entered in steps 1–3: Name, Country/City, University,
  Course, Study level/Year, Languages — rendered as label/value pairs, generated from the actual
  field values (not hardcoded), so the user can catch mistakes before submitting.
- Privacy notice (exact copy): *"Only your first name, country/city, university, course and areas
  of help are ever shown publicly. Your student ID, verification documents and contact details are
  never visible to other members — see Verification below."*
- Nav: `Back` / `Submit for Verification` (primary).

**On submit:** profile status → `pending`; user is dropped straight into the Discover tab; a toast
confirms "Profile submitted — pending verification"; the profile is added to the admin verification
queue.

---

### 5.2 Discover

No teaser banner (§3) — the screen opens directly on the filter panel and result grid.

**Filter panel** — deliberately mirrors the Jobs/Business pages' filter pattern (`.jb-filter-panel`
/ `.jb-advanced-toggle` / `.jb-adv-drawer` in `jobs.component.html`/`.scss`) instead of bespoke
controls, so this reads as one app's filter system:
- **Search bar** — free text, matches against name / university / course, live as you type.
- **"Advanced Filters" toggle button** — icon + label + an active-filter-count badge (hidden when
  zero). Opens a **docked drawer** (fixed to the right edge of the viewport, no backdrop — the
  result grid stays visible and clickable behind it, exactly like the Jobs page's drawer) containing:
  - **Location** — a country select (All countries + the 7 supported countries; see §10 for the
    real cascading Country→Region→City version this stands in for).
  - **Study Level** — chip group: Any / Bachelor's / Master's / PhD.
  - **Language** — chip group: Any / Tamil / English / German / French.
  - **Verified Student** — chip group: Any / Verified only.
  - **Mentor Available** — chip group: Any / Available now. *(There is no longer a separate
    "Find Students / Student Mentors" mode toggle — an earlier pass had one, but it was removed and
    folded into this single filter, since a mentor is just a student whose `mentorAvailable` flag is
    true, not a different search mode.)*
  - **Mentoring Type** — chip group: Any / Free chat.
  - A **Clear all** action in the drawer footer.
- **Active filter chips row** — appears under the search bar once any filter is set; each filter
  shows as a removable chip (own "×"), plus a "Clear all" link — same pattern as the Jobs page's
  active-filter-chips row.
- In the artifact, all of the above **actually filters** the sample result set live (search text +
  every drawer field), not just cosmetically — treat that behavior, not just the look, as the spec.

**Result grid:** responsive 3 → 2 → 1 columns (breakpoints 1000px / 680px). Each result is a
**student card** (see next). Empty state: dashed-note "No students match these filters — try
adjusting Advanced Filters."

#### Student card — exact structure (minimal/editorial treatment)
1. **Head row:** a small avatar (initial, gradient fill) on the left, then name (bold, larger,
   Poppins) + course underneath, then a small **verification dot** flush right — solid green fill
   for Verified, dashed amber ring for Pending (shape differs, not just color, so it doesn't rely on
   color alone). No colored panel, no pill badge here — this is intentionally quieter than a typical
   directory tile.
2. **Hairline rule** (plain 1px divider) under the head row.
3. **Facts** — two plain text lines: location, then university (muted).
4. **Languages** — plain text list with spacing between items (not chip pills).
5. **Mentor status** — small dot + text: "Mentor Available · Free" (green) or "Not taking requests"
   (muted).
6. **Footer row** — "View Profile →" as a text link with an arrow that nudges on hover (not a filled
   button — the one place the accent color appears on the card, along with the mentor dot), and the
   save/bookmark icon-button at the end of the same row.

Clicking anywhere on the card (except Save) opens the profile detail view.

---

### 5.3 Profile Detail

- **Back link** ("← Back to Discover") above a two-column layout: profile card (left, flexible) +
  mentor-info card (right, fixed 300px, stacks below on narrow screens).
- **Profile card**
  - No cover-image strip — the `⋯` menu button (→ **Report** / **Block**, danger-colored) floats
    directly on the card corner as a plain icon-button, not overlaid on a color band.
  - Header: avatar inside the same verification ring as the card (solid green / dashed amber),
    "Student ID · XXX-2024" reference line above the name, name (h3), `Course · University`,
    location, then the text verification badge.
  - **Education** block: 2-column key/value grid — University, Course (degree prefix like "MSc"
    stripped for readability), Study level, Year of study.
  - **About** block: free-text intro.
  - **Languages** block: chip row.
  - **Legal note** (exact pattern, name-interpolated): *"{Name} is sharing personal experience, not
    professional advice — this isn't a guarantee of admission, visa, or job outcomes."*
- **Mentor-info card**
  - If mentor available: green status dot "Mentor Available · Free chat", areas-of-help chip row,
    primary "Connect" button.
  - If not: muted note "{Name} isn't taking new mentoring requests right now." + disabled outline
    "Connect" button.
  - **Connection reveal — branches by concept (§2):**
    - **Model A (Contact Sharing):**
      - *Not connected:* locked panel — lock icon, "Contact details are hidden", "Only your
        country, university and course are shown until {Name} accepts a connection request."
      - *Connected:* unlocked panel (green-tinted) — "Connected — contact details unlocked" heading,
        email and phone rows with icons.
    - **Model B (In-App Chat):**
      - *Not connected:* locked panel — "Chat is locked", "Chat unlocks once {Name} accepts a
        connection request. Contact details are never shared, even after connecting."
      - *Connected:* unlocked panel — "Connected — chat unlocked" heading, an **"Open Chat"** button
        (jumps to the Chat tab and opens this thread), and a note: "Contact details are never
        shared — the whole conversation stays inside Tamilya."

---

### 5.4 My Profile

- Recap header: avatar, name, `University · City, Country`.
- **Mentor Available** toggle switch — controls whether the user appears in mentor search/receives
  requests.
- **Areas of Help** — same chip multi-select pattern as registration step 3's optional section.
- **Mentoring type** — radio group, **availability depends on the active concept (§2):**
  - **Free chat** — always selectable, sub-label "No cost — always available".
  - **Paid chat** — under Model A: disabled, "Coming soon" pill. Under Model B: **enabled and
    selectable** (still no real payment processing behind it — see §8.4 — but the option is no
    longer inert).
  - **Paid call · 30 min** — same Model A/B split as Paid chat; sub-label example "e.g. £15 per
    consultation".
  - The sub-copy under the section header changes accordingly: Model A shows *"Free in this release
    — paid consultations are on the roadmap."*; Model B shows *"Paid consultations are possible here
    because conversations stay inside Tamilya — enables commission and dispute protection."* This is
    the concrete UI expression of §2's "Model B is close to a prerequisite for paid mentoring" point.
- Privacy note (exact copy, Model A phrasing): *"Only your first name, university, course and areas
  of help are shown publicly. Your contact details are never shared automatically."*
- Verification status mount at the top: verified badge, or the pending banner with the 3-step
  tracker described in §4.

---

### 5.5 Requests

Two columns:
- **Received** — each row: avatar, name, course/university, the request message, **Accept**
  (primary) / **Decline** (danger-outline) buttons while pending; becomes an "Accepted" status pill
  once actioned. Accepting adds the sender to the user's Connections and unlocks contact reveal or
  chat (per §2) both ways.
- **Sent** — each row: avatar, name, course/university, a "Pending" status pill. (Artifact-only demo
  affordance: a "Demo: mentor accepts" button simulates the other side accepting, since there's no
  real second user in a static prototype — **do not carry this button into the real build**.)
- Tab badge count = pending received + pending sent.
- Empty states: dashed-border note, e.g. "No connection requests received yet."

---

### 5.6 Chat (Model B only)

Only reachable when the "In-App Chat" concept is active; the tab is hidden entirely under Model A.
A thread only exists for an accepted connection — same access rule Model A uses for contact reveal.

- **Layout:** two-pane — a thread list (left, ~260px) and the active conversation (right), stacking
  vertically on narrow screens.
- **Thread list:** one row per connection — avatar, name, last-message preview (or "No messages
  yet"). Clicking opens that thread and highlights the row.
- **Conversation pane:** header (avatar + name + course), a scrollable message list (bubbles —
  the other person's aligned left/muted, yours aligned right/amber-gradient-filled), and an input
  row (text field + Send button, Enter also sends).
- Opening a thread from a profile's "Open Chat" button (§5.3) switches to this tab and opens that
  specific thread directly.
- Accepting a connection request (or the demo "mentor accepts" simulation) seeds an empty thread
  for that connection immediately, so Chat and Connections never disagree about who's reachable.

---

### 5.7 Connections / Saved

Simple vertical list of rows: avatar, name, course, and either a "Connected" status pill
(Connections tab) or a "Remove" button (Saved tab, unsaves and removes from the list). Clicking a
Saved row opens that profile. Empty states use the same dashed-note pattern as Requests.

---

### 5.8 Connect Modal

Triggered by the "Connect" button on a profile. Shows the target's avatar/name/course, a pre-filled
message textarea (template: *"Hi {Name}, I am planning to study {Course} at {University}. I would
like to know about your student experience."*, editable), Cancel / **Send Request** (primary).
Sending adds to the sender's Sent list (status `pending`) and — in the real build — should create a
notification for the recipient.

---

### 5.9 Report / Block

- **Report** modal: single-select radio list — Spam, Harassment, Misleading information, Fake
  profile, Other — Cancel / **Submit Report** (danger-outline). Submitting just toasts confirmation
  in the artifact; the real build must actually queue it for admin review.
- **Block**: triggered directly from the profile `⋯` menu, no confirmation step in the artifact
  (toast: "{Name} blocked — they can no longer message or view your profile"). **Recommend adding a
  confirmation step in the real build.**

---

### 5.10 Admin Verification Queue (demo placement only)

In the artifact this is reached via a dashed "Admin: Verification Queue" button in the **user**
sidebar footer, with a red count badge — explicitly a demo-only shortcut. The modal itself (profile
summary + Approve/Reject buttons) is the right content — **its real home is the existing Admin
console** (`pages/admin/...`), not the user-facing sidebar. Approve sets status → `verified`;
Reject leaves it at `pending` (toast: "Marked as needing more information" — real build should let
the admin attach a reason the student can see).

---

### 5.11 Notifications

Existing header bell/dropdown pattern, extended with Student-Connect-specific items:
- "{Name} sent you a connection request"
- "Your connection with {Name} was accepted"
- "Your student verification is under review" / "...has been approved"
- **Model B only:** "{Name} sent you a message"

These should ride the existing `notifications` module and Socket.IO gateway (`services/
notifications.gateway`), not a parallel system.

---

## 6. Design System — reuse, don't reinvent

Every token, color, radius, shadow and font in the artifact is pulled directly from the existing
Tamilya scss (`_colors.scss`, `_typography.scss`, `_variables.scss`) — amber/orange gradient
primary, warm-stone neutrals, Poppins headers + Inter body, 8/12/16px radii, the same card shadow
scale. **Do not introduce new design tokens for this module.** Reusable patterns worth promoting to
shared Angular components:

| Pattern | Used in | Notes |
|---|---|---|
| `avatar-ring` (solid green / dashed amber) | student card, profile header | encodes verification state at a glance without relying on a text badge alone; sizes: 54px (card), 90px (profile) |
| `badge-verified` / `badge-pending` pill | profile header, my profile | the card itself now only uses the small ring/dot, not this pill, to stay minimal |
| Stepper (numbered circle + connecting line) | registration wizard | generic enough to reuse for other future multi-step flows |
| Minimal editorial card (hairline rule, no color block, text-link CTA) | Discover grid | deliberately quieter than `.bl-card` (business) / `.uc-g-card` (community) — a stylistic choice for this module, not a new universal card standard |
| Filter panel + Advanced Filters drawer + active-filter chips | Discover | lifted directly from the Jobs/Business pages' `.jb-filter-panel` / `.jb-adv-drawer` pattern — reuse those components/styles rather than rebuilding them |
| Contact-locked / Contact-unlocked (or Chat-locked / Chat-unlocked) block | profile mentor card | the literal implementation of the privacy rule for whichever concept (§2) ships — keep it exact |
| Concept toggle pill switch | module header (comparison-only) | **artifact-only** device; do not build a real toggle for end users |

---

## 7. Frontend Data Model (TypeScript, `core/models`)

```ts
export type VerificationStatus = 'unregistered' | 'pending' | 'verified';
export type StudyLevel = "Bachelor's" | "Master's" | 'PhD' | 'Diploma';
export type MentoringType = 'free_chat' | 'paid_chat' | 'paid_call';
// Availability of 'paid_chat' / 'paid_call' depends on which concept (§2) ships —
// under Model A they should never be selectable; under Model B they're selectable
// in Phase 1 but still have no payment processing behind them until Phase 2 (§8.4).

export interface StudentProfile {
  id: string;
  userId: string;
  firstName: string;
  photoUrl?: string;
  countryId: number;
  regionId?: number;
  cityId?: number;
  cityFreeText?: string;       // fallback until full cascading picker ships
  universityId?: number;
  universityFreeText?: string; // fallback until admin-managed university list ships
  course: string;
  studyLevel: StudyLevel;
  yearOfStudy: string;
  languages: string[];
  shortIntro: string;
  previousCountryId?: number;
  academicBackground?: string;
  areasOfHelp: string[];
  mentorAvailable: boolean;
  mentoringType: MentoringType;
  consultationPrice?: number;  // Phase 2 only, Model B only
  verificationStatus: VerificationStatus;
  verificationMethod?: 'university_email' | 'student_id' | 'manual_admin';
  createdAt: string;
}

export interface ConnectionRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface Connection {
  id: string;
  userAId: string;
  userBId: string;
  connectedAt: string;
}

export interface StudentReport {
  id: string;
  reporterUserId: string;
  targetUserId: string;
  messageId?: string;   // Model B only — a report can reference a specific chat message
  reason: 'spam' | 'harassment' | 'misleading' | 'fake_profile' | 'other';
  status: 'open' | 'reviewed' | 'dismissed';
  createdAt: string;
}

// ── Model B (In-App Chat) only ──
export interface ChatThread {
  id: string;
  connectionId: string;
  participantUserIds: [string, string];
  lastMessagePreview?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  text: string;
  createdAt: string;
  readAt?: string;
}
```

---

## 8. Backend Spec

Follow the existing module pattern exactly (`router.ts` / `controller.ts` / `service.ts` /
`dto.ts`) under a new `backend/src/modules/student-connect/` module, mounted at
`/api/student-connect`. Admin-only endpoints live under the existing admin surface
(`/api/admin/student-connect/...`, matching wherever admin routes are currently namespaced).

### 8.1 Shared foundation (needed regardless of §2's outcome)

**Tables:**
- `student_profiles` — one row per user who has registered for the module. Columns per the
  `StudentProfile` model (§7), plus `user_id` FK → `users.id` (unique), `is_active`, `created_at`,
  `updated_at`. `verification_status` as an enum/check constraint (`pending|verified` — a row only
  exists once status leaves `unregistered`, so that state itself is "no row for this user").
- `master_regions` — `id`, `country_id` FK, `name`.
- `master_universities` — `id`, `country_id` FK, `region_id` FK nullable, `city` (or `city_id` if a
  `master_cities` table is added), `name`. Admin-manageable, no hard-coded seed beyond a small
  starter set, per the "no Germany-specific hard-coding" rule.
- `master_courses` — `id`, `name` (kept global/flat rather than nested under university, since the
  same course name recurs across universities).
- `student_connection_requests` — `id`, `from_user_id`, `to_user_id`, `message`, `status`
  (`pending|accepted|declined`), `created_at`, `responded_at`.
- `student_connections` — `id`, `user_a_id`, `user_b_id`, `connected_at` (created when a request is
  accepted — this is the single trigger point both models key off of: Model A unlocks contact
  fields, Model B creates a `student_chat_threads` row, at the exact same moment).
- `student_saved_profiles` — `id`, `user_id`, `saved_user_id`, `created_at`.
- `student_reports` — `id`, `reporter_user_id`, `target_user_id`, `message_id` nullable (Model B),
  `reason`, `status`, `created_at`.
- `student_blocks` — `id`, `blocker_user_id`, `blocked_user_id`, `created_at` — blocked users must
  be filtered out of the blocker's search results and unable to message/request them.

**Shared endpoints (identical regardless of §2's outcome):**

| Method & path | Purpose |
|---|---|
| `GET /api/student-connect/me` | Current user's profile + `verificationStatus`, or 404 if unregistered |
| `POST /api/student-connect/register` | Create profile → status `pending`; adds to admin queue |
| `PATCH /api/student-connect/me` | Update own profile (mentor toggle, areas of help, mentoring type, bio, etc.) |
| `GET /api/student-connect/search` | Discover — see §8.5 for the exact query contract |
| `POST /api/student-connect/connections/requests` | Body `{ toUserId, message }` → creates request, notifies recipient |
| `GET /api/student-connect/connections/requests` | Returns `{ received: [], sent: [] }` for the current user |
| `POST /api/student-connect/connections/requests/:id/accept` | Accept → creates `student_connections` row (+ chat thread under Model B), notifies both sides |
| `POST /api/student-connect/connections/requests/:id/decline` | Decline |
| `GET /api/student-connect/connections` | Accepted connections list |
| `POST /api/student-connect/saved/:userId` | Toggle save/unsave |
| `GET /api/student-connect/saved` | Saved profiles list |
| `POST /api/student-connect/reports` | Body `{ targetUserId, reason, messageId? }` |
| `POST /api/student-connect/block/:userId` | Block a user |
| `GET /api/master-data/regions?countryId=` | Cascading location picker data |
| `GET /api/master-data/universities?countryId=&regionId=` | ″ |
| `GET /api/admin/student-connect/verification-queue` | Pending profiles awaiting review |
| `POST /api/admin/student-connect/verification-queue/:userId/approve` | → `verified`, notifies user |
| `POST /api/admin/student-connect/verification-queue/:userId/reject` | Stays `pending`; body includes an admin-facing reason to relay to the user |

### 8.2 Model A — Contact Sharing (additional spec)

No additional tables. One extra endpoint behavior:

- `GET /api/student-connect/profile/:userId` — public profile view. **The service layer must strip
  `email`/`phone` from the response unless a `student_connections` row exists between the requester
  and this user** — never trust a client-side flag to hide them. This is the entire privacy
  mechanism for this model; get it wrong and contact details leak to anyone who calls the API
  directly.

### 8.3 Model B — In-App Chat (additional spec)

**Tables:**
- `student_chat_threads` — `id`, `connection_id` FK → `student_connections.id` (unique — exactly one
  thread per connection), `created_at`.
- `student_chat_messages` — `id`, `thread_id` FK, `sender_user_id` FK, `body` (text), `created_at`,
  `read_at` nullable.

**Endpoints:**

| Method & path | Purpose |
|---|---|
| `GET /api/student-connect/chat/threads` | List the current user's threads with last-message preview + unread count |
| `GET /api/student-connect/chat/threads/:id/messages?before=&limit=` | Paginated message history, newest-last |
| `POST /api/student-connect/chat/threads/:id/messages` | Body `{ text }` — send a message; server re-verifies the caller is a participant in this thread before persisting |
| `POST /api/student-connect/chat/threads/:id/read` | Mark messages read up to the latest id, for the unread badge |
| `GET /api/admin/student-connect/chat/threads/:id/messages` | Admin-only, read-only — for investigating a reported thread; every access audit-logged via the existing `services/audit` service |

**Real-time delivery:** extend the existing Socket.IO gateway (`services/notifications.gateway`)
with a `student_chat_message` event emitted to the recipient's existing per-user socket room the
moment a message is persisted — reuse that room convention rather than standing up a second
real-time channel.

**Privacy — the model's entire point:** under Model B, `GET /profile/:userId` **never** returns
`email`/`phone`, connected or not. It returns a `chatUnlocked: boolean` instead (true once a
`student_connections` row exists), which the frontend uses to render "Open Chat" vs. "Chat is
locked."

**Moderation:** a report can optionally reference a specific `message_id`; admins reviewing a report
can pull that thread's history via the admin-only endpoint above (never the general chat endpoints,
which are participant-only).

**Retention — undecided, flag for the client before shipping:** how long are messages kept after a
block/disconnect? Indefinitely (simplest, but a growing liability), or purged N days after either
side blocks/disconnects? Pick one and encode it as a scheduled cleanup job, not an afterthought.

### 8.4 Payment / Paid Mentoring (Phase 2 — Model B only, not yet in scope)

My Profile lets a mentor *select* Paid chat/Paid call once Model B is active (§5.4), but **no
payment processing exists in Phase 1 regardless of which model ships** — this section documents
what a real Phase 2 build would need, so it isn't designed from scratch blind later:

- Mentor sets a `consultationPrice` on their `student_profiles` row (already modeled in §7) — one
  price for chat, optionally a separate one for a 30-minute call.
- Payment provider integration (e.g., Stripe Connect, Standard or Express) so mentors receive
  payouts directly and Tamilya takes a platform commission on top. New tables:
  - `mentor_payout_accounts` — `user_id`, provider account id, onboarding status.
  - `student_consultation_payments` — `payer_user_id`, `mentor_user_id`, `amount`,
    `commission_amount`, provider payment-intent id, `status` (`held|released|refunded`).
- **Escrow-style hold:** funds are held until the consultation is confirmed delivered (e.g.,
  released automatically N hours after a scheduled call, or once both sides mark a chat
  consultation complete) — this protects the student from paying for a no-show and protects the
  mentor from a chargeback dispute with no delivery record.
- **Disputes:** a report filed against a paid interaction should freeze the held funds and route to
  a dedicated admin payments-dispute queue — a different surface from the general verification
  queue, since it needs different admin tooling (refund/release actions, not approve/reject).
- Treat this as its own planning pass once the client confirms Phase 2 — it's real financial
  infrastructure with compliance implications (KYC on payout accounts, tax reporting), not something
  to bolt on inside this module's existing service files.

### 8.5 Discover search — exact query contract

Matches the artifact's Advanced Filters drawer (§5.2) field-for-field:

| Query param | Type | Maps to |
|---|---|---|
| `q` | string | free-text match against name / university / course |
| `countryId` | number | `student_profiles.country_id` |
| `studyLevel` | `"Bachelor's" \| "Master's" \| "PhD" \| "Diploma"` | exact match |
| `language` | string | student speaks this language (array-contains) |
| `verifiedOnly` | boolean | `verification_status = 'verified'` |
| `mentorOnly` | boolean | `mentor_available = true` — replaces the old separate "Student Mentors" search mode entirely; there is no `mode` param |
| `freeOnly` | boolean | `mentor_available = true AND mentoring_type = 'free_chat'` |
| `page`, `limit` | number | standard pagination, matching every other module's `findAll()` convention |

### 8.6 Business rules enforced server-side (not just hidden in the UI)

- Contact fields (Model A) or message content (Model B) are only ever returned to participants who
  actually have a `student_connections` row together — enforce in the service layer.
- Blocked users are excluded from each other's `/search` results and cannot create a connection
  request targeting each other.
- Only `verified` profiles can display the Verified Student badge; `pending` always renders as
  "Verification Pending" regardless of any client state.
- Under Model A, `mentoringType` other than `free_chat` is rejected by `PATCH /me`. Under Model B it
  may be set, but no payment is ever charged until §8.4 ships — a selected paid type with no Phase-2
  payment infra behind it should behave identically to free (or be hidden from Discover's results
  entirely) rather than silently promising a paid session nothing can fulfill.
- Rate-limit connection requests and (Model B) chat messages per user to blunt spam, same
  `express-rate-limit` middleware pattern used elsewhere in the backend.

### 8.7 Notifications

Extend the existing `notifications` module + Socket.IO gateway with new event types:
`student_connection_request`, `student_connection_accepted`, `student_verification_approved`,
`student_verification_rejected`, and — Model B only — `student_chat_message`.

---

## 9. Angular Build Plan (file layout)

```
frontend/src/app/
  pages/user/student-connect/
    student-connect.component.ts/.html/.scss     → shell: tab strip + view switch (no concept toggle — that's artifact-only)
    registration/                                → 4-step wizard (§5.1)
    discover/                                     → filter panel + Advanced Filters drawer + result grid (§5.2)
    student-card/                                 → shared minimal-editorial card used by discover + saved (§5.2)
    profile-detail/                               → §5.3 (branch on whichever concept shipped — not both)
    my-profile/                                   → §5.4
    requests/                                     → §5.5
    chat/                                         → §5.6 — only build this tree if Model B is chosen
    connections/                                  → §5.7 (connections + saved can likely share one component with a mode input)
  shared/components/
    avatar-ring/                                  → the verified/pending ring wrapper (§6), reusable
    connect-modal/, report-modal/                 → §5.8 / §5.9
  core/services/
    student-connect.service.ts                    → wraps all §8.1/8.2/8.3 endpoints actually shipped
  core/models/
    (extend index.ts with §7 interfaces — omit ChatThread/ChatMessage entirely if Model A ships)
  core/guards/
    student-connect-registered.guard.ts           → redirects unregistered users to the registration screen (mirrors §4's state machine)
```

Admin side (`pages/admin/student-connect/verification-queue/`) is a **separate, real** page — not
the sidebar-button demo shortcut from §5.10. If Model B ships, admin also needs a read-only reported-
thread viewer (§8.3).

---

## 10. Explicitly Out of Scope for Phase 1

- **Which of §2's two models ships** — this must be answered before backend work starts; it is not
  a "build both and decide later" situation for the real app the way the artifact demonstrates both.
- **Paid mentoring / consultations / payment or commission infrastructure** (§8.4) — regardless of
  which concept ships, no real payment processing exists yet.
- **Document-based verification pipeline** (university email verification, student ID/enrolment
  upload) — the artifact only demonstrates the manual-admin-approval path. Decide which of the
  three verification methods from the original plan ship in Phase 1 before building the admin
  queue's data model further.
- **Full Country → Region → City → University → Course cascading picker with admin-managed data**
  — the artifact uses plain text/dropdown inputs as a stand-in. §8.1's `master_regions`/
  `master_universities` tables are the intended real implementation.
- **A real homepage teaser** — an earlier artifact pass explored one; it was removed. If the client
  still wants Student Connect promoted on the actual `/home` dashboard, that's a fresh, small design
  task, not a resurrection of the removed banner.

## 11. Known Artifact Simplifications to Resolve During Build

- No confirmation dialog before Block (§5.9) — recommend adding one.
- No real profile photo upload — placeholder icon only.
- "Demo: mentor accepts" button on the Sent requests tab is a stand-in for real-time server state
  and must not appear in production.
- Admin verification queue is reached from the user sidebar in the artifact purely for demo
  convenience — belongs in the Admin console.
- The concept toggle (§2) is a comparison tool for this artifact only — the shipped app implements
  exactly one model with no user-facing switch.
- Sample data (Arun/Munich, Priya/Coventry, Nila/Dublin, Karthik/Toronto) is illustrative only.
