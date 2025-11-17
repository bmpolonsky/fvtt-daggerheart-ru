#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const MODULE_DIR = path.join(BASE_DIR, "module");
const TRANSLATIONS_DIR = path.join(BASE_DIR, "module", "translations");
const ORIGINAL_DIR = path.join(BASE_DIR, "original");
const TMP_DATA_DIR = path.join(BASE_DIR, "tmp_data");
const REMOTE_REPO_DIR = path.join(TMP_DATA_DIR, "original-daggerheart");
const PACKS_DIR = path.join(REMOTE_REPO_DIR, "src", "packs");
const VOID_ORIGINAL_DIR = path.join(ORIGINAL_DIR, "void");
const VOID_UNPACKED_DIR = path.join(TMP_DATA_DIR, "the-void-unofficial-json");
const VOID_DOCUMENT_CACHE = new Map();
const UPDATE_SOURCES_HINT =
  "Запустите npm run update:sources для обновления исходников (tmp_data/original-daggerheart и the-void-unofficial).";

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
const VOID_FILE_CONFIGS = [
  {
    file: "the-void-unofficial.classes.json",
    label: "Classes",
    template: "daggerheart.classes.json",
    packName: "classes",
    build: buildVoidClassEntries
  },
  {
    file: "the-void-unofficial.subclasses.json",
    label: "Subclasses",
    template: "daggerheart.subclasses.json",
    packName: "subclasses",
    build: buildVoidSubclassEntries
  },
  {
    file: "the-void-unofficial.ancestries.json",
    label: "Ancestries",
    template: "daggerheart.ancestries.json",
    packName: "ancestries",
    build: buildVoidAncestryEntries
  },
  {
    file: "the-void-unofficial.communities.json",
    label: "Communities",
    template: "daggerheart.communities.json",
    packName: "communities",
    build: buildVoidCommunityEntries
  },
  {
    file: "the-void-unofficial.domains.json",
    label: "Domains",
    template: "daggerheart.domains.json",
    packName: "domains",
    build: buildVoidDomainEntries
  },
  {
    file: "the-void-unofficial.transformations.json",
    label: "Transformations",
    template: "daggerheart.beastforms.json",
    packName: "transformations",
    build: buildVoidTransformationEntries
  },
  {
    file: "the-void-unofficial.weapons.json",
    label: "Weapons",
    template: "daggerheart.weapons.json",
    packName: "weapons",
    build: () => buildVoidItemEntries("weapons")
  },
  {
    file: "the-void-unofficial.adversaries--environments.json",
    label: "Adversaries / Environments",
    template: "daggerheart.adversaries.json",
    packName: "adversaries--environments",
    prepareTemplate: (template) => {
      template.mapping = template.mapping || {};
      template.mapping.impulses = "system.impulses";
      template.mapping.potentialAdversaries = {
        path: "system.potentialAdversaries",
        converter: "toPotentialAdversaries"
      };
      return template;
    },
    build: buildVoidAdversaryEnvironmentEntries
  }
];

async function main() {
  await generateDaggerheartOriginals();
  await generateVoidOriginals();
  console.log("Original snapshots updated.");
  if (generationWarnings.length) {
    console.warn("Получены предупреждения во время генерации:");
    for (const warning of generationWarnings) {
      console.warn(` - ${warning}`);
    }
  }
}

async function generateDaggerheartOriginals() {
  await assertPathExists(PACKS_DIR, `Не найден каталог Foundryborne daggerheart (${PACKS_DIR}). ${UPDATE_SOURCES_HINT}`);
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
}

