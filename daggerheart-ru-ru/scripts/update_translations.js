#!/usr/bin/env node

/**
 * Refreshes Russian translations for Daggerheart by pulling data directly
 * from daggerheart.su endpoints and updating the JSON files under
 * daggerheart-ru-ru/translations.
 *
 * The script mirrors the behaviour of the previous Python version but runs
 * entirely in Node.js to better fit the current toolchain.
 */

const fs = require("fs/promises");
const path = require("path");

const ENDPOINTS = [
  "class",
  "subclass",
  "ancestry",
  "community",
  "domain-card",
  "equipment",
  "beastform",
  "adversary",
  "environment",
  "rule"
];

const CLASS_ITEM_OVERRIDES = {
  "50ft of Rope": "Верёвка (15 м)",
  "A Romance Novel": "Любовный роман",
  "A Sharpening Stone": "Точильный камень",
  "Basic Supplies": "Базовые припасы",
  "Torch": "Факел",
  "Bundle of Offerings": "Связка подношений",
  "Drawing Of A Lover": "Рисунок возлюбленного",
  "Family Heirloom": "Семейная реликвия",
  "Grappling Hook": "Крюк кошка",
  "Letter(Never Opened)": "Письмо (никогда не вскрывалось)",
  "Secret Key": "Секретный ключ",
  "Set of Forgery Tools": "Набор для фальсификации",
  "Sigil of Your God": "Символ вашего бога",
  "Small Bag (Rocks & Bones)": "Маленький мешочек с камнями и костями",
  "Strange Dirty Penant": "Странный кулон, найденный в грязи",
  "Tiny Elemental Pet": "Маленький безобидный питомец элементаль",
  "Totem from Mentor": "Тотем от вашего наставника",
  "Trophy from your First Kill": "Трофей вашего первого убийства",
  "Untranslated Book": "Книга, которую вы пытаетесь перевести",
  "Broken Compass": "Кажущийся сломанным компас"
};

/**
 * HTML overrides for action entries that the API does not expose separately.
 * Values are already sanitised to only include simple markup.
 */
const ACTION_OVERRIDES = {
  // Elementalist foundation: flavour text split into two separate actions.
  rxuFLfHP1FILDpds:
    "<p>Выберите один из элементов — Воздух, Земля, Огонь, Молния или Вода — и создавайте безвредные эффекты на его основе.</p>",
  S7HvFD3qIR3ifJRL:
    "<p><strong>Потратьте Надежду</strong>, опишите помощь стихии и получите +2 к броску действия или +3 к броску урона.</p>",

  // Sparing Touch split: healing HP vs Stress.
  aanLNQkeO2ZTIqBl:
    "<p>Один раз до следующего продолжительного отдыха очистите цели 2 Раны.</p>",
  cWdzCQJv8RFfi2NR:
    "<p>Один раз до следующего продолжительного отдыха очистите цели 2 Стресса.</p>",

  // Weapon Specialist split.
  vay9rVXJS3iksaVR:
    "<p><strong>Потратьте Надежду</strong>, чтобы добавить к урону кость вторичного оружия, когда вы преуспели в атаке.</p>",
  "1bBFfxmywJpx5tfk":
    "<p>Один раз до следующего продолжительного отдыха перебросьте выпавшие 1 на Костях Истребления.</p>",

  // Wings of Light split.
  rg2sLCTqY2rTo861:
    "<p><strong>Отметьте Стресс</strong>, чтобы во время полёта поднять и нести союзника вашего размера или меньше.</p>",
  "1qjnoz5I7NqrWMkp":
    "<p><strong>Потратьте Надежду</strong>, чтобы нанести дополнительный <strong>1d8</strong> урона при успешной атаке в полёте.</p>"
};

const FEATURE_ACTION_GENERATORS = {
  147: generateBulletActions,
  159: generateBulletActions,
  160: generateBulletActions,
  161: generateBulletActions
};

const SUBCLASS_NAME_ALIASES = {
  comaraderie: "camaraderie",
  partnerinarms: "partnersinarms"
};

const SUBCLASS_DUPLICATE_KEYS = {
  "Comaraderie": "Camaraderie",
  "Partner-in-Arms": "Partners-in-Arms"
};

const EQUIPMENT_NAME_ALIASES = {
  elundrianchainmail: "elundrianchainarmor"
};

const ARMOR_OVERRIDES = {
  "Bare Bones": {
    name: "Наголо",
    description:
      "<p>Если вы отказываетесь от доспехов, ваш показатель брони равен 3 + ваша Сила. Базовые пороги урона: 9/19 (ранг 1), 11/24 (ранги 2–4), 13/31 (ранги 5–7) и 15/38 (ранги 8–10).</p>"
  }
};

const LEGACY_ANCESTRY_KEYS = new Set(["Fearless", "Unshakeable"]);

const LABEL_OVERRIDES = {
  "daggerheart.ancestries.json": "Родословные",
  "daggerheart.beastforms.json": "Звериные формы",
  "daggerheart.consumables.json": "Расходники",
  "daggerheart.environments.json": "Окружения"
};

