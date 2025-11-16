#!/usr/bin/env node

const fs = require("fs/promises");
const { existsSync } = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const BASE_DIR = path.resolve(__dirname, "..");
const MODULE_DIR = path.join(BASE_DIR, "module");
const TRANSLATIONS_DIR = path.join(BASE_DIR, "module", "translations");
const ORIGINAL_DIR = path.join(BASE_DIR, "original");
const TMP_DATA_DIR = path.join(BASE_DIR, "tmp_data");
const REMOTE_REPO_DIR = path.join(TMP_DATA_DIR, "original-daggerheart");
const REMOTE_URL = "https://github.com/Foundryborne/daggerheart";
const PACKS_DIR = path.join(REMOTE_REPO_DIR, "src", "packs");
const SKIP_REMOTE_UPDATE = process.env.SKIP_REMOTE_UPDATE === "1";

const FILE_CONFIGS = [
  {
    file: "daggerheart.classes.json",
    label: "Classes",
    build: buildClassEntries
  },
  {
    file: "daggerheart.subclasses.json",
    label: "Subclasses",
    build: () => buildFeatureCollection("subclasses")
  },
  {
    file: "daggerheart.ancestries.json",
    label: "Ancestries",
    build: () => buildMixedCollection("ancestries", ["ancestry", "feature"])
  },
  {
    file: "daggerheart.communities.json",
    label: "Communities",
    build: () => buildMixedCollection("communities", ["community", "feature"])
  },
  {
    file: "daggerheart.domains.json",
    label: "Domains",
    build: buildDomainEntries
  },
  {
    file: "daggerheart.environments.json",
    label: "Environments",
    build: buildEnvironmentEntries
  },
  {
    file: "daggerheart.beastforms.json",
    label: "Beastforms",
    build: buildBeastformEntries
  },
  {
    file: "daggerheart.adversaries.json",
    label: "Adversaries",
    build: buildAdversaryEntries
  },
  {
    file: "daggerheart.weapons.json",
    label: "Weapons",
    build: () => buildItemEntries("items/weapons", "weapon")
  },
  {
    file: "daggerheart.armors.json",
    label: "Armors",
    build: () => buildItemEntries("items/armors", "armor")
  },
  {
    file: "daggerheart.loot.json",
    label: "Loot",
    build: () => buildItemEntries("items/loot", "loot")
  },
  {
    file: "daggerheart.consumables.json",
    label: "Consumables",
    build: () => buildItemEntries("items/consumables", "consumable")
  },
  {
    file: "daggerheart.journals.json",
    label: "Journals",
    build: buildJournalEntries
  },
  {
    file: "lang/en.json",
    label: "System",
    translationPath: path.join(MODULE_DIR, "i18n", "systems", "daggerheart.json"),
    build: buildSystemLang,
    skipPayload: true
  }
];

const generationWarnings = [];

async function main() {
  await ensureRemoteRepo();
  await fs.mkdir(ORIGINAL_DIR, { recursive: true });

  for (const config of FILE_CONFIGS) {
    console.log(`Generating original/${config.file}`);
    const translationPath = config.translationPath || path.join(TRANSLATIONS_DIR, config.file);
    const translation = JSON.parse(await fs.readFile(translationPath, "utf-8"));
    let payload;
    if (config.skipPayload) {
      payload = await config.build(translation);
    } else {
      const entries = await config.build();
      payload = buildOriginalPayload(config.label, translation, entries);
    }
    await fs.writeFile(path.join(ORIGINAL_DIR, config.file), JSON.stringify(payload, null, 2) + "\n");
  }

  console.log("Original snapshots updated.");
  if (generationWarnings.length) {
    console.warn("Получены предупреждения во время генерации:");
    for (const warning of generationWarnings) {
      console.warn(` - ${warning}`);
    }
  }
}