async function generateVoidOriginals() {
  await assertPathExists(
    VOID_UNPACKED_DIR,
    `Не найдены распакованные паки The Void (${VOID_UNPACKED_DIR}). ${UPDATE_SOURCES_HINT}`
  );
  await fs.mkdir(VOID_ORIGINAL_DIR, { recursive: true });

  for (const config of VOID_FILE_CONFIGS) {
    console.log(`Generating original/void/${config.file}`);
    let template = await loadTemplate(config.template);
    if (typeof config.prepareTemplate === "function") {
      template = config.prepareTemplate({ ...template });
    }
    let entries = await config.build();
    entries = sortEntries(entries);
    const folderNames = config.packName ? await buildVoidFolderNames(config.packName) : [];
    const folderMap = buildFolderMapFromNames(folderNames);
    const payload = { ...template, entries, folders: folderMap };
    if (config.label) {
      payload.label = config.label;
    }
    const targetPath = path.join(VOID_ORIGINAL_DIR, config.file);
    await fs.writeFile(targetPath, JSON.stringify(payload, null, 2) + "\n");
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

async function loadTemplate(templateName) {
  if (!templateName) {
    throw new Error("Template name is required for Void payload generation.");
  }
  const fullPath = path.join(ORIGINAL_DIR, templateName);
  const raw = JSON.parse(await fs.readFile(fullPath, "utf-8"));
  const { entries, ...rest } = raw;
  return rest;
}

async function assertPathExists(targetPath, errorMessage) {
  try {
    await fs.access(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(errorMessage);
    }
    throw error;
  }
}

async function loadVoidPackDocuments(packName) {
  if (VOID_DOCUMENT_CACHE.has(packName)) {
    return VOID_DOCUMENT_CACHE.get(packName);
  }
  const packPath = path.join(VOID_UNPACKED_DIR, packName);
  try {
    await fs.access(packPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Не найден каталог распакованных данных для пака ${packName}.`);
    }
    throw error;
  }
  const documents = [];
  await readDirectoryRecursive(packPath, documents);
  VOID_DOCUMENT_CACHE.set(packName, documents);
  return documents;
}

async function readDirectoryRecursive(directory, bucket) {
  const dirents = await fs.readdir(directory, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      await readDirectoryRecursive(fullPath, bucket);
      continue;
    }
    if (!dirent.isFile() || !dirent.name.endsWith(".json") || dirent.name.startsWith("_Folder")) {
      continue;
    }
    const content = await fs.readFile(fullPath, "utf-8");
    try {
      bucket.push(JSON.parse(content));
    } catch (error) {
      throw new Error(`Не удалось распарсить ${fullPath}: ${error.message}`);
    }
  }
}

async function buildVoidFolderNames(packName) {
  if (!packName) {
    return [];
  }
  const packPath = path.join(VOID_UNPACKED_DIR, packName);
  try {
    await fs.access(packPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const records = [];
  await collectFolderRecords(packPath, records);
  const seen = new Set();
  const sorted = records
    .filter((record) => record && record.name)
    .sort((a, b) => {
      if (a.sort !== b.sort) {
        return a.sort - b.sort;
      }
      return a.name.localeCompare(b.name, "en");
    });
  const names = [];
  for (const record of sorted) {
    if (seen.has(record.name)) {
      continue;
    }
    seen.add(record.name);
    names.push(record.name);
  }
  return names;
}

async function collectFolderRecords(directory, bucket) {
  const dirents = await fs.readdir(directory, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      await collectFolderRecords(fullPath, bucket);
      continue;
    }
    if (!dirent.isFile() || dirent.name !== "_Folder.json") {
      continue;
    }
    try {
      const data = JSON.parse(await fs.readFile(fullPath, "utf-8"));
      if (!data?.name) continue;
      const sortValue =
        typeof data.sort === "number"
          ? data.sort
          : Number.isFinite(Number(data.sort))
            ? Number(data.sort)
            : Number.MAX_SAFE_INTEGER;
      bucket.push({ name: data.name, sort: sortValue });
    } catch (error) {
      throw new Error(`Не удалось прочитать ${fullPath}: ${error.message}`);
    }
  }
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
    const potential = entry.system?.potentialAdversaries;
    if (potential && typeof potential === "object") {
      const groups = {};
      for (const [id, group] of Object.entries(potential)) {
        if (!group) continue;
        groups[id] = { label: group.label || "" };
      }
      if (Object.keys(groups).length) {
        result.potentialAdversaries = groups;
      }
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

function buildFolderMapFromNames(folderNames) {
  if (!Array.isArray(folderNames) || !folderNames.length) {
    return {};
  }
  return folderNames.reduce((acc, name) => {
    acc[name] = name;
    return acc;
  }, {});
}

async function buildVoidClassEntries() {
  const documents = await loadVoidPackDocuments("classes");
  const result = {};
  for (const entry of documents) {
    if (!entry?.name) continue;
    let converted = null;
    if (entry.type === "class") {
      converted = simpleEntry(entry);
    } else if (entry.type === "feature") {
      converted = featureEntry(entry);
    } else {
      converted = genericItemEntry(entry, "class-item");
    }
    if (converted) {
      result[entry.name] = converted;
    }
  }
  return result;
}

async function buildVoidSubclassEntries() {
  const documents = await loadVoidPackDocuments("subclasses");
  const result = {};
  for (const entry of documents) {
    if (!entry?.name) continue;
    let converted = null;
    if (entry.type === "subclass") {
      converted = descriptionEntry(entry);
    } else if (entry.type === "feature") {
      converted = featureEntry(entry);
    }
    if (converted) {
      result[entry.name] = converted;
    }
  }
  return result;
}

async function buildVoidAncestryEntries() {
  const documents = await loadVoidPackDocuments("ancestries");
  const result = {};
  for (const entry of documents) {
    if (!entry?.name) continue;
    const converted = entry.type === "feature" ? featureEntry(entry) : descriptionEntry(entry);
    if (converted) {
      result[entry.name] = converted;
    }
  }
  return result;
}

async function buildVoidCommunityEntries() {
  const documents = await loadVoidPackDocuments("communities");
  const result = {};
  for (const entry of documents) {
    if (!entry?.name) continue;
    const converted = entry.type === "feature" ? featureEntry(entry) : descriptionEntry(entry);
    if (converted) {
      result[entry.name] = converted;
    }
  }
  return result;
}

async function buildVoidDomainEntries() {
  const documents = await loadVoidPackDocuments("domains");
  const result = {};
  for (const entry of documents) {
    if (!entry?.name || entry.type !== "domainCard") continue;
    const payload = { name: entry.name };
    addDescription(payload, entry.system?.description);
    const actions = convertActions(entry.system?.actions);
    if (actions) payload.actions = actions;
    const effects = convertEffects(entry.effects || entry.system?.effects, `void-domain:${entry._id || entry.name}`);
    if (effects) payload.effects = effects;
    result[entry.name] = payload;
  }
  return result;
}

async function buildVoidTransformationEntries() {
  const documents = await loadVoidPackDocuments("transformations");
  const result = {};
  for (const entry of documents) {
    if (!entry?.name) continue;
    const converted = featureEntry(entry);
    if (converted) {
      result[entry.name] = converted;
    }
  }
  return result;
}

async function buildVoidItemEntries(packName) {
  const documents = await loadVoidPackDocuments(packName);
  const result = {};
  for (const entry of documents) {
    if (!entry?.name) continue;
    const converted = genericItemEntry(entry, `${packName}`);
    if (converted) {
      result[entry.name] = converted;
    }
  }
  return result;
}

async function buildVoidAdversaryEnvironmentEntries() {
  const documents = await loadVoidPackDocuments("adversaries--environments");
  const result = {};
  for (const entry of documents) {
    if (!entry?.name) continue;
    if (entry.type === "adversary") {
      result[entry.name] = buildVoidAdversary(entry);
    } else if (entry.type === "environment") {
      result[entry.name] = buildVoidEnvironment(entry);
    }
  }
  return result;
}

function buildVoidAdversary(entry) {
  const payload = { name: entry.name };
  addDescription(payload, entry.system?.description);
  if (entry.system?.motivesAndTactics) {
    payload.motivesAndTactics = entry.system.motivesAndTactics;
  }
  if (entry.system?.attack?.name) {
    payload.attack = entry.system.attack.name;
  }
  const experiences = convertExperiences(entry.system?.experiences);
  if (experiences && Object.keys(experiences).length) {
    payload.experiences = experiences;
  }
  const items = convertItemList(entry.items);
  if (items && Object.keys(items).length) {
    payload.items = items;
  }
  const effects = convertEffects(entry.effects || entry.system?.effects, `void-adversary:${entry._id || entry.name}`);
  if (effects) {
    payload.effects = effects;
  }
  return payload;
}

function buildVoidEnvironment(entry) {
  const payload = { name: entry.name };
  addDescription(payload, entry.system?.description);
  if (entry.system?.impulses) {
    payload.impulses = entry.system.impulses;
  }
  const potential = entry.system?.potentialAdversaries;
  if (potential && typeof potential === "object") {
    const groups = {};
    for (const [id, group] of Object.entries(potential)) {
      if (!group) continue;
      groups[id] = { label: group.label || "" };
    }
    if (Object.keys(groups).length) {
      payload.potentialAdversaries = groups;
    }
  }
  const items = convertItemList(entry.items);
  if (items && Object.keys(items).length) {
    payload.items = items;
  }
  const effects = convertEffects(entry.effects || entry.system?.effects, `void-environment:${entry._id || entry.name}`);
  if (effects) {
    payload.effects = effects;
  }
  return payload;
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

function copyStringArrayField(target, values, key) {
  if (!target || !Array.isArray(values)) return;
  const cleaned = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (cleaned.length) {
    target[key] = cleaned;
  }
}

function simpleEntry(entry) {
  const result = { name: entry.name };
  addDescription(result, entry.system?.description);
  copyStringArrayField(result, entry.system?.backgroundQuestions, "backgroundQuestions");
  copyStringArrayField(result, entry.system?.connections, "connections");
  return result;
}

function descriptionEntry(entry) {
  const result = { name: entry.name };
  addDescription(result, entry.system?.description);
  return result;
}

function genericItemEntry(entry, contextPrefix) {
  const result = { name: entry.name };
  addDescription(result, entry.system?.description);
  const actions = convertActions(entry.system?.actions);
  if (actions) {
    result.actions = actions;
  }
  const effects = convertEffects(entry.effects || entry.system?.effects, `${contextPrefix}:${entry._id || entry.name}`);
  if (effects) {
    result.effects = effects;
  }
  const attackName = extractAttackName(entry.system?.attack);
  if (attackName) {
    result.attack = attackName;
  }
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
    copySourcesFromChanges(effect.changes, entry);
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

function copySourcesFromChanges(changes, target) {
  if (!Array.isArray(changes) || !changes.length) return null;
  const sources = {
    "system.advantageSources": {},
    "system.disadvantageSources": {}
  };
  for (const change of changes) {
    if (!change || !sources[change.key]) continue;
    const value = typeof change.value === "string" ? change.value.trim() : "";
    if (!value) continue;
    sources[change.key][value] = value;
  }
  for (const [key, bucket] of Object.entries(sources)) {
    if (!Object.keys(bucket).length) continue;
    const prop = key === "system.advantageSources" ? "advantageSources" : "disadvantageSources";
    target[prop] = bucket;
  }
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

function sortEntries(entries) {
  const sorted = {};
  for (const key of Object.keys(entries || {}).sort((a, b) => a.localeCompare(b, "en"))) {
    sorted[key] = entries[key];
  }
  return sorted;
}

function sanitizeRichText(value) {
  if (value == null) return "";
  return String(value).replace(/\sstyle=("[^"]*"|'[^']*')/gi, "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
