# Design System — Insurance Renewal & Engagement SaaS

---

## 1. Visual Direction

**Professional Insurance SaaS** — trustworthy, precise, data-capable.

Not a generic white-label SaaS. The design communicates reliability for insurance
company buyers while giving the WhatsApp communication features a distinct visual
identity.

Inspiration is drawn from three systems, translated into our own tokens and
components — never copied or installed:

| System | What We Learn From | What We Do Not Copy |
|--------|--------------------|--------------------|
| **Carbon (IBM)** | Enterprise table patterns, data hierarchy, compact layouts for data-heavy pages | Carbon's color tokens, React components, grid system, or CSS |
| **Polaris (Shopify)** | Empty state guidance, form clarity, page structure patterns, admin flow usability | Polaris's React library, CSS-in-JS, or Shopify-specific components |
| **Stripe** | Visual polish, generous whitespace, subtle card refinement, premium SaaS feel | Stripe's color palette, typography, or JavaScript SDK |

**Implementation foundation:** Tailwind CSS v4 + existing shadcn/ui components.
All design tokens are expressed as CSS custom properties in `globals.css`.
No external design system package is installed.

---

## 2. Color Palette

### Primary — Navy Blue

The primary color conveys trust and stability, consistent with insurance industry
expectations.

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--primary` | `oklch(0.28 0.04 260)` | `oklch(0.65 0.06 260)` | Primary buttons, sidebar active state, links |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | Text on primary backgrounds |

### Communication Accent — Warm Amber

Reserved exclusively for Broadcast and Messages features. This is the visual
signature that sets the WhatsApp communication workflow apart from admin functions.

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--accent-communication` | `oklch(0.70 0.14 70)` | `oklch(0.75 0.12 70)` | Broadcast send button, sidebar megaphone icon (active) |
| `--accent-communication-foreground` | `oklch(0.15 0 0)` | `oklch(0.985 0 0)` | Text on amber backgrounds |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--destructive` | `oklch(0.577 0.245 27.325)` | Error banners, deactivate, revoke, delete |
| Success (inline) | `bg-green-100 text-green-700` | Success banners, status badges |
| Warning (inline) | `bg-amber-50 text-amber-800` | Permission denied banners, alerts |
| Info (inline) | `bg-blue-50 text-blue-800` | Informational banners |

### Neutral Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(1 0 0)` | Page background (white) |
| `--foreground` | `oklch(0.145 0 0)` | Primary text (near-black) |
| `--muted-foreground` | `oklch(0.556 0 0)` | Secondary text, labels |
| `--border` | `oklch(0.922 0 0)` | Card and table borders |
| `--card` | `oklch(1 0 0)` | Card background (white) |
| `--muted` | `oklch(0.97 0 0)` | Table header, subtle backgrounds |

All neutral values use zero chroma (`0 0`) — pure grayscale. No chromatic
saturation in the neutral palette.

---

## 3. Typography

### Current Stack

| Role | Face | Source |
|------|------|--------|
| Body | Geist Sans | `next/font/google` via `Geist()` |
| Mono | Geist Mono | `next/font/google` via `Geist_Mono()` |
| Heading | Same as body (no distinction) | *(placeholder)* |

### Target Stack

| Role | Face | Usage |
|------|------|-------|
| Body | Geist Sans (keep) | All body text, labels, table cells, form inputs |
| Heading | Serif or semi-serif (add) | Page-level `<h1>` titles only — never card headings or table headers |
| Mono | Geist Mono (keep) | Code, message previews, data values |

### Scale

| Level | Class | Usage |
|-------|-------|-------|
| Page title | `text-2xl font-bold font-heading` | `<h1>` at top of every page |
| Section heading | `text-lg font-semibold` | Card titles, section dividers |
| Body | `text-sm` | Most content, table cells, form labels |
| Caption | `text-xs` | Metadata, timestamps, helper text |
| Mono | `text-sm font-mono` | Message bodies, policy numbers, mobile numbers |

### Rule

- The heading font is used only for page-level titles. It is "the one bold choice."
- Card headings, table headers, and sidebar navigation remain Geist Sans.
- The heading font is added via `next/font/google` (no package installs).

---

## 4. Spacing Rules

All pages and components follow a consistent spacing system.

| Context | Value | Notes |
|---------|-------|-------|
| Page padding (all pages) | `p-8` | Unified — currently some pages use `p-6` |
| Content card padding | `p-5` | Standardized for all content-bearing cards |
| Stat card padding | `p-4` | Kept compact for metric display |
| Section gap | `space-y-6` / `gap-6` | Between major page sections |
| Form group gap | `space-y-4` | Between form fields in a section |
| Table cell padding | `px-4 py-3` | Consistent header and body cells |
| Table cell compact | `px-4 py-2` | Optional for dense data views (future) |
| Inline element gap | `gap-2` | Between adjacent buttons, badge pairs |
| Sidebar item padding | `px-3 py-2` | Navigation items |

---

## 5. Card Style