function buildOriginalPayload(label, translation, entries) {
  const payload = {};
  const templateFolders = translation.folders ? Object.keys(translation.folders) : [];
  for (const key of Object.keys(translation)) {
    if (key === "entries") {
      payload.entries = buildEntriesWithTemplate(translation.entries || {}, entries);
      continue;
    }
    if (key === "label") {
      payload.label = label;
      continue;
    }
    if (key === "folders") {
      payload.folders = templateFolders.reduce((acc, folderKey) => {
        acc[folderKey] = folderKey;
        return acc;
      }, {});
      continue;
    }
    payload[key] = translation[key];
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "entries")) {
    payload.entries = buildEntriesWithTemplate({}, entries);
  }
  return payload;
}

function buildEntriesWithTemplate(templateEntries, englishEntries) {
  const result = {};
  const seen = new Set();
  for (const key of Object.keys(templateEntries)) {
    if (Object.prototype.hasOwnProperty.call(englishEntries, key)) {
      result[key] = englishEntries[key];
    } else {
      result[key] = templateEntries[key];
    }
    seen.add(key);
  }
  for (const key of Object.keys(englishEntries)) {
    if (seen.has(key)) continue;
    result[key] = englishEntries[key];
  }
  return result;
}

async function ensureRemoteRepo() {
  await fs.mkdir(TMP_DATA_DIR, { recursive: true });
  if (!existsSync(REMOTE_REPO_DIR)) {
    console.log("Cloning Daggerheart source...");
    runGitCommand(["clone", REMOTE_URL, path.basename(REMOTE_REPO_DIR)], TMP_DATA_DIR);
    return;
  }
  if (SKIP_REMOTE_UPDATE) {
    console.log("Skipping Daggerheart source update (cached repo).");
    return;
  }
  console.log("Updating Daggerheart source...");
  runGitCommand(["-C", REMOTE_REPO_DIR, "pull", "--ff-only"]);
}

