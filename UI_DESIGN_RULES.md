# HandyFix Universal UI Design Rules

These rules apply to the Customer, Provider, and Admin apps. The apps are
separate Vite projects, so shared design tokens and interaction patterns are
kept in each app's `src/index.css` and UI components; update all three together.

## Brand and visual system

- Before making any UI change, review this rulebook and the related
  `HEADER_FOOTER_RULES.md`; follow them for every screen, including when a
  request does not repeat the design requirements.
- Use `/logo.png` from each app's public directory as the single canonical
  HandyFix brand mark in every header and footer. Render it with `object-contain`
  at its intended aspect ratio; do not substitute a different bundled logo or
  stretch/crop it.
- Use **Plus Jakarta Sans** for all app surfaces.
- Load the web font asynchronously so initial rendering and login forms remain
  responsive while the font downloads; retain a system sans-serif fallback.
- Lazy-load route-specific pages and avoid timed splash overlays so login and
  app content are not held back by branding animations.
- Use the shared warm, light palette:
  - Page background: `hsl(38 44% 96%)`
  - Main text: `hsl(0 0% 11%)`
  - Primary HandyFix orange: `hsl(22 61% 47%)`
  - Secondary surface: `hsl(40 32% 91%)`
  - Muted text: `hsl(41 10% 33%)`
  - Accent surface: `hsl(25 78% 93%)`
  - Success: `hsl(142 71% 45%)`
  - Warning: `hsl(38 92% 50%)`
  - Destructive: `hsl(0 72% 51%)`
- Define those colors through the semantic CSS custom properties (`--primary`,
  `--background`, `--success`, and similar), not one-off hex colors.
- Use semantic card surfaces, subtle borders, and the shared `0.75rem` radius.
  In light mode cards are white; in dark mode use the defined dark card surface.
  Keep the existing glass-card treatment for elevated dashboard surfaces.
- Use the same primary gradient for prominent actions and highlights; use
  success, warning, and destructive colors only for their status meanings.
- Support both light and dark themes consistently in all three apps. Keep the
  light palette above as the default and use these shared dark-mode tokens:
  - Page background: `hsl(222 22% 10%)`
  - Main text: `hsl(210 20% 94%)`
  - Card and popover: `hsl(222 19% 14%)`
  - Primary HandyFix orange: `hsl(24 68% 55%)`
  - Secondary surface: `hsl(220 17% 21%)`
  - Muted text: `hsl(215 13% 70%)`
  - Accent surface: `hsl(24 28% 23%)`
  - Success: `hsl(142 55% 42%)`
  - Warning: `hsl(38 88% 54%)`
  - Destructive: `hsl(0 62% 55%)`
  - Borders and inputs: `hsl(217 15% 27%)`
- Apply theme colors through semantic tokens so backgrounds, text, forms,
  dialogs, navigation, tables, and status elements remain readable in both
  modes. Avoid hard-coded light-only surfaces or dark-only text colors.
- Provide an accessible Light/Dark toggle in each panel header. Label it with
  the action it will perform, preserve visible keyboard focus, and keep the
  chosen mode across route changes and page reloads. Do not animate a
  full-screen transition when changing themes.
- Use **14px (Tailwind `text-sm`)** as the smallest standard UI text for
  controls, table data, and labels. Supporting metadata may use **12px**
  (`text-xs`); do not use smaller text for content users must read.
- Keep table cells and form controls at the standard 14px size, with metadata
  and compact badges no smaller than 12px. Avoid reducing text to fit; prefer
  wrapping, truncation with an accessible full value, or responsive layout.

## Universal header and footer

- Every panel has a branded header with a consistent **64px minimum height**,
  40px HandyFix mark, subtle bottom border, and translucent background.
- Use the same HandyFix logo asset across Customer, Provider, and Admin headers.
- Keep panel-specific navigation and actions in the header; preserve
  the same spacing, typography, icon scale, active-state treatment, and mobile
  behavior across all panels. Center the navigation tabs when they fit;
  Provider and Admin retain horizontal scrolling on narrow screens.
- Keep Notifications and Profile as header actions rather than primary
  navigation tabs, following the Customer reference. Keep both actions
  available at desktop and mobile widths; do not duplicate them in the mobile
  navigation menu when they are already in the header.