| Property | Value |
|----------|-------|
| Border radius | `rounded-lg` (10px, via `--radius` token) |
| Border | `border` (1px solid `--border`) |
| Background | `bg-card` (white, via `--card` token) |
| Text | `text-card-foreground` |
| Shadow (content cards) | `shadow-sm` — subtle elevation for distinction |
| Shadow (stat cards) | None — keep flat to differentiate from content |

### Card Types

- **Content card:** `rounded-lg border bg-card p-5 shadow-sm text-card-foreground`
- **Stat card:** `rounded-lg border bg-card p-4 text-card-foreground`
- **Table wrapper:** `overflow-x-auto rounded-lg border` (inherits card styling)
- **Form card:** `rounded-lg border bg-card p-5 shadow-sm`

---

## 6. Button Rules

All buttons use the existing shadcn `Button` component (`src/components/ui/button.tsx`).

| Variant | Shadcn Variant | When to Use |
|---------|---------------|-------------|
| Primary | `<Button>` (default) | Main page actions: save, invite, upload, create |
| Outline | `<Button variant="outline">` | Secondary actions: cancel, reset, load template |
| Destructive | `<Button variant="destructive">` | Delete, deactivate, revoke |
| Ghost | `<Button variant="ghost">` | Inline table actions, navigation links |
| Communication | `<Button className="bg-[--accent-communication] text-[--accent-communication-foreground] hover:opacity-90">` | Broadcast send, messages confirm — amber accent |

### Size Mapping

| Size | Height | Usage |
|------|--------|-------|
| `sm` | 28px | Table row actions, inline controls |
| `default` | 32px | Standard buttons (most common) |
| `lg` | 36px | Primary action on focused flows (upload, invite) |

### Rule

Replace all raw `<button>` elements with the Shadcn Button component.
The existing Shadcn Button is already present in the project — use it directly.

---

## 7. Table Style

### Structure

```
overflow-x-auto rounded-lg border
  └─ table w-full text-sm
       ├─ thead: bg-muted
       │    └─ th: px-4 py-3 text-left font-medium text-muted-foreground
       └─ tbody: divide-y
            └─ tr: border-b last:border-b-0 hover:bg-muted/50
                 └─ td: px-4 py-3
```

### Rules

- Headers use `bg-muted` (light gray) with `text-muted-foreground`
- Body rows use `hover:bg-muted/50` for row highlight
- No alternating row stripes (keeps tables clean)
- Cells use consistent `px-4 py-3` padding
- Sortable headers (future): add click handler + sort indicator icon
- Selection columns (future): persist checkbox column on scroll

### Data Type Alignment

| Data Type | Alignment | Style |
|-----------|-----------|-------|
| Text (names, labels) | Left | `font-medium` for primary identifier |
| Numeric (counts, IDs) | Right or mono | `font-mono text-xs` for codes |
| Status | Center | Badge/pill |
| Actions | Right | Ghost buttons or text links |

---

## 8. Form Style

### Input Controls

| Element | Classes | Notes |
|---------|---------|-------|
| Text input | `w-full rounded-md border border-input bg-background px-3 py-2 text-sm` | Standard |
| Textarea | Same, plus `min-h-[80px] font-mono` | For message bodies |
| Select | Same as text input | Use native `<select>` or shadcn Select |
| Checkbox | `h-4 w-4` | Round corners via default browser style |
| Focus state | `ring-[--ring] ring-1` | Applied by `outline-ring/50` global rule |

### Layout

- Labels: `mb-1 block text-sm font-medium text-foreground`
- Helper text: `mt-1 text-xs text-muted-foreground`
- Error text: `mt-1 text-xs text-destructive`
- Form sections: `space-y-4`
- Horizontal layout (desktop): `flex flex-col gap-3 sm:flex-row sm:items-end`

---

## 9. Alert & Empty State Style

### Alerts

| Type | Classes | Icon |
|------|---------|------|
| Error | `rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive` | AlertTriangle |
| Success | `rounded-md bg-green-50 px-4 py-3 text-sm text-green-800` | CheckCircle |
| Warning | `rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800` | AlertCircle |
| Info | `rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800` | Info |

All alerts have:
- A small dismiss button (`×`) on the right
- No border (background only — distinct from cards)
- Responsive width (full width of parent container)

### Empty States

```
flex flex-col items-center justify-center py-16
  └─ lucide icon: h-12 w-12 text-muted-foreground/30
  └─ h3: mt-4 text-lg font-semibold
  └─ p: mt-1 text-sm text-muted-foreground text-center max-w-sm
  └─ optional action: mt-6 <Button>
```

Rules:
- Centered layout, never left-aligned
- Single recommended action if applicable
- No dashed borders (current messages page uses `border-dashed` — replace with this pattern)
- Descriptive text explains what to do next, not just what is missing

---

## 10. Sidebar & Navigation Style

### Structure

- Width: `w-56` (224px)
- Background: `bg-sidebar` (light gray, `--sidebar` token)
- Border right: `border-r border-sidebar-border`

### Navigation Items

