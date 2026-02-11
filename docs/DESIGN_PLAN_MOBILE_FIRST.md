# Sentinel Dashboard Persona Redesign – Build Plan (Mobile-First)

**Design target: mobile.** All layout, touch targets, and spacing are optimized for phone/small-screen use in a school office. The reference (Skillway-style) dark Bento aesthetic is applied with a mobile-first layout.

---

## 1. Persona adaptation (unchanged)

- **Visual anchors:** Lavender only for the single hero KPI, primary CTAs, and active states.
- **Spatial awareness:** Bento card modules, generous padding, `rounded-2xl`.
- **Micro-interactions:** CSS transitions and Tailwind hover/focus (no Framer Motion; vanilla stack).
- **Accessibility:** High contrast on dark, visible focus, semantic structure, touch targets ≥ 44px.

---

## 2. Mobile-first layout

**Primary viewport:** Small screens (e.g. 320px–430px width). No desktop-first assumptions.

- **Single column by default:** All Bento sections stack vertically. No side-by-side grids on mobile.
- **KPI row:** 2×2 grid only (`grid-cols-2`), so four stats fit in a compact block without horizontal scroll. One card (e.g. Total or Overdue) gets the lavender “hero” treatment.
- **Content sections:** Stack in order: Active Loans → Create loan → Add Asset → Assets & QR. Each is a full-width Bento card with `rounded-2xl` and generous internal padding (`p-5`).
- **Sticky footer:** “Process Returns” stays fixed at bottom with safe-area padding (already present). Full-width, lavender CTA, min-height 44px.
- **Header:** Compact top bar (Sentinel / Admin title, no dense nav). Sticky so KPIs and content scroll beneath it.
- **No multi-column Bento on mobile:** Avoid “Active Loans | Create loan” side-by-side on small screens; that would only apply if we add a later breakpoint for tablet/desktop.

**Responsive note:** If we add a larger breakpoint later (e.g. `md:` or `lg:`), we can introduce 2-column Bento or 4-column KPIs. Base implementation is mobile-only.

---

## 3. Design system (tokens) – same, with mobile emphasis

- **Background:** Dark charcoal (`#1a1a1c` or `gray-950`).
- **Surface/cards:** `#252528` / `gray-900`, optional `border-gray-800`.
- **Primary (lavender):** Single shade for anchors/CTAs (e.g. `#a78bfa`), white text on buttons.
- **Text:** `text-white` / `text-gray-100`, secondary `text-gray-400`.
- **Corners:** `rounded-2xl` for cards and main buttons.
- **Spacing:** Card padding `p-5` (or `p-4` if very tight); vertical gap between sections `gap-4`; avoid horizontal padding that causes overflow (use `px-4` or similar with care).
- **Viewport:** No fixed min-width; ensure no horizontal scroll on 320px. Use `min-w-0` and `overflow-hidden` where needed for long text (e.g. asset IDs, emails).

---

## 4. Touch and readability on mobile

- **Touch targets:** All buttons, checkboxes, and tappable list rows ≥ 44px height (already in current spec; keep and verify).
- **Tap spacing:** Enough gap between adjacent tappable elements (e.g. checkboxes and Delete in loan rows) to avoid mis-taps.
- **Font size:** Keep base 16px (or equivalent) to reduce zoom on focus in iOS; avoid small body text.
- **Fixed footer:** Account for `env(safe-area-inset-bottom)` and any notches; main content has `padding-bottom` so the last card isn’t hidden behind the Process Returns bar.

---

## 5. Bento grid structure (mobile)

```
[ Header: Sentinel – Admin (sticky) ]
[ KPI 1 (lavender) ] [ KPI 2 ]
[ KPI 3 ]            [ KPI 4 ]
[ Active Loans card – full width ]
[ Create loan card – full width ]
[ Add Asset card – full width ]
[ Assets & QR card – full width ]
[ Sticky footer: Process Returns (lavender) ]
```

All sections keep existing IDs and form structure so `admin.js` works unchanged.

---

## 6. Login page (mobile)

- Same design system; single centered card, full-width on mobile with horizontal margin (e.g. `mx-4`).
- Lavender “Sign In” button; inputs and card sized for touch.
- No multi-column layout.

---

## 7. Implementation order and risk mitigation

Same as before, with mobile checks:

| Step | Task | Mobile-specific mitigation |
|------|------|----------------------------|
| 1 | Tailwind theme (dark + lavender) | Test on narrow viewport (DevTools or real device). |
| 2 | index.html: dark shell, single-column Bento, 2×2 KPIs | Verify no horizontal scroll at 320px; confirm all IDs intact for admin.js. |
| 3 | Visual anchors (one lavender KPI, lavender CTAs) | Ensure buttons remain 44px+ and readable. |
| 4 | Transitions/hover (and tap feedback) | Prefer `active:` states for touch feedback. |
| 5 | login.html to match | Test on mobile viewport. |
| 6 | Optional: label.html | No change required for mobile. |

**Testing:** Use Chrome DevTools device emulation (e.g. iPhone SE 375px) or a real phone; run full flow: login → stats → create loan → add asset → process return → assets/QR.

---

## 8. Files to touch

- **public/admin/index.html** – Mobile-first Bento layout (single column, 2×2 KPIs), dark theme, preserved IDs.
- **public/admin/login.html** – Dark theme + lavender CTA, mobile-friendly card.
- **public/admin/admin.js** – No structural changes; only optional class/data-attribute for hero KPI if styled via CSS.

---

## 9. Summary

- **Persona:** Unchanged (lavender anchors, Bento, generous padding, rounded-2xl, CSS micro-interactions, accessibility).
- **Primary target:** **Mobile** – single-column layout, 2×2 KPIs, full-width cards, sticky footer, 44px+ touch targets, no horizontal overflow.
- **Reference style:** Skillway-like dark mode and lavender applied in a mobile-appropriate structure rather than a wide desktop Bento grid.