function runGitCommand(args, cwd = undefined) {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}`);
  }
}

async function loadEntries(relativePath) {
  const directory = path.join(PACKS_DIR, relativePath);
  const names = await fs.readdir(directory);
  const entries = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json") || name.startsWith("folders_")) continue;
    const fullPath = path.join(directory, name);
    const content = await fs.readFile(fullPath, "utf-8");
    entries.push(JSON.parse(content));
  }
  return entries;
}

async function buildClassEntries() {
  const classEntries = await gatherEntries("classes", ["class"], simpleEntry);
  const featureEntries = await gatherEntries("classes", ["feature"], featureEntry);
  return { ...classEntries, ...featureEntries };
}

async function buildDomainEntries() {
  return gatherEntries("domains", ["domainCard"], (entry) => {
    const result = { name: entry.name };
    addDescription(result, entry.system?.description);
    const actions = convertActions(entry.system?.actions);
    if (actions) result.actions = actions;
    const effects = convertEffects(entry.effects || entry.system?.effects, `domainCard:${entry.name}`);
    if (effects) {
      result.effects = effects;
    }
    return result;
  });
}

async function buildEnvironmentEntries() {
  return gatherEntries("environments", ["environment"], (entry) => {
    const result = { name: entry.name };
    addDescription(result, entry.system?.description);
    if (entry.system?.impulses) {
      result.impulses = entry.system.impulses;
    }
    const items = convertItemList(entry.items);
    if (items && Object.keys(items).length) {
      result.items = items;
    }
    return result;
  });
}

async function buildBeastformEntries() {
  const beastforms = await gatherEntries("beastforms", ["beastform"], (entry) => {
    const result = { name: entry.name };
    if (entry.system?.examples) {
      result.examples = entry.system.examples;
    }
    const advantageOn = extractAdvantageList(entry.system?.advantageOn);
    if (advantageOn.length) {
      result.advantageOn = advantageOn;
    }
    addDescription(result, entry.system?.description);
    const effects = convertEffects(entry.effects || entry.system?.effects, `beastform:${entry.name}`);
    if (effects) {
      result.effects = effects;
    }
    return result;
  });
  const features = await gatherEntries("beastforms", ["feature"], featureEntry);
  return { ...beastforms, ...features };
}

async function buildAdversaryEntries() {
  return gatherEntries("adversaries", ["adversary"], (entry) => {
    const result = { name: entry.name };
    addDescription(result, entry.system?.description);
    if (entry.system?.motivesAndTactics) {
      result.motivesAndTactics = entry.system.motivesAndTactics;
    }
    if (entry.system?.attack?.name) {
      result.attack = entry.system.attack.name;
    }
    const experiences = convertExperiences(entry.system?.experiences);
    if (experiences && Object.keys(experiences).length) {
      result.experiences = experiences;
    }
    const items = convertItemList(entry.items);
    if (items && Object.keys(items).length) {
      result.items = items;
    }
    const effects = convertEffects(entry.effects || entry.system?.effects, `adversary:${entry.name}`);
    if (effects) {
      result.effects = effects;
    }
    return result;
  });
}

async function buildItemEntries(relativePath, acceptedType) {
  return gatherEntries(relativePath, [acceptedType], (entry) => {
    const result = { name: entry.name };
    addDescription(result, entry.system?.description);
    const actions = convertActions(entry.system?.actions);
    if (actions) {
      result.actions = actions;
    }
    const effects = convertEffects(entry.effects || entry.system?.effects, `${relativePath}:${entry.name}`);
    if (effects) {
      result.effects = effects;
    }
    const attackName = extractAttackName(entry.system?.attack);
    if (attackName) {
      result.attack = attackName;
    }
    return result;
  });
}

async function buildFeatureCollection(relativePath) {
  return gatherEntries(relativePath, ["feature"], featureEntry);
}

async function buildMixedCollection(relativePath, types) {
  return gatherEntries(relativePath, types, (entry) => {
    if (entry.type === "feature") {
      return featureEntry(entry);
    }
    const result = { name: entry.name };
    addDescription(result, entry.system?.description);
    return result;
  });
}

async function buildJournalEntries() {
  const entries = await loadEntries("journals");
  const result = {};
  for (const entry of entries) {
    if (!entry || !entry.name) continue;
    const pages = {};
    if (Array.isArray(entry.pages)) {
      for (const page of entry.pages) {
        const name = page.name || "";
        pages[name] = {
          name,
          text: sanitizeRichText(page.text?.content ?? "")
        };
      }
    }
    result[entry.name] = { pages };
  }
  return result;
}

async function gatherEntries(relativePath, types, converter) {
  const entries = await loadEntries(relativePath);
  const result = {};
  for (const entry of entries) {
    if (!entry || (types && types.length && !types.includes(entry.type))) continue;
    if (!entry.name) continue;
    const converted = converter(entry);
    if (!converted) continue;
    result[entry.name] = converted;
  }
  return result;
}

function featureEntry(entry) {
  const result = { name: entry.name };
  addDescription(result, entry.system?.description);
  const actions = convertActions(entry.system?.actions);
  if (actions) {
    result.actions = actions;
  }
  const effects = convertEffects(entry.effects || entry.system?.effects, `feature:${entry.name}`);
  if (effects) {
    result.effects = effects;
  }
  return result;
}

function simpleEntry(entry) {
  const result = { name: entry.name };
  addDescription(result, entry.system?.description);
  return result;
}

function addDescription(target, value) {
  if (!value) return;
  const trimmed = sanitizeRichText(value).trim();
  if (trimmed) {
    target.description = trimmed;
  }
}

function convertActions(payload) {
  if (!payload || typeof payload !== "object") return null;
  const result = {};
  for (const [id, action] of Object.entries(payload)) {
    if (!action) continue;
    const entry = {};
    if (action.name) {
      entry.name = action.name;
    }
    if (action.description) {
      const trimmed = sanitizeRichText(action.description).trim();
      if (trimmed) {
        entry.description = trimmed;
      }
    }
    if (Object.keys(entry).length) {
      result[id] = entry;
    }
  }
  return Object.keys(result).length ? result : null;
}

function convertItemList(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const result = {};
  for (const item of items) {
    if (!item || !item._id) continue;
    const child = { name: item.name };
    addDescription(child, item.system?.description);
    const actions = convertActions(item.system?.actions);
    if (actions) {
      child.actions = actions;
    }
    const effects = convertEffects(item.effects, `item:${item._id}`);
    if (effects) {
      child.effects = effects;
    }
    const attackName = extractAttackName(item.system?.attack);
    if (attackName) {
      child.attack = attackName;
    }
    result[item._id] = child;
  }
  return result;
}

function extractAttackName(attackNode) {
  if (!attackNode || typeof attackNode !== "object") return null;
  const name = typeof attackNode.name === "string" ? attackNode.name.trim() : "";
  return name || null;
}

function convertExperiences(payload) {
  if (!payload || typeof payload !== "object") return null;
  const result = {};
  for (const [id, experience] of Object.entries(payload)) {
    if (!experience) continue;
    if (experience.name) {
      result[id] = { name: experience.name };
    }
  }
  return Object.keys(result).length ? result : null;
}

function convertEffects(payload, context = "effects") {
  if (!Array.isArray(payload) || !payload.length) return null;
  const result = {};
  payload.forEach((effect, index) => {
    if (!effect) return;
    const entry = {};
    if (effect.name) {
      entry.name = effect.name;
    }
    if (effect.description) {
      const trimmed = sanitizeRichText(effect.description).trim();
      if (trimmed) {
        entry.description = trimmed;
      }
    }
    if (!Object.keys(entry).length) return;
    let effectId = typeof effect._id === "string" && effect._id.trim() ? effect._id.trim() : null;
    if (!effectId) {
      generationWarnings.push(
        `Effect без _id (${entry.name || "без имени"}) в ${context}. Использую сгенерированный ключ.`
      );
      effectId = makeGeneratedEffectKey(entry.name, index, result);
    } else if (Object.prototype.hasOwnProperty.call(result, effectId)) {
      generationWarnings.push(
        `Дублирующийся effect id ${effectId} в ${context}. Использую уникальный суффикс.`
      );
      effectId = makeGeneratedEffectKey(effectId, index, result, effectId);
    }
    result[effectId] = entry;
  });
  return Object.keys(result).length ? result : null;
}

function makeGeneratedEffectKey(name, index, existing, baseOverride) {
  const baseSlug = baseOverride || slugify(name) || `effect-${index + 1}`;
  let candidate = baseSlug;
  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(existing, candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function slugify(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function alignWithTemplate(template, source) {
  const result = {};
  const seen = new Set();
  if (template && typeof template === "object" && !Array.isArray(template)) {
    for (const key of Object.keys(template)) {
      if (source && Object.prototype.hasOwnProperty.call(source, key)) {
        result[key] =
          typeof template[key] === "object" && !Array.isArray(template[key]) && typeof source[key] === "object"
            ? alignWithTemplate(template[key], source[key])
            : source[key];
      } else {
        result[key] = template[key];
      }
      seen.add(key);
    }
  }
  if (source && typeof source === "object") {
    for (const key of Object.keys(source)) {
      if (!seen.has(key)) {
        result[key] = source[key];
      }
    }
  }
  return result;
}

async function buildSystemLang() {
  const langPath = path.join(REMOTE_REPO_DIR, "lang", "en.json");
  const content = await fs.readFile(langPath, "utf-8");
  return JSON.parse(content);
}

function extractAdvantageList(payload) {
  if (!payload || typeof payload !== "object") return [];
  const values = [];
  for (const item of Object.values(payload)) {
    if (!item) continue;
    const text = typeof item === "string" ? item : item.value;
    if (text) values.push(text);
  }
  return values;
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObject(value[key]);
      return acc;
    }, {});
}

function sanitizeRichText(value) {
  if (value == null) return "";
  return String(value).replace(/\sstyle=("[^"]*"|'[^']*')/gi, "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