| State | Classes |
|-------|---------|
| Default | `flex items-center gap-2 px-3 py-2 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground` |
| Active | `bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary font-semibold` |
| Active icon | Color matches `--sidebar-primary` (navy) |

### Communication Accent

When the Broadcast or Messages nav item is active, the icon uses
`--accent-communication` color instead of the default navy. This is the only
place the amber accent appears in the sidebar.

### Mobile Overlay

- Hidden off-screen by default, slides in with `translate-x-0`
- Backdrop: `fixed inset-0 z-30 bg-black/40`
- Close: `X` icon button or Escape key
- Breakpoint: visible at `md:` (768px+)

---

## 11. Dashboard & Stat Card Style

### Stat Cards

4-column grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`

```
rounded-lg border bg-card p-4
  └─ p: text-sm text-muted-foreground         (label)
  └─ p: mt-1 text-2xl font-bold               (value)
```

- Values use larger `text-2xl` for impact (up from current `text-lg`)
- No shadow — stat cards stay flat to differentiate from content cards

### Detail Cards

2-column grid: `mt-8 grid gap-6 lg:grid-cols-2`

```
rounded-lg border bg-card p-5 shadow-sm
  └─ h3: text-sm font-semibold text-muted-foreground uppercase tracking-wider  (section header)
  └─ list items: flex items-center justify-between text-sm
  └─ "View all": text-xs font-medium text-[--primary] hover:underline
```

- Content cards get `shadow-sm` for subtle depth
- Section headers use uppercase tracking for scannability

### Quick Actions

- Primary: Shadcn `<Button>` default (navy)
- Secondary: Shadcn `<Button variant="outline">`

---

## 12. Communication Accent Usage Rules

The `--accent-communication` (warm amber) is a restricted token.
It appears in exactly these locations and no others:

| Location | Element | Usage |
|----------|---------|-------|
| Sidebar | Broadcast nav icon (active) | Replace default with amber |
| Sidebar | Messages nav icon (active) | Replace default with amber |
| Broadcast page | Send button | `<Button className="bg-[--accent-communication] ...">` |
| Broadcast page | Result success banner header | Amber background |
| Broadcast page | "Using saved template" indicator | Amber text (replaces green) |
| Messages page | Preview + Confirm buttons | Amber background |
| Messages page | Sent/delivered status badges | Amber tint (optional) |

**Do not use the amber accent for:**
- Non-communication features (templates, settings, staff, customers, upload)
- Destructive actions (use red)
- Success states (use green)
- Page titles or body text
- Sidebar items other than Broadcast and Messages
- General-purpose banners or notifications

---

## 13. Inspiration Attribution

### Carbon Design System (IBM)

**What we take:**
- Enterprise table patterns: sticky headers, scannable rows, compact data cells
- Data hierarchy principles: most important information left-aligned and bold
- Clear separation between data display and data actions

**What we do not copy:**
- Carbon's React component library
- Carbon's color tokens (blue 60, gray 90, etc.)
- Carbon's grid system or layout primitives

### Polaris (Shopify)

**What we take:**
- Empty state patterns with clear call-to-action
- Form layout clarity: labels above inputs, grouped sections, helper text
- Page structure: title, description, then content

**What we do not copy:**
- Polaris's React component library
- Polaris's CSS-in-JS approach
- Shopify-specific patterns (navigation, resource lists)

### Stripe

**What we take:**
- Refined card presentation with subtle shadow
- Generous whitespace between sections
- Minimal visual noise — each element does exactly one job

**What we do not copy:**
- Stripe's specific color palette
- Stripe's typography system
- Stripe's JavaScript SDK or API patterns

---

## 14. Implementation Phases

| Phase | Scope | Components Changed | Status |
|-------|-------|-------------------|--------|
| **D1** | Update CSS tokens | `globals.css` only — set `--primary` to navy, add `--accent-communication` | ✅ Completed |
| **D2** | Typography | `layout.tsx` — add heading font via `next/font/google`; `globals.css` — update `--font-heading`; page titles — add `font-heading` class | Pending |
| **D3** | Unify buttons | All page files — replace raw `<button>` with shadcn `<Button>` component | ✅ Completed (7 commits) |
| **D4** | Consistent spacing | All page files — unify padding to `p-8`; replace hardcoded `text-gray-500` with `text-muted-foreground` | ✅ Completed (partial — main pages done, some edge pages remain) |
| **D5** | Sidebar refresh | `dashboard-sidebar.tsx` — implement amber accent on broadcast/messages active icon | Pending |
| **D6** | Empty state component | Create reusable `EmptyState` component; replace inline empty state JSX in all pages | Pending |
| **D7** | Communication accent | `broadcast/page.tsx`, `messages/page.tsx` — apply amber accent to send/confirm buttons and badges | Pending |
| **D8** | Card elevation | All page files — add `shadow-sm` to content cards | ✅ Completed |
| **D9** | Modal consolidation / Alert & Dialog tokens | Create reusable `ConfirmDialog`; replace inline modals in broadcast, permission grants, messages | 🔶 Partial — alert/dialog token polish completed; full modal consolidation still pending |