const HTML_LINK_RE = /<a\s+[^>]*>(.*?)<\/a>/gis;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const CLASS_ATTR_RE = /\sclass="[^"]*"/gi;
const HASH_PLACEHOLDER_RE = /#\{([^}]+)\}#/g;

const BASE_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(BASE_DIR, "tmp_data");
const TRANSLATIONS_DIR = path.join(BASE_DIR, "translations");

function normalize(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/’|‘|ʼ|`/g, "'")
    .replace(/“|”/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const key = cleaned.replace(/[^a-z0-9]+/g, "");
  return key || null;
}

function resolveAlias(norm, aliases) {
  if (!norm) return norm;
  return aliases[norm] || norm;
}

function normaliseText(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").trim();
}

function stripLinks(text) {
  if (!text) return text;
  let result = text;
  result = result.replace(HASH_PLACEHOLDER_RE, "$1");
  result = result.replace(/#\{/g, "");
  while (HTML_LINK_RE.test(result)) {
    result = result.replace(HTML_LINK_RE, "$1");
  }
  result = result.replace(MD_LINK_RE, "$1");
  result = result.replace(CLASS_ATTR_RE, "");
  return result;
}

function sanitizeHtml(text) {
  if (text === null || text === undefined) return text;
  return stripLinks(text);
}

function sanitizeName(text) {
  if (text === null || text === undefined) return text;
  return stripLinks(text).trim();
}

function unwrapSingleParagraph(html) {
  if (!html) return html;
  const match = html.match(/^<p>(.*)<\/p>$/is);
  if (match) {
    return match[1];
  }
  return html;
}

function buildFeatureDescription(features) {
  if (!features || !features.length) return null;
  const chunks = [];
  for (const feature of features) {
    if (!feature) continue;
    const title = sanitizeName(feature.name || "");
    const bodyHtml = sanitizeHtml(markdownToHtml(feature.main_body || ""));
    const bodyInner = unwrapSingleParagraph(bodyHtml);
    if (title && bodyInner) {
      chunks.push(`<p><strong>${title}</strong>: ${bodyInner}</p>`);
    } else if (title) {
      chunks.push(`<p><strong>${title}</strong></p>`);
    } else if (bodyHtml) {
      chunks.push(bodyHtml);
    }
  }
  return chunks.length ? chunks.join("") : null;
}

function stripExperienceBonus(name) {
  if (!name) return name;
  return name.replace(/\s*[+\-]\d+\s*$/u, "").trim();
}

function cleanAdversaryItemName(name) {
  if (!name) return name;
  return name.replace(/\s*-\s*(?:action|reaction|passive|действие|реакция|пассив[^\s]*)$/iu, "").trim();
}

function generateBulletActions(rawFeature) {
  if (!rawFeature) return [];
  const source = (rawFeature.main_body || "").replace(/\r\n/g, "\n");
  const matches = source.match(/- .*?(?=\n- |\n*$)/gs);
  if (!matches) return [];
  return matches.map((segment) => {
    const cleaned = segment.replace(/^-\s*/, "").replace(/\*\*\*/g, "**").trim();
    return sanitizeHtml(markdownToHtml(cleaned));
  });
}

function applyFeatureGeneratedActions(entry, featureInfo) {
  if (!entry || !entry.actions || !featureInfo || !featureInfo.raw) return;
  const generator = FEATURE_ACTION_GENERATORS[featureInfo.raw.id];
  if (!generator) return;
  const generated = generator(featureInfo.raw);
  if (!generated || !generated.length) return;
  const ids = Object.keys(entry.actions);
  for (let i = 0; i < ids.length && i < generated.length; i += 1) {
    const html = generated[i];
    if (!html) continue;
    entry.actions[ids[i]] = sanitizeHtml(html);
  }
}

function _updateFeature(entry, featureInfo) {
  if (!featureInfo) return;
  if (featureInfo.name) {
    entry.name = sanitizeName(featureInfo.name);
  }
  if (featureInfo.description !== null && featureInfo.description !== undefined) {
    if (featureInfo.description) {
      const clean = sanitizeHtml(featureInfo.description);
      entry.description = clean;
      if (entry.actions) {
        for (const actionId of Object.keys(entry.actions)) {
          entry.actions[actionId] = clean;
        }
      }
    } else {
      delete entry.description;
    }
  }
}

function markdownToHtml(text) {
  if (!text) return "";
  let prepared = text.replace(/\r\n/g, "\n").trim();
  if (!prepared) return "";

  if (/<[a-z][\s>]/i.test(prepared)) {
    return stripLinks(prepared);
  }

  prepared = prepared.replace(/([^\n])\n([*-]\s)/g, "$1\n\n$2");
  prepared = prepared.replace(MD_LINK_RE, "$1");

  let html = prepared
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");

  const lines = html.split("\n");
  const out = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${line.replace(/^[-*]\s+/, "")}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return stripLinks(out.join(""));
}

async function fetchEndpoint(endpoint, lang) {
  const url = `https://daggerheart.su/api/${endpoint}?lang=${lang}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function downloadEndpoint(endpoint) {
  return fetchEndpoint(endpoint, "ru");
}

