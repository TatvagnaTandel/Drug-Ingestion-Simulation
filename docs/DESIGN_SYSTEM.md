# Theatre design system

**Direction.** An editorial anatomy atlas. The body takes the largest surface. Navy grounds the instrument, peach marks actions and the narrated dose, and blue identifies circulation. Use Instrument Serif for headings, Geist for instructions, and Plex Mono for values and metadata. Labels start at 12 px.

The shared stylesheet is `apps/web/app/theatre-system.css`. Existing navy surface and ink tokens are paired with a peach action, two neutral surfaces, a focus ring, a 4/8/12/16/24/32 px spacing scale, field/card/pill radii, a floating shadow, and 160/240 ms interface transitions. Motion follows the system preference. Camera motion has its own stage presets.

| Pattern | Contract |
| --- | --- |
| Button | `theatre-button` secondary, with `theatre-primary`, `theatre-ghost` or `theatre-icon` modifiers. Use native button/link semantics, label icon controls, expose busy and pressed state. |
| Field, Select, Slider | Use native controls with names and associated descriptions; `theatre-field`, `theatre-select`, `theatre-slider` supply appearance. |
| Card, Chip, Stat | `theatre-card`, `theatre-chip`, `theatre-stat`. Use a description list for grouped numbers and state separately from color. |
| Tooltip | `theatre-tooltip`, associated with the trigger. Show on focus and delayed hover. |
| Disclosure | Native details with a styled summary and explicit chevron (`theatre-disclosure`). |
| EmptyState | `theatre-empty` with one next action and a sentence about the area. |
| Toast | `theatre-toast` inside a status region for short feedback. Errors remain beside their controls. |
