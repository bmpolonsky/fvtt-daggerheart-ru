# Collaborative Brief

## Project Overview
- Foundry-borne Daggerheart module with full RU localization.
- Goal: keep russian texts in `module/i18n` and `module/translations` synced with upstream data + API dumps without drifting from Foundry structure.
- All automation lives in `scripts/*.js` (Node 18+). Manual edits go through these scripts to avoid diverging schemas.

## Translation Rules & Nuances
1. Strip all `<a>` tags and Markdown links (`[]()`), keep plain text only.
2. Experiences: remove inline bonuses like «+2», UI shows modifiers.
3. Beastforms: do not invent descriptions—only text from API/UI and keep “full form” vs “feature item” behavior (see script logic).
4. Preserve class equipment IDs and article/case from upstream; overrides are in `CLASS_ITEM_OVERRIDES`.
5. Aliases baked into the script: Camaraderie/Comaraderie, Partner(s)-in-Arms, Elundrian Chain *Mail/Armor*, etc. Extend there if new typos show up.
6. Weaponized/arcane wheelchairs output feature text, not stat blocks.
7. Bare Bones armor is overridden manually (`ARMOR_OVERRIDES`) and must continue to resolve the API ability.
8. Domain cards keep all actions; automation re-splits combined descriptions, so don’t delete action stubs.
9. Adversary feature ordering is the fallback if IDs mis-match; keep ru items aligned with `raw.features`.
10. Attack fields: adversaries get names from API, weapons default to `"Attack"` and are localized automatically; don’t hand-edit unless upstream changes.

## Automation Workflow
### 1. sync_i18n_structure.js
- Mirrors schemas from `original/` snapshots into `module/`.
- Run when upstream Foundry adds/removes fields (typically after updating `original/`).
- Keeps optional entry-level `description` keys.

### 2. generate_originals.js
- Pulls/updates `tmp_data/original-daggerheart` (skip with `SKIP_REMOTE_UPDATE=1`).
- Rebuilds `original/*.json` + `original/lang/en.json` from the Foundry repo + current RU translations.
- Purpose: provide canonical structure for sync + an easy git diff when upstream system changes.

### 3. update_translations.js
- Always run per localized iteration (unless explicitly told otherwise).
- Steps:
  - Refresh `tmp_data/api/*` (both `endpoint.json` and `endpoint.en.json` caches). Set `SKIP_API_REFRESH=1` to reuse downloads.
  - Build top-level maps + feature maps using RU/EN API payloads.
  - Apply translations to every `module/translations/daggerheart.*.json`, respecting overrides, alias rules, HTML cleanup, `CLASS_ITEM_OVERRIDES`, action/effect splitting, etc.
  - Normalizes `system.attack.name` fields, adds advantages/examples, restores domain actions, ensures class items/starting equipment replacements.
  - Prints per-file stats and missing entries list; treat missing entries as blockers until resolved.

### General Notes
- Scripts expect caches in `tmp_data/api` and the original Foundry repo in `tmp_data/original-daggerheart`.
- Never edit `module/translations/*.json` directly; change automation or upstream data and rerun.
- Review git diff after every script run—manual tweaks (e.g., new translations) must be reflected in automation immediately.
- Use `TODO.md` for outstanding translation tasks (e.g., id-based mapping, “Void” beta content).

## Overrides & Special Cases
- `CLASS_ITEM_OVERRIDES`: ensures rope/torch/supplies and other class item names stay consistent despite API text changes.
- `ACTION_OVERRIDES`: hardcoded HTML for split abilities (Elementalist foundation, Sparing Touch, Weapon Specialist, etc.).
- `ARMOR_OVERRIDES`: Bare Bones custom card text.
- `EQUIPMENT_NAME_ALIASES`: handles renamed/misspelled equipment (Elundrian chain pieces, Camaraderie variants, Partner-in-Arms typos).
- `normalizeItemAttack`: only translates `"Attack"` → `"Атака"`; anything else is left as-is for manual follow-up.

## Expectation for Contributions
- Before adding/removing fields in translations, run `sync_i18n_structure.js`.
- When the Foundry repo updates, rerun `generate_originals.js`, inspect diffs, then adjust automation.
- Every localization pass: run `update_translations.js`, review stats/diffs, fix blind spots, and only then commit.
- Keep scripts self-sufficient: they clear caches, fetch RU/EN payloads with `?lang=`, map overrides, and report unhandled entries.
- If API returns English text, log/flag it; either add manual overrides or loop with maintainers until resolved. 