async function refreshApiCache() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const endpoint of ENDPOINTS) {
    const data = await downloadEndpoint(endpoint);
    const target = path.join(DATA_DIR, `${endpoint}.json`);
    await fs.writeFile(target, Buffer.from(data));
  }
}

async function loadApi(endpoint) {
  const ruPath = path.join(DATA_DIR, `${endpoint}.json`);
  const ru = JSON.parse(await fs.readFile(ruPath, "utf-8")).data;
  const enBuffer = await fetchEndpoint(endpoint, "en");
  const en = JSON.parse(Buffer.from(enBuffer).toString("utf-8")).data;
  return { ru, en };
}

function buildFeatureMap(enEntries, ruBySlug, fields, sourceLabel, featureMap, featureSources, conflicts) {
  for (const enEntry of enEntries) {
    let slug = enEntry.slug;
    if (!slug) {
      const identifier = enEntry.id;
      if (!identifier) continue;
      slug = String(identifier);
    }
    const ruEntry = ruBySlug.get(slug);
    if (!ruEntry) continue;

    for (const field of fields) {
      const enFeatures = enEntry[field] || [];
      const ruFeatures = new Map();
      for (const feat of ruEntry[field] || []) {
        if (feat && feat.id !== undefined && feat.id !== null) {
          ruFeatures.set(feat.id, feat);
        }
      }
      for (const feature of enFeatures) {
        const fid = feature.id;
        if (fid === undefined || fid === null) continue;
        const ruFeature = ruFeatures.get(fid);
        if (!ruFeature) continue;

        const nameEn = feature.name || "";
        const key = normalize(nameEn);
        if (!key) continue;

        const ruName = sanitizeName(ruFeature.name || enFeatureName(feature));
        const ruBody = normaliseText(ruFeature.main_body || "");
        const enBody = normaliseText(feature.main_body || "");
        const sameName = !ruName || ruName === nameEn;
        const sameBody = !!ruBody && !!enBody && ruBody === enBody;

        if (sameName && sameBody) continue;

        const descriptionHtml = sameBody ? null : markdownToHtml(ruFeature.main_body || "");

        const candidate = {
          name: ruName || nameEn,
          description: descriptionHtml,
          raw: ruFeature
        };

        if (featureMap[key]) {
          const existing = featureMap[key];
          if (candidate.description && existing.description && candidate.description !== existing.description) {
            conflicts.add(`${nameEn}|||${sourceLabel}|||${featureSources[key]}`);
          }
          continue;
        }

        featureMap[key] = candidate;
        featureSources[key] = sourceLabel;
      }
    }
  }
}

function enFeatureName(feature) {
  return feature.name || "";
}

function buildTopLevelMap(enEntries, ruEntries, descriptionFields, mainField = null) {
  const ruBySlug = new Map();
  for (const entry of ruEntries) {
    const slug = entry.slug || String(entry.id);
    if (slug) ruBySlug.set(slug, entry);
  }

  const result = {};
  for (const enEntry of enEntries) {
    const slug = enEntry.slug || String(enEntry.id);
    if (!slug) continue;
    const ruEntry = ruBySlug.get(slug);
    if (!ruEntry) continue;

    let descRu = "";
    let descEn = "";
    for (const field of descriptionFields) {
      if (!descRu && ruEntry[field]) descRu = ruEntry[field];
      if (!descEn && enEntry[field]) descEn = enEntry[field];
    }
    if (mainField) {
      if (ruEntry[mainField]) descRu = ruEntry[mainField];
      if (enEntry[mainField]) descEn = enEntry[mainField];
    }

    const sameText = descRu && descEn && normaliseText(descRu) === normaliseText(descEn);
    const description = descRu && !sameText ? markdownToHtml(descRu) : null;

    result[normalize(enEntry.name)] = {
      name: sanitizeName(ruEntry.name || enEntry.name),
      description,
      raw: ruEntry
    };
  }
  return result;
}

async function updateEntries(filePath, updater, sortKeys = false) {
  const raw = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(raw);
  const missing = [];

  for (const [key, entry] of Object.entries(data.entries || {})) {
    const norm = normalize(key);
    const handled = await updater(norm, entry, key);
    if (!handled) missing.push(key);
  }

  const output = sortKeys ? JSON.stringify(data, Object.keys(data).sort(), 4) : JSON.stringify(data, null, 4);
  await fs.writeFile(filePath, `${output}\n`, "utf-8");
  return missing;
}

