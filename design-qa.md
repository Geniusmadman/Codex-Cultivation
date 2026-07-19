**Comparison Target**

- Source visual truth: `macos/docs/qa/source-home-reference.png`
- Final implementation: `macos/docs/qa/implementation-home-final.png`
- Full-view comparison: `macos/docs/qa/full-comparison.png`
- Focused card comparison: `macos/docs/qa/cards-comparison.png`
- Viewport: 1672 x 941, dark theme, home route, female Qi-stage companion, populated local cultivation data.
- Wide-screen verification: 2184 x 1256, four cards remain 196 x 372 with no document overflow.
- Realm-flow evidence: `macos/docs/qa/realm-flow-head-tail.png`, captured from the isolated live Codex renderer after the Canvas rewrite.

**Findings**

- No actionable P0, P1, or P2 findings remain for the requested card, companion, settings, and side-rail surfaces.
- Fonts and typography: the serif display hierarchy and compact data typography are coherent and readable. The hero title is intentionally smaller than the Windows reference to preserve the macOS shell's denser header rhythm.
- Spacing and layout: the card group is centered and capped at a stable portrait width. Frames now span the full card height without becoming horizontally distorted on wide displays. Rails, composer, and persistent controls remain visible with no horizontal or vertical overflow.
- Colors and visual tokens: jade, blue, violet, and gold card accents remain distinct against the dark scene. Rail charts, progress states, and card copy retain sufficient contrast.
- Image quality and assets: all four artifact images use true circular clipping with a narrow feathered edge. The portrait frames fill the complete card. The hero sigil now has a real alpha channel and no dark rectangular backdrop. Companion portraits stay consistent across gender and realm variants.
- Realm resources: all five realms now have separate dark and light wide backgrounds. Automated metadata checks require all ten backgrounds, ten companion portraits, four card images and frames, four spirit stones, the panel frame, hero sigil, and realm formation.
- Realm motion: the static formation no longer contains baked smoke. Four Canvas light heads follow mirrored center-crossing figure-eight paths that reach beyond the outer ring. Two travel forward and two backward on fixed separated phases. Each trail is reconstructed from 52 historical positions, including direction-correct history sampling for reverse streams, so every bright head stays in front of its fading tail.
- Copy and content: the companion card contains only character art and dialogue. It has no name, identity, realm label, or card-level switch. The four action cards use cultivation-specific descriptions.
- Interaction and accessibility: the Cultivation settings dialog opens, the female/male segmented radio group is labeled and keyboard-compatible, and reduced-motion support remains present. Settings evidence is in `macos/docs/qa/settings-gender-pass.png`.
- Home-card resilience: when Codex does not provide native suggestion buttons, the renderer now creates four stable fallback cards. Their clicks seed the corresponding cultivation prompt in the native editor without auto-submitting; native suggestion behavior is preserved whenever those buttons exist.

**Comparison History**

1. Earlier P1: the generated frame artwork had large internal margins, making the border appear too short; square artifact backgrounds remained visible after broad feathering.
   Fix: expanded the frame's effective raster area, added circular clipping, and tightened the radial mask.
   Evidence: the final focused comparison shows complete top-to-bottom frames and circular artifact stages.
2. Earlier P2: at 2184px the native auto-fit grid stretched each card to about 286px while height stayed fixed, flattening the portrait composition.
   Fix: capped the grid at 196px portrait columns, centered the group, and reduced artifact stages to 166px.
   Evidence: `macos/docs/qa/implementation-home-final.png`; live geometry reports four 196 x 372 cards with no overflow.
3. Earlier P1: the hero sigil rendered as a dark rectangle and stale layout markup still showed the previous title.
   Fix: extracted a real alpha channel and bumped the hero layout version to rebuild the markup.
   Evidence: the final implementation shows the sigil integrated into the background and the title `今日问道`.
4. Earlier P1 behavior regression: opening Cultivation settings threw `maxDay is not defined`.
   Fix: moved the seven-day chart scale calculation into the dialog renderer and added a regression assertion.
   Evidence: `macos/docs/qa/settings-gender-pass.png`; the dialog opens directly to Settings.
5. Later P2: all four artifact layers were four pixels right of the card center, and the circular mask still ended in a visibly hard edge.
   Fix: corrected the shared artifact layer to a zero-pixel center offset and replaced hard clipping with a six-stop `closest-side` radial feather that reaches full transparency at the circle edge.
   Evidence: `macos/docs/qa/cards-centered-feathered.png`; live geometry reports a `0px` center offset for all four cards.
6. User-directed title revision: the hero title was changed from `洞府中枢` to `今日问道` and now uses the native macOS `Xingkai SC` calligraphic family at 72px, with the code-and-cultivation supporting copy `以代码为剑，以逻辑炼心；一问破境，万法归真。`.
   Evidence: `macos/docs/qa/today-calligraphy.png`; Electron reports `Xingkai SC` as the computed primary font family.

**Primary Interactions Tested**

- Opened Cultivation overview and switched to Settings.
- Verified exactly two gender options, with female selected by default.
- Switched state to male at the Transformation realm and verified male art plus realm-specific dialogue in `macos/docs/qa/male-transformation-pass.png`.
- Verified the companion card contains no forbidden identity or realm copy.
- Checked the live page after reinjection; no runtime exception remained and injector verification passed.
- Recorded repeated timed frames of the Canvas realm flow and verified the heads remain separated, the path reaches the outer formation, and reverse trails do not render ahead of their heads.

**Cross-platform Resource Audit**

- macOS and Windows contain the same 35 final files under `assets/cultivation/`.
- Shared `cultivation-skin.css`, `renderer-inject.js`, and `injector.mjs` are byte-identical between platforms.
- macOS full test suite passed with a 58,077,777-byte payload.
- Windows Node validation passed for image metadata, renderer state, early injection, one-shot Browser ID discovery, syntax, and payload construction. PowerShell lifecycle tests were not run because `pwsh` is unavailable on this macOS host.

**Follow-up Polish**

- P3: continue tuning macOS rail widths independently from the Windows reference when the native sidebar width changes.

final result: passed
