#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(BASE_DIR, "original", "daggerheart.json");
const TARGET_PATH = path.join(BASE_DIR, "i18n", "systems", "daggerheart.json");

async function main() {
  const sourceRaw = await fs.readFile(SOURCE_PATH, "utf-8");
  const targetRaw = await fs.readFile(TARGET_PATH, "utf-8");
  const source = JSON.parse(sourceRaw);
  const target = JSON.parse(targetRaw);

  const added = [];
  mergeStructure(source, target, "", added);

  if (!added.length) {
    console.log("UI structure already up to date.");
    return;
  }

  await fs.writeFile(TARGET_PATH, `${JSON.stringify(target, null, 2)}\n`, "utf-8");
  console.log(`Added ${added.length} missing fields to daggerheart.json:`);
  for (const key of added) {
    console.log(`  · ${key}`);
  }
}

function mergeStructure(source, target, prefix, added) {
  if (!isPlainObject(source) || !isPlainObject(target)) return;
  for (const key of Object.keys(source)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const sourceValue = source[key];
    const targetHasKey = Object.prototype.hasOwnProperty.call(target, key);
    if (!targetHasKey) {
      target[key] = sourceValue;
      added.push(fullKey);
      continue;
    }
    if (isPlainObject(sourceValue) && isPlainObject(target[key])) {
      mergeStructure(sourceValue, target[key], fullKey, added);
    }
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
