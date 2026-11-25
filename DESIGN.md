---
name: Field Book & Plot
---

# Design system

Wherewise looks like a land surveyor's kit: waterproof field-book covers, drafting film ruled with a coordinate grid, flagging tape tied to stakes, and technical lettering. Every visual choice below comes from that world, and every one has a job in the product.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--film` | `#e8ebe7` | Page ground. Frosted drafting film, cool, never cream. |
| `--sheet` | `#f4f5f2` | Panels and plates |
| `--ink` | `#14181d` | Text, rules, frames, primary buttons |
| `--ink-3` | `#555d64` | Secondary text (5.6:1 on film) |
| `--book` | `#f2cd2c` | Field-book yellow. Hero cover, brand block, completed stations, fix buttons |
| `--flag` | `#ff2f7d` | Flagging tape. The only signal colour: selection, the active station, staked notes, significance |
| `--hot` / `--cold` | `#b8203a` / `#2c5e8f` | Data only: hot and cold spots |

Data colours are separate from interface colours. Sequential ramps (Ember, Tide, Moss, Graphite) get strictly darker step by step. Categories use Okabe-Ito. Hot and cold spots use one diverging ramp that is reserved for Gi*.

## Type

Two families, the same limit the studio enforces on map labels.

- Archivo, variable width axis. Display headings at width 112 to 118, weight 750 to 800, tracking −0.02 to −0.035 em. Small caps labels at width 72 to 75, uppercase, tracking 0.07 em. Body at width 100.
- Martian Mono for measurements only: counts, coordinates, scores, station numbers, dates in the collar.

## Marks and state

State is shown with survey marks, not just colour.

| Mark | Meaning |
| --- | --- |
| Flag-tape tab with a cut end | Selected, or a staked note |
| Stake (pin and dot) | A pinned location |
| Yellow circle with a tick | A station you have passed |
| Ink circle with a pink centre | The station you are on |
| Ruler ticks along an edge | A measured surface: the map plate, panel headers, the poster frame |

## Components

- Buttons: square-cornered (2 px), 1 px ink border. Ink fill for primary, yellow for fixes and file actions, pink only for "test this" actions.
- Segmented controls for every mutually exclusive choice.
- Panels: sheet ground, hairline rules, sections titled in small caps.
- Legend: framed in ink, collapsible, counts in mono.
- Focus ring: 2 px pink outline offset by 2 px. Text selection is pink on ink.

## Motion

One grammar: things are plotted and unfurled, nothing bounces.

- Headline and lead rise 14 px on load with an exponential ease-out.
- Flags unfurl with a clip-path wipe.
- The honesty stamp presses in once.
- Loading is a plotter line drawing across.
- `prefers-reduced-motion` turns all of it off.

## Layout

- Landing: hero split 5 to 7 between the field-book cover and the live plate; sections on a 1440 px max width; registration crosses every 96 px on the ground.
- Studio: 352 px control panel, fluid map, 336 px rail. Below 1020 px the rail moves under the map; below 720 px everything stacks with the map sticky at the top.
