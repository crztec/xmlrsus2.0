# Palette's UX Journal

## 2026-03-23 - Missing Input Links in React State Forms
**Learning:** Found a specific pattern in this React application where Controlled Inputs (like `rsusUrl`, `rsusUser`) had labels, but they weren't programmatically linked via `htmlFor` and `id`. Also, icon buttons relying on hover states to appear were missing `aria-label`s.
**Action:** When reviewing React forms with state-bound inputs, ensuring `htmlFor` and `id` matching is fully implemented, even if visual grouping using utility classes exists. Also, always add semantic `aria-label`s to dynamically visible icon-only buttons.
