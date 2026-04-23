# Palette's UX Journal

## 2026-03-23 - Missing Input Links in React State Forms
**Learning:** Found a specific pattern in this React application where Controlled Inputs (like `rsusUrl`, `rsusUser`) had labels, but they weren't programmatically linked via `htmlFor` and `id`. Also, icon buttons relying on hover states to appear were missing `aria-label`s.
**Action:** When reviewing React forms with state-bound inputs, ensuring `htmlFor` and `id` matching is fully implemented, even if visual grouping using utility classes exists. Also, always add semantic `aria-label`s to dynamically visible icon-only buttons.

## 2026-04-23 - Accessibility of Dropdown Triggers
**Learning:** Found a pattern where dropdown menus (like the 'More Options' row actions and history dropdowns) use icon-only buttons without `aria-label`, `aria-expanded`, or `aria-haspopup`. Furthermore, they lack visible keyboard focus indicators.
**Action:** When adding dropdown menus or icon-only buttons, always ensure they have an `aria-label`, correctly track state with `aria-expanded`, declare `aria-haspopup="menu"`, and include `outline-none focus-visible:ring-2` to support keyboard navigation.
