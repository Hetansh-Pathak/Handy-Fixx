# HandyFix Header and Footer Rules

These layout rules apply to the Customer, Provider, and Admin panels. The
Customer header and footer are the visual reference and should not be modified
unless the user explicitly requests a Customer-panel change.

## Header

- Use the same HandyFix public logo asset (`/logo.png`) in all three headers
  and footers. Do not substitute a separate source asset for the footer mark.
- Render the brand mark with `object-contain` so its proportions match between
  header and footer; use the same 40px size when the footer layout permits.
- Align the brand mark and name to the shared centered `container mx-auto`
  content width, which expands up to 1920px on very wide screens. Use a 40px
  logo, a 20px bold brand name, and a 64px minimum header-row height.
- Use a translucent semantic background, backdrop blur, and a subtle semantic
  bottom border. Keep theme-dependent colors on semantic tokens.
- On wide screens, keep the logo at the left, navigation centered in the
  header row, and role-specific actions at the right. Use the same 14px text
  scale and readable active/inactive treatments as the Customer navigation.
- At widths where navigation and actions cannot fit without crowding, show an
  accessible hamburger control beside the header actions. Expand the panel's
  navigation below the brand/actions row as a full-width list, close it after
  navigation, and keep the active page and badges visible. Return to centered
  inline navigation when the full set of links fits comfortably.
- Keep navigation labels and active states consistent with the current panel.
  Badges may be added only for fetched, relevant activity.
- Keep dedicated account destinations such as Notifications and Profile out
  of the primary navigation when they are compact header actions in the
  Customer reference. Use accessible, focus-visible icon buttons for those
  destinations, show only fetched unread-count badges, and provide an active
  route treatment.
- Header action icons must inherit their button's foreground color so active
  route styling is visible on the icon as well as the button. Do not put a
  fixed muted-text color on an icon inside an active-color button.
- Apply the same Notifications and Profile header actions on desktop and
  mobile. Show fetched unread counts on Notifications, use active-route
  styling on the icon/profile control, and avoid duplicating those destinations
  in the mobile menu when they are already available in the header.
- Keep role-specific controls, such as Provider online status, and account
  actions in the action area without shifting the brand alignment.
- Keep the Light/Dark theme control in the header on every panel and preserve
  keyboard focus visibility and accessible labels.

## Footer

- Place the footer after the main panel content, not overlaid on it.
- In Provider, use the expanded footer with provider workspace links, account
  links, and provider support details; do not show the Customer services list.
- In sparse Admin/Provider views on a tall desktop viewport, let the main
  content area grow and keep the footer at the viewport bottom. On mobile,
  preserve normal readable flow and allow the footer to follow the content.
- Use a subtle semantic top border, centered muted text, consistent spacing,
  and the HandyFix copyright and India brand signature.
- The Customer footer may include its existing service, company, and legal
  links. Provider and Admin may use the compact brand-signature footer.
- Match footer typography and color tokens across panels; do not use
  hard-coded theme-specific colors.

## Change validation

- Keep role-specific navigation and actions functional at desktop and mobile
  widths.
- Verify header alignment at wide desktop, tablet, and mobile viewport sizes.
- Do not change Customer header/footer implementation when adjusting Provider
  or Admin alignment.
