# Changelog

All notable changes to **Night Market** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/). Pre-1.0
releases (0.x) may still change gameplay and UI between minor versions.

## [Unreleased]

## [0.1.1] — 2026-08-24

### Fixed
- Operator portrait: removed a dark smear in the hair — the background key was punching
  a hole through light blonde highlights and the dark UI showed through. The key now only
  removes background **connected to the frame edge** (flood-fill) and refills interior holes,
  and the silhouette is defringed (2px erode) with the drop-shadow dropped, so no dark rim.

## [0.1.0] — 2026-08-24

First tagged release. A playable, best-of-3, 4-player cyberpunk trading-card game
(Jaipur-inspired), deployed to GitHub Pages.

### Added
- **Onboarding** — a "How to Play" rules panel (menu + in-game `?`) and a first-run
  **guided spotlight walkthrough** that tours the board (market, price wall, hand, dock,
  fleet, rivals, progress). Auto-runs once for new players; dismissible; replayable.
- **Bot progression legibility** — each rival card shows its most recent move
  (last-action readout), plus live **standings** with a rank chip and a leader star.
- **Operator character portrait** — the delivered art replaces the robot avatar, standing
  at the bottom-left of the operator zone (background keyed out and cropped in-canvas).
- **Progress HUD** — round / seals / market-supply / deck tracker, with a round-end
  telegraph (Supply meter pulses as the round nears its end).
- **Absolute stock bar** on the price wall — one cell per remaining token, so the visible
  cells equal the exact stock left; with LOW / SOLD-OUT states.
- Best-of-3 **match model** (seals), main menu + match flow, save/resume, difficulty tiers,
  and a bot-vs-bot **simulation harness**.

### Changed
- **Rebrand** to *Night Market* (from the earlier "Darknet Market"); repo and Pages URL
  renamed to `night-market`.
- **Currency** renamed to **Gold** (from the interim "CR"/"Credits").
- **Market-driven action dock** — one primary button resolves Take / Take-drones /
  Exchange straight from the market selection; standalone drone button removed.
- Rival cards promote **Score** to the headline stat; turn banner distinguishes
  "Round // Complete" from "Match // Over".
- Responsive/RWD hardening with crisp hi-DPI rendering (CSS `zoom`) and a graceful
  too-small state.

### Fixed
- Price-wall stock display no longer misleads (was normalized per-good; now absolute).
- Drone-for-cards exchange and single-drone selection corrected.

[Unreleased]: https://github.com/HealthUp2020/night-market/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/HealthUp2020/night-market/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/HealthUp2020/night-market/releases/tag/v0.1.0