function applySubclassDuplicates(path) {
  return fs.readFile(path, "utf-8").then((raw) => {
    const data = JSON.parse(raw);
    const entries = data.entries || {};
    for (const [original, alias] of Object.entries(SUBCLASS_DUPLICATE_KEYS)) {
      if (entries[original] && !entries[alias]) {
        entries[alias] = entries[original];
      }
    }
    return fs.writeFile(path, `${JSON.stringify(data, null, 4)}\n`, "utf-8");
  });
}

async function main() {
  await refreshApiCache();

  const [
    classData,
    subclassData,
    ancestryData,
    communityData,
    domainData,
    equipmentData,
    beastData,
    adversaryData,
    environmentData,
    ruleData
  ] = await Promise.all(ENDPOINTS.map((endpoint) => loadApi(endpoint)));

  const oldTranslations = {};
  const translationFiles = [
    "daggerheart.classes.json",
    "daggerheart.subclasses.json",
    "daggerheart.ancestries.json",
    "daggerheart.communities.json",
    "daggerheart.domains.json",
    "daggerheart.weapons.json",
    "daggerheart.armors.json",
    "daggerheart.loot.json",
    "daggerheart.consumables.json",
    "daggerheart.beastforms.json",
    "daggerheart.adversaries.json",
    "daggerheart.environments.json"
  ];

  for (const file of translationFiles) {
    const fullPath = path.join(TRANSLATIONS_DIR, file);
    const raw = await fs.readFile(fullPath, "utf-8");
    oldTranslations[file] = JSON.parse(raw);
  }

  const classTop = buildTopLevelMap(classData.en, classData.ru, ["description", "short_description"]);
  const subclassTop = buildTopLevelMap(subclassData.en, subclassData.ru, ["description"]);
  const ancestryTop = buildTopLevelMap(ancestryData.en, ancestryData.ru, ["description", "short_description"]);
  const communityTop = buildTopLevelMap(communityData.en, communityData.ru, ["description", "short_description"]);
  const domainTop = buildTopLevelMap(domainData.en, domainData.ru, [], "main_body");
  const equipmentTop = buildTopLevelMap(equipmentData.en, equipmentData.ru, [], "main_body");
  const beastTop = buildTopLevelMap(beastData.en, beastData.ru, ["main_body", "short_description"]);
  const adversaryTop = buildTopLevelMap(adversaryData.en, adversaryData.ru, ["short_description"]);
  const environmentTop = buildTopLevelMap(environmentData.en, environmentData.ru, ["short_description"]);
  const ruleTop = buildTopLevelMap(ruleData.en, ruleData.ru, ["description"], "main_body");

  const featureMap = {};
  const featureSources = {};
  const conflicts = new Set();

  const buildFeature = (enEntries, ruEntries, fields, label) => {
    const ruBySlug = new Map();
    for (const entry of ruEntries) {
      const slug = entry.slug || String(entry.id);
      if (slug) ruBySlug.set(slug, entry);
    }
    buildFeatureMap(enEntries, ruBySlug, fields, label, featureMap, featureSources, conflicts);
  };

  buildFeature(classData.en, classData.ru, ["features"], "class");
  buildFeature(subclassData.en, subclassData.ru, ["foundation_features", "specialization_features", "mastery_features"], "subclass");
  buildFeature(ancestryData.en, ancestryData.ru, ["features"], "ancestry");
  buildFeature(communityData.en, communityData.ru, ["features"], "community");
  buildFeature(domainData.en, domainData.ru, ["features"], "domain-card");
  buildFeature(beastData.en, beastData.ru, ["features"], "beastform");
  buildFeature(adversaryData.en, adversaryData.ru, ["features"], "adversary");
  buildFeature(environmentData.en, environmentData.ru, ["features"], "environment");

  if (conflicts.size) {
    console.log("Conflicting feature translations detected:");
    for (const entry of conflicts) {
      const [name, newSrc, oldSrc] = entry.split("|||");
      console.log(` - ${name}: ${oldSrc} vs ${newSrc}`);
    }
  }

  const classItemsMap = {};
  const ruClassBySlug = new Map(classData.ru.map((entry) => [entry.slug, entry]));
  for (const enEntry of classData.en) {
    const slug = enEntry.slug;
    if (!slug) continue;
    const ruEntry = ruClassBySlug.get(slug);
    if (!ruEntry) continue;
    const enItems = enEntry.class_items || [];
    const ruItems = ruEntry.class_items || [];
    for (let i = 0; i < Math.min(enItems.length, ruItems.length); i += 1) {
      const ruName = sanitizeName(ruItems[i]);
      const key = normalize(enItems[i]);
      if (key) classItemsMap[key] = ruName;
      const articleFree = enItems[i].replace(/^(?:an?\s+)/i, "");
      const keyNoArticle = normalize(articleFree);
      if (keyNoArticle && keyNoArticle !== key) {
        classItemsMap[keyNoArticle] = ruName;
      }
    }
  }

  const domainsOld = oldTranslations["daggerheart.domains.json"];
  const oldDomainActions = {};
  if (domainsOld) {
    for (const [key, value] of Object.entries(domainsOld.entries || {})) {
      if (value.actions) oldDomainActions[key] = value.actions;
    }
  }

  const weaponsOld = oldTranslations["daggerheart.weapons.json"] || {};
  const armorsOld = oldTranslations["daggerheart.armors.json"] || {};
  const consumablesOld = oldTranslations["daggerheart.consumables.json"] || {};
  const lootOld = oldTranslations["daggerheart.loot.json"] || {};

const updateSimpleTop = (topMap, aliases) => (norm, entry, key) =>
    !!topMap[resolveAlias(norm, aliases || {})] &&
    (( () => {
      const info = topMap[resolveAlias(norm, aliases || {})];
      entry.name = sanitizeName(info.name);
      if (info.description !== null && info.description !== undefined) {
        if (info.description) {
          entry.description = sanitizeHtml(info.description);
        } else {
          delete entry.description;
        }
      }
      if (entry.actions) delete entry.actions;
      return true;
    })());

const updateTopWithFeatures = (topMap, featureMap, aliases = {}) => (norm, entry) => {
  if (!norm) return false;
  const lookup = resolveAlias(norm, aliases);
  let handled = false;
  const topInfo = topMap[lookup];
  if (topInfo) {
    entry.name = sanitizeName(topInfo.name);
    if (topInfo.description !== null && topInfo.description !== undefined) {
      if (topInfo.description) {
        entry.description = sanitizeHtml(topInfo.description);
      } else {
        delete entry.description;
      }
    }
    if (entry.actions) delete entry.actions;
    handled = true;
  }
  const featureInfo = featureMap[lookup] || featureMap[norm];
  if (featureInfo) {
    _updateFeature(entry, featureInfo);
    handled = true;
  }
  return handled;
};

function defaultEquipmentDescription(ruEntry, enEntry) {
  const ruBody = normaliseText(ruEntry.main_body || "");
  const enBody = normaliseText(enEntry.main_body || "");
  if (ruBody && (!enBody || ruBody !== enBody)) {
    return markdownToHtml(ruEntry.main_body || "");
  }
  return null;
}

function createEquipmentMap(equipmentData, typeSlugs, options = {}) {
  const { buildDescription } = options;
  const ruBySlug = new Map(equipmentData.ru.map((entry) => [entry.slug, entry]));
  const map = {};
  for (const enEntry of equipmentData.en) {
    if (!typeSlugs.has(enEntry.type_slug)) continue;
    const ruEntry = ruBySlug.get(enEntry.slug);
    if (!ruEntry) continue;
    const norm = normalize(enEntry.name);
    if (!norm) continue;
    const rawDescription = buildDescription
      ? buildDescription(ruEntry, enEntry)
      : defaultEquipmentDescription(ruEntry, enEntry);
    const description = rawDescription ? sanitizeHtml(rawDescription) : null;
    map[norm] = {
      name: sanitizeName(ruEntry.name || enEntry.name),
      description
    };
  }
  return map;
}

async function applyEquipmentMap(targetPath, map, fallback, options = {}) {
  const { overrides = {}, preserveFallbackDescription = true } = options;
  return updateEntries(targetPath, (norm, entry, key) => {
    if (overrides[key]) {
      const override = overrides[key];
      entry.name = sanitizeName(override.name || entry.name);
      if (override.description) {
        entry.description = sanitizeHtml(override.description);
      } else {
        delete entry.description;
      }
      return true;
    }
    if (!norm) return false;
    const info = map[norm] || map[resolveAlias(norm, EQUIPMENT_NAME_ALIASES)];
    if (!info) {
      const oldEntries = fallback.entries || {};
      if (oldEntries[key]) {
        entry.name = oldEntries[key].name;
        if (oldEntries[key].description) {
          entry.description = oldEntries[key].description;
        } else {
          delete entry.description;
        }
        return true;
      }
      return false;
    }
    entry.name = sanitizeName(info.name);
    if (info.description) {
      entry.description = info.description;
    } else if (
      preserveFallbackDescription &&
      fallback.entries &&
      fallback.entries[key] &&
      fallback.entries[key].description
    ) {
      entry.description = fallback.entries[key].description;
    } else {
      delete entry.description;
    }
    return true;
  });
}

function updateActionsFromFeatures(entry, features) {
  if (!entry || !entry.actions) return;
  const actionIds = Object.keys(entry.actions);
  if (!actionIds.length) return;
  for (let i = 0; i < actionIds.length; i += 1) {
    const feature = features[i];
    if (!feature) break;
    if (ACTION_OVERRIDES[actionIds[i]]) continue;
    const body = markdownToHtml(feature.main_body || "");
    if (!body) continue;
    entry.actions[actionIds[i]] = sanitizeHtml(body);
  }
}

function applyActionOverrides(entry) {
  if (!entry || !entry.actions) return;
  for (const [actionId, html] of Object.entries(entry.actions)) {
    if (!html) continue;
    if (ACTION_OVERRIDES[actionId]) {
      entry.actions[actionId] = sanitizeHtml(ACTION_OVERRIDES[actionId]);
    }
  }
}

async function applyLabelOverride(filePath, newLabel) {
  if (!newLabel) return;
  const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
  if (raw.label !== newLabel) {
    raw.label = newLabel;
    await fs.writeFile(filePath, `${JSON.stringify(raw, null, 4)}\n`, "utf-8");
  }
}

async function updateClassesFile(path, { classTop, featureMap, classItemsMap, ruleTop }) {
  return updateEntries(path, (norm, entry, key) => {
    if (!norm) return false;
    let handled = false;
    const classInfo = classTop[norm];
    if (classInfo) {
      entry.name = sanitizeName(classInfo.name);
      if (classInfo.description !== null && classInfo.description !== undefined) {
        if (classInfo.description) {
          entry.description = sanitizeHtml(classInfo.description);
        } else {
          delete entry.description;
        }
      }
      if (entry.actions) delete entry.actions;
      handled = true;
    }

    const featureInfo = featureMap[norm];
    if (featureInfo) {
      if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
      if (featureInfo.description !== null && featureInfo.description !== undefined) {
        if (featureInfo.description) {
          entry.description = sanitizeHtml(featureInfo.description);
          if (entry.actions) {
            for (const actionId of Object.keys(entry.actions)) {
              entry.actions[actionId] = sanitizeHtml(featureInfo.description);
            }
          }
        } else {
          delete entry.description;
        }
      }
      handled = true;
    }

    if (norm === normalize("Rally Level 5") && featureMap[normalize("Rally")]) {
      const info = featureMap[normalize("Rally")];
      entry.name = `${sanitizeName(info.name)} (уровень 5)`;
      if (info.description) {
        const desc = sanitizeHtml(info.description);
        entry.description = desc;
        if (entry.actions) {
          for (const actionId of Object.keys(entry.actions)) {
            entry.actions[actionId] = desc;
          }
        }
      } else {
        delete entry.description;
      }
      handled = true;
      applyFeatureGeneratedActions(entry, info);
    }

    if (featureInfo) applyFeatureGeneratedActions(entry, featureInfo);

    const itemOverride = classItemsMap[norm];
    // if (key === "Whispering Orb") {
    //   console.log("Whispering Orb debug:", norm, itemOverride);
    // }
    if (itemOverride) {
      entry.name = itemOverride;
      delete entry.description;
      delete entry.actions;
      handled = true;
    }

    if (CLASS_ITEM_OVERRIDES[key]) {
      entry.name = CLASS_ITEM_OVERRIDES[key];
      delete entry.description;
      delete entry.actions;
      handled = true;
    }

    const ruleInfo = ruleTop[norm];
    if (ruleInfo) {
      entry.name = sanitizeName(ruleInfo.name);
      if (ruleInfo.description !== null && ruleInfo.description !== undefined) {
        if (ruleInfo.description) {
          entry.description = sanitizeHtml(ruleInfo.description);
        } else {
          delete entry.description;
        }
      }
      handled = true;
    }

    if (!handled) {
      // no-op: keep entry for further manual review
    }
    applyActionOverrides(entry);

    return handled;
  });
}

async function updateSubclassesFile(path, { subclassTop, featureMap }) {
  const result = await updateEntries(path, (norm, entry) => {
    if (!norm) return false;
    const lookup = resolveAlias(norm, SUBCLASS_NAME_ALIASES);
    let handled = false;
    const subclassInfo = subclassTop[lookup];
    if (subclassInfo) {
      entry.name = sanitizeName(subclassInfo.name);
      if (subclassInfo.description !== null && subclassInfo.description !== undefined) {
        if (subclassInfo.description) {
          entry.description = sanitizeHtml(subclassInfo.description);
        } else {
          delete entry.description;
        }
      }
      if (entry.actions) delete entry.actions;
      handled = true;
    }
    const featureInfo = featureMap[lookup] || featureMap[norm];
    if (featureInfo) {
      if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
      if (featureInfo.description !== null && featureInfo.description !== undefined) {
        if (featureInfo.description) {
          const desc = sanitizeHtml(featureInfo.description);
          entry.description = desc;
          if (entry.actions) {
            for (const actionId of Object.keys(entry.actions)) {
              entry.actions[actionId] = desc;
            }
          }
        } else {
          delete entry.description;
        }
      }
      handled = true;
    }

    if (featureInfo) applyFeatureGeneratedActions(entry, featureInfo);
    applyActionOverrides(entry);
    return handled;
  });
  await applySubclassDuplicates(path);
  return result;
}

async function updateAncestriesFile(path, { ancestryTop, featureMap }) {
  return updateEntries(path, updateTopWithFeatures(ancestryTop, featureMap));
}

async function updateCommunitiesFile(path, { communityTop, featureMap }) {
  return updateEntries(path, updateTopWithFeatures(communityTop, featureMap));
}

async function updateDomainsFile(path, { domainTop, featureMap, oldDomainActions }) {
  return updateEntries(path, (norm, entry, key) => {
    if (!norm) return false;
    let handled = false;
    const domainInfo = domainTop[norm];
    if (domainInfo) {
      entry.name = sanitizeName(domainInfo.name);
      const raw = domainInfo.raw;
      let descSource = raw.main_body || "";
      if (!descSource && raw.features && raw.features.length) {
        descSource = raw.features[0].main_body || "";
      }
      const desc = descSource ? markdownToHtml(descSource) : null;
      if (desc) {
        entry.description = sanitizeHtml(desc);
      } else {
        delete entry.description;
      }
      handled = true;
    }
    const featureInfo = featureMap[norm];
    if (featureInfo) {
      _updateFeature(entry, featureInfo);
      handled = true;
    }
    if (handled && entry.actions && Object.keys(entry.actions).length === 0 && oldDomainActions[key]) {
      entry.actions = oldDomainActions[key];
    }
    if (handled && entry.actions) {
      const raw = domainInfo ? domainInfo.raw : null;
      if (raw && raw.features && raw.features.length) {
        updateActionsFromFeatures(entry, raw.features);
      } else if (entry.description) {
        const clean = sanitizeHtml(entry.description);
        for (const actionId of Object.keys(entry.actions)) {
          entry.actions[actionId] = clean;
        }
      }
    }
    applyActionOverrides(entry);
    return handled;
  });
}

async function updateBeastformsFile(path, { beastTop, featureMap }) {
  return updateEntries(path, (norm, entry) => {
    if (!norm) return false;
    const info = beastTop[norm];
    if (info) {
      entry.name = sanitizeName(info.name);
      if (info.description !== null && info.description !== undefined) {
        if (info.description) {
          entry.description = sanitizeHtml(info.description);
        } else {
          delete entry.description;
        }
      }
      const raw = info.raw;
      if (raw && raw.examples) {
        const examples = sanitizeHtml(stripLinks(raw.examples));
        if (examples) {
          const examplesHtml = `<p><strong>Примеры:</strong> ${examples}</p>`;
          entry.description = entry.description
            ? `${entry.description}${examplesHtml}`
            : examplesHtml;
        }
      }
      applyActionOverrides(entry);
      return true;
    }
    if (featureMap[norm]) {
      _updateFeature(entry, featureMap[norm]);
      applyActionOverrides(entry);
      return true;
    }
    applyActionOverrides(entry);
    return false;
  });
}

async function updateAdversariesFile(path, { adversaryTop, featureMap }) {
  return updateEntries(path, (norm, entry) => {
    if (!norm) return false;
    const info = adversaryTop[norm];
    if (info) {
      entry.name = sanitizeName(info.name);
      const raw = info.raw;
      const desc = markdownToHtml(raw.short_description || raw.main_body || "");
      if (desc) {
        entry.description = sanitizeHtml(desc);
      } else {
        delete entry.description;
      }
      if (raw.motives) entry.motivesAndTactics = sanitizeHtml(raw.motives);
      if (raw.weapon_name) entry.attack = sanitizeName(raw.weapon_name);
      const experiences = raw.experiences;
      if (experiences && entry.experiences) {
        const values = experiences.split(",").map((v) => v.trim()).filter(Boolean);
        const keys = Object.keys(entry.experiences);
        for (let i = 0; i < keys.length; i += 1) {
          const value = values[i] || experiences;
          if (value) {
            entry.experiences[keys[i]].name = sanitizeName(stripExperienceBonus(value));
          }
        }
      }
      const ruFeatures = raw.features || [];
      const items = entry.items || {};
      const featureList = ruFeatures.slice();
      for (const itemEntry of Object.values(items)) {
        const nextFeature = featureList.shift();
        if (!nextFeature) break;
        itemEntry.name = sanitizeName(cleanAdversaryItemName(nextFeature.name || ""));
        const body = markdownToHtml(nextFeature.main_body || "");
        if (body) {
          const clean = sanitizeHtml(body);
          itemEntry.description = clean;
          if (itemEntry.actions) {
            for (const actionId of Object.keys(itemEntry.actions)) {
              itemEntry.actions[actionId] = clean;
            }
          }
        } else {
          delete itemEntry.description;
        }
      }
      applyActionOverrides(entry);
      return true;
    }
    if (featureMap[norm]) {
      _updateFeature(entry, featureMap[norm]);
      applyActionOverrides(entry);
      return true;
    }
    applyActionOverrides(entry);
    return false;
  });
}

async function updateEnvironmentsFile(path, { environmentTop, featureMap }) {
  return updateEntries(path, (norm, entry) => {
    if (!norm) return false;
    const info = environmentTop[norm];
    if (info) {
      entry.name = sanitizeName(info.name);
      const raw = info.raw;
      const desc = markdownToHtml(raw.short_description || raw.main_body || "");
      if (desc) {
        entry.description = sanitizeHtml(desc);
      } else {
        delete entry.description;
      }
      if (raw.impulses) entry.impulses = sanitizeHtml(raw.impulses);
      return true;
    }
    if (featureMap[norm]) {
      _updateFeature(entry, featureMap[norm]);
      applyActionOverrides(entry);
      return true;
    }
    applyActionOverrides(entry);
    return false;
  });
}

  const classesPath = path.join(TRANSLATIONS_DIR, "daggerheart.classes.json");
  const subclassesPath = path.join(TRANSLATIONS_DIR, "daggerheart.subclasses.json");
  const ancestriesPath = path.join(TRANSLATIONS_DIR, "daggerheart.ancestries.json");
  const communitiesPath = path.join(TRANSLATIONS_DIR, "daggerheart.communities.json");
  const domainsPath = path.join(TRANSLATIONS_DIR, "daggerheart.domains.json");
  const beastformsPath = path.join(TRANSLATIONS_DIR, "daggerheart.beastforms.json");
  const adversariesPath = path.join(TRANSLATIONS_DIR, "daggerheart.adversaries.json");
  const environmentsPath = path.join(TRANSLATIONS_DIR, "daggerheart.environments.json");
  const armorsPath = path.join(TRANSLATIONS_DIR, "daggerheart.armors.json");
  const weaponsPath = path.join(TRANSLATIONS_DIR, "daggerheart.weapons.json");
  const consumablesPath = path.join(TRANSLATIONS_DIR, "daggerheart.consumables.json");
  const lootPath = path.join(TRANSLATIONS_DIR, "daggerheart.loot.json");

  const missingClasses = await updateClassesFile(classesPath, {
    classTop,
    featureMap,
    classItemsMap,
    ruleTop
  });

  const missingSubclasses = await updateSubclassesFile(subclassesPath, {
    subclassTop,
    featureMap
  });

  const missingAncestriesRaw = await updateAncestriesFile(ancestriesPath, {
    ancestryTop,
    featureMap
  });
  const missingAncestries = missingAncestriesRaw.filter((key) => !LEGACY_ANCESTRY_KEYS.has(key));

  const missingCommunities = await updateCommunitiesFile(communitiesPath, {
    communityTop,
    featureMap
  });

  const missingDomains = await updateDomainsFile(domainsPath, {
    domainTop,
    featureMap,
    oldDomainActions
  });

  const armorMap = createEquipmentMap(equipmentData, new Set(["armor"]), {
    buildDescription: (ruEntry) => {
      const fromFeatures = buildFeatureDescription(ruEntry.features || []);
      return fromFeatures || null;
    }
  });
  const weaponMap = createEquipmentMap(
    equipmentData,
    new Set(["primary-weapon", "secondary-weapon", "combat-wheelchair"]),
    {
      buildDescription: (ruEntry, enEntry) => {
        const featureDesc = buildFeatureDescription(ruEntry.features || []);
        if (enEntry.type_slug === "combat-wheelchair") {
          return featureDesc || defaultEquipmentDescription(ruEntry, enEntry);
        }
        return featureDesc || null;
      }
    }
  );
  const consumableMap = createEquipmentMap(equipmentData, new Set(["consumable"]));
  const lootMap = createEquipmentMap(equipmentData, new Set(["item"]));

  const missingArmors = await applyEquipmentMap(armorsPath, armorMap, armorsOld, {
    overrides: ARMOR_OVERRIDES,
    preserveFallbackDescription: false
  });
  const missingWeapons = await applyEquipmentMap(weaponsPath, weaponMap, weaponsOld);
  const missingConsumables = await applyEquipmentMap(consumablesPath, consumableMap, consumablesOld);
  const missingLoot = await applyEquipmentMap(lootPath, lootMap, lootOld);

  for (const [file, label] of Object.entries(LABEL_OVERRIDES)) {
    const targetPath = path.join(TRANSLATIONS_DIR, file);
    await applyLabelOverride(targetPath, label);
  }

  const missingBeasts = await updateBeastformsFile(beastformsPath, {
    beastTop,
    featureMap
  });

  const missingAdversaries = await updateAdversariesFile(adversariesPath, {
    adversaryTop,
    featureMap
  });

  const missingEnvironments = await updateEnvironmentsFile(environmentsPath, {
    environmentTop,
    featureMap
  });

  const missingSummary = {
    classes: missingClasses,
    subclasses: missingSubclasses,
    ancestries: missingAncestries,
    communities: missingCommunities,
    domains: missingDomains,
    beastforms: missingBeasts,
    adversaries: missingAdversaries,
    environments: missingEnvironments,
    armors: missingArmors,
    weapons: missingWeapons,
    consumables: missingConsumables,
    loot: missingLoot
  };

  console.log("Missing entries report:");
  for (const [category, items] of Object.entries(missingSummary)) {
    const remaining = items.filter(Boolean);
    if (!remaining.length) continue;
    console.log(`- ${category}: ${remaining.length} entries without updates`);
    for (const item of remaining) {
      console.log(`  * ${item}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
