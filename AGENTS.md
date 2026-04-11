# Repository Notes

## Project

This repository contains the Russian localization for the Foundry-borne Daggerheart
system.

The main goal is to keep Russian texts aligned with the upstream Foundry system
structure while preserving local translation choices, terminology, and special
cases that are already established in the project.

## Layout

- `module/i18n` contains Foundry interface localization files.
- `module/translations` contains localized compendium and item data.
- `original` contains upstream/reference snapshots used for comparison.
- `scripts` contains project automation for sync and translation maintenance.
- `tmp_data` contains temporary upstream/API data used by automation.

## Translation Conventions

- Keep translations consistent with existing Russian terminology in nearby files.
- Preserve upstream JSON structure, IDs, and technical fields unless the user asks
  to change schema-level data.
- Strip links from user-facing text when the existing localized format uses plain
  text instead of anchors or Markdown links.
- Do not invent missing mechanical descriptions. Prefer existing API/UI text,
  established overrides, or ask the user when the source is ambiguous.
- Experiences should not duplicate inline bonuses such as `+2` when the UI already
  shows modifiers separately.
- Beastform text has separate behavior for full forms and feature items; keep that
  distinction when editing related content.
- Domain cards can contain split actions/effects. Preserve action stubs and avoid
  merging them unless the user explicitly asks for a structural change.
- Attack names are context-sensitive: adversary attacks may use localized names,
  while generic weapon attacks usually remain mechanically normalized.

## Terminology

- Check mechanical terms against the local UI glossary before translating them from
  English directly.
- Daggerheart range terms are not literal English-to-Russian pairs:
  `Melee` -> `Вплотную`, `Very Close` -> `Близко` / `Близкая дистанция`,
  `Close` -> `Средне` / `Средняя дистанция`, `Far` -> `Далеко` /
  `Далёкая дистанция`, `Very Far` -> `Очень далеко`.
- In item and feature text, `within Close range` should normally be translated as
  `в пределах Средней дистанции`, not `в пределах Близкой дистанции`.
- `within Very Close range` should normally be translated as `в пределах Близкой
  дистанции`.

## Special Cases

- Some upstream names and typos are handled through aliases in automation, including
  variants such as `Camaraderie`/`Comaraderie`, `Partner(s)-in-Arms`, and Elundrian
  chain equipment names.
- Some items have manual overrides in automation because upstream/API text is not
  directly usable for the Russian module.
- Void/beta content may be incomplete and should be treated separately from normal
  SRD localization work.

## Collaboration

When the user asks for a specific scoped change, stay within that scope. Do not run
project automation, fetch external data, or broaden the task unless the user asks
for it or explicitly agrees.

If a requested translation depends on uncertain context, inspect local sources first.
Ask the user before making terminology or schema decisions that cannot be resolved
from the repository.