- Use an icon button for Notifications with an accessible name and a badge
  only when the fetched unread-notification count is greater than zero. Cap
  visual badge text at `9+`, but include the exact count in the accessible
  label.
- The Customer desktop Profile control is an avatar plus the user's full
  display name (profile name, then email-derived name, then "My Account").
  Keep this text control; do not replace it with an icon-only button or hide
  the name unless the user explicitly requests that change. At mobile widths,
  the Customer may use a compact, accessible Profile icon button.
- The Provider Profile action remains a compact, accessible icon button,
  matching the Customer's compact mobile treatment.
- On the Notifications or Profile route, style the corresponding action and
  its icon with the semantic primary color and active border. Icons must
  inherit the action button's foreground color; do not apply a fixed muted
  color to an icon inside a button whose route is active. Inactive icons use
  muted foreground, and hover/focus styles must remain visible in both themes.
- Use `aria-current="page"` for the active destination and an accessible
  action label for every icon-only button. Preserve visible keyboard focus.
- Keep a footer after panel content with the same HandyFix copyright and
  India brand signature. The Customer app may additionally show its service,
  company, and legal links.

## Layout and interaction

- Use responsive layouts, readable contrast, visible keyboard focus, and
  accessible labels for icon-only controls.
- Build mobile-first with fluid widths and responsive spacing. Keep flex and
  grid content shrinkable, wrap controls when needed, and use horizontal
  scrolling only for intentionally scrollable tab or table regions. Prevent
  page-level horizontal overflow; never shrink text below the established
  readable sizes to force content to fit.
- Use responsive container padding and dynamic viewport-height units for
  full-height panel shells so layouts fit browser chrome on mobile devices.
- Keep all three Tailwind container breakpoints in sync. Main content must
  expand to the available width on very wide screens, matching Provider/Admin;
  keep the Customer header and footer centered at the shared 1920px maximum.
  Use fluid card grids with bounded card widths, and keep forms or long-form
  reading areas at narrower centered widths when that improves readability.
- Let browser zoom remain native and accessible; do not override it with CSS
  `zoom`, viewport scale restrictions, or whole-page transforms. Make wide
  layouts use the available centered container and responsive grids instead
  of fixed-width page sections.
- On spacious desktop screens, let sparse panel content expand and keep the
  footer at the bottom of the viewport. On small screens, preserve natural
  content height and readable spacing rather than compressing the page.
- Show operational records and metrics only when they have been fetched from
  the database. Do not substitute fabricated examples, inferred statuses, or
  guessed names/prices/counts when a query returns no data or an error.
- Keep the main content aligned with the panel shell and use consistent
  spacing, cards, form controls, buttons, and status badges.
- Center page heroes, form sections, and content columns when their content
  would otherwise appear narrow or crowded to one side. Use a centered,
  responsive max-width wrapper, balanced spacing, and readable text measure;
  do not center-align content that is clearer left-aligned (such as form field
  labels and input values).
- Make forms feel consistent and professional: use semantic card/background
  tokens, clearly associated labels, consistent field heights and spacing,
  rounded borders, and visible keyboard focus. Inputs, selects, and textareas
  must use readable foreground and placeholder colors in both themes; do not
  use hard-coded status colors for ordinary controls.
- For Customer service/home data, share React Query caches between routes,
  select only the fields needed, parallelize independent reads, and bound
  foreground database reads to 2.5 seconds. Do not automatically retry a
  failed foreground query; show a clear error and a user-controlled retry so
  an unreachable backend cannot leave a loading state indefinitely. Database
  latency still depends on network and Supabase availability.
- Customer route changes start at the top of the page. Do not restore the old
  scroll position when a customer visits another header link.
- Toasts across all three apps dismiss automatically after **4 seconds**.
- A booking-tab badge represents unseen activity, not the total number of
  historical records. Selecting the corresponding tab marks its current items
  as seen.
- Provider online status persists across page reloads. Explicitly switching
  offline or signing out ends the online state.
- Profile completion is computed from the same required profile fields shown
  in the Provider profile editor and updates as those fields change.

## Change checklist

When changing the global UI system:

1. Update the related styles/components in `customer-app`, `provider-app`, and
   `admin-app`.
2. Preserve role-specific workflows while sharing visual treatment.
3. Verify mobile and desktop layouts, route transitions, toast dismissal, and
   keyboard-accessible interactions.
4. Run the relevant app build, type-check, and tests.
