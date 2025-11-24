#!/usr/bin/env node

/**
 * Синхронизирует структуру локализаций с официальными оригиналами.
 *
 * 1. module/i18n/systems/daggerheart.json сверяется с original/lang/en.json.
 * 2. Все файлы в module/translations приводятся к структуре файлов original/.
 */

const fs = require("fs/promises");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const UI_SOURCE_PATH = path.join(BASE_DIR, "original", "lang", "en.json");
const UI_TARGET_PATH = path.join(BASE_DIR, "module", "i18n", "systems", "daggerheart.json");
const ORIGINAL_TRANSLATIONS_DIR = path.join(BASE_DIR, "original");
const ORIGINAL_VOID_DIR = path.join(ORIGINAL_TRANSLATIONS_DIR, "void");
const TARGET_TRANSLATIONS_DIR = path.join(BASE_DIR, "module", "translations");

const TOP_LEVEL_ENTRY_OPTIONAL_KEYS = new Set(["description"]);
const ADD_ONLY_MODE = process.argv.includes("--add-only");

async function main() {
  if (ADD_ONLY_MODE) {
    console.log("Режим только добавления: лишние ключи сохраняются для обратной совместимости.");
  }
  const results = [];

  results.push(
    await syncFile({
      label: "UI локализация",
      sourcePath: UI_SOURCE_PATH,
      targetPath: UI_TARGET_PATH
    })
  );

  const translationMappings = await gatherTranslationMappings();
  for (const mapping of translationMappings) {
    const exists = await fileExists(mapping.sourcePath);
    if (!exists) continue;
    results.push(await syncFile(mapping));
  }

  const anyChanges = results.some((result) => result.changed);
  for (const result of results) {
    logResult(result);
  }

  if (!anyChanges) {
    console.log("Все файлы локализации уже совпадают с оригинальной структурой.");
  }
}

async function gatherTranslationMappings() {
  const mappings = [];
  const rootFiles = await listJsonFiles(ORIGINAL_TRANSLATIONS_DIR);
  for (const fileName of rootFiles) {
    mappings.push({
      label: `Перевод ${fileName}`,
      sourcePath: path.join(ORIGINAL_TRANSLATIONS_DIR, fileName),
      targetPath: path.join(TARGET_TRANSLATIONS_DIR, fileName)
    });
  }
  const voidFiles = await listJsonFiles(ORIGINAL_VOID_DIR);
  for (const fileName of voidFiles) {
    mappings.push({
      label: `Перевод ${fileName}`,
      sourcePath: path.join(ORIGINAL_VOID_DIR, fileName),
      targetPath: path.join(TARGET_TRANSLATIONS_DIR, fileName)
    });
  }
  return mappings;
}

async function listJsonFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name);
}

async function syncFile({ label, sourcePath, targetPath }) {
  const source = await readJson(sourcePath);
  if (!isPlainObject(source)) {
    throw new Error(`Source file ${sourcePath} должен содержать JSON-объект на верхнем уровне.`);
  }

  const targetExists = await fileExists(targetPath);
  let target = null;
  let hadInvalidShape = false;
  if (targetExists) {
    const parsed = await readJson(targetPath);
    if (isPlainObject(parsed)) {
      target = parsed;
    } else {
      hadInvalidShape = true;
    }
  }

  const stats = {
    label,
    path: targetPath,
    created: !targetExists,
    added: [],
    removed: [],
    replaced: []
  };

  if (!targetExists || hadInvalidShape) {
    target = deepClone(source);
    stats.changed = true;
    if (hadInvalidShape) {
      stats.replaced.push("<root>");
    }
  } else {
    syncStructures(source, target, "", stats);
    const aligned = ADD_ONLY_MODE ? target : alignObjectOrder(source, target);
    const orderingChanged = JSON.stringify(aligned) !== JSON.stringify(target);
    target = aligned;
    stats.changed = orderingChanged || Boolean(stats.added.length || stats.removed.length || stats.replaced.length);
  }

  if (stats.changed) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, `${JSON.stringify(target, null, 2)}\n`, "utf-8");
  }

  return stats;
}

function syncStructures(source, target, prefix, stats) {
  const sourceKeys = new Set(Object.keys(source));

  for (const key of Object.keys(target)) {
    if (sourceKeys.has(key)) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (ADD_ONLY_MODE || shouldKeepExtraField(prefix, key)) continue;
    delete target[key];
    stats.removed.push(fullKey);
  }

  for (const key of Object.keys(source)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const sourceValue = source[key];
    const hasKey = Object.prototype.hasOwnProperty.call(target, key);

    if (!hasKey) {
      target[key] = deepClone(sourceValue);
      stats.added.push(fullKey);
      continue;
    }

    const targetValue = target[key];
    const sourceKind = getNodeKind(sourceValue);
    const targetKind = getNodeKind(targetValue);

    if (sourceKind === "object" && targetKind === "object") {
      syncStructures(sourceValue, targetValue, fullKey, stats);
      continue;
    }

    if (sourceKind !== targetKind) {
      target[key] = deepClone(sourceValue);
      stats.replaced.push(fullKey);
    }
  }
}

function alignObjectOrder(source, target) {
  if (!isPlainObject(source) || !isPlainObject(target)) {
    return target;
  }
  const ordered = {};
  for (const key of Object.keys(source)) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      ordered[key] = alignObjectOrder(source[key], target[key]);
    } else {
      ordered[key] = deepClone(source[key]);
    }
  }
  for (const key of Object.keys(target)) {
    if (Object.prototype.hasOwnProperty.call(ordered, key)) continue;
    ordered[key] = target[key];
  }
  return ordered;
}

function shouldKeepExtraField(prefix, key) {
  if (!prefix || !TOP_LEVEL_ENTRY_OPTIONAL_KEYS.has(key)) return false;
  const segments = prefix.split(".");
  if (segments.length !== 2) return false;
  return segments[0] === "entries";
}

function getNodeKind(value) {
  if (Array.isArray(value)) return "array";
  if (isPlainObject(value)) return "object";
  return "primitive";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepClone(val);
    }
    return result;
  }
  return value;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}


function logResult(result) {
  const relativePath = path.relative(BASE_DIR, result.path);
  if (!result.changed) {
    console.log(`✓ ${result.label} (${relativePath}) уже синхронизирован.`);
    return;
  }
  console.log(`• ${result.label} (${relativePath}) обновлён.`);
  if (result.created) {
    console.log("  - создан новый файл по образцу оригинала.");
  }
  if (result.added.length) {
    console.log(`  - добавлено ${result.added.length} ключей:`);
    for (const key of result.added) {
      console.log(`     · ${key}`);
    }
  }
  if (result.removed.length) {
    console.log(`  - удалено ${result.removed.length} ключей:`);
    for (const key of result.removed) {
      console.log(`     · ${key}`);
    }
  }
  if (result.replaced.length) {
    console.log(`  - заменено ${result.replaced.length} веток:`);
    for (const key of result.replaced) {
      console.log(`     · ${key}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
