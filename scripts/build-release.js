#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// --- Основные параметры ---
const MODULE_FOLDER = "daggerheart-ru-ru";
const VERSION = process.argv[2] || new Date().toISOString().slice(0, 10);
const MODULE_PATH = path.resolve(MODULE_FOLDER);
const MANIFEST_PATH = path.join(MODULE_PATH, "module.json");
const RELEASE_ROOT = path.resolve("release");
const RELEASE_MODULE_PATH = path.join(RELEASE_ROOT, MODULE_FOLDER);
const RELEASE_CONTENT = [
  "module.json",
  "i18n",
  "translations",
  "scripts/main.js",
];
const IGNORED_STAGING_ITEMS = new Set([".DS_Store"]);
const ZIP_NAME = `${MODULE_FOLDER}.zip`;
const ZIP_PATH = path.resolve(RELEASE_ROOT, ZIP_NAME);

// --- Утилиты ---
const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

const ensureExists = (target, errorMessage) => {
  if (!fs.existsSync(target)) {
    fail(errorMessage);
  }
};

const writeManifestVersion = () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  manifest.version = VERSION;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log("📝 module.json обновлён: версия и ссылки скорректированы");
  return manifest;
};

// Небольшой helper, чтобы копировать как файлы, так и директории.
const copyRecursive = (src, dest) => {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (IGNORED_STAGING_ITEMS.has(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
};

const stageReleaseContent = () => {
  // Пересобираем release/ с нуля, чтобы туда попали только нужные файлы.
  fs.rmSync(RELEASE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(RELEASE_MODULE_PATH, { recursive: true });

  for (const relativePath of RELEASE_CONTENT) {
    const source = path.join(MODULE_PATH, relativePath);
    const destination = path.join(RELEASE_MODULE_PATH, relativePath);

    ensureExists(source, `Release-элемент "${relativePath}" не найден`);
    copyRecursive(source, destination);
  }

  console.log(`📂 Сформирована чистая папка релиза: ${RELEASE_MODULE_PATH}`);
};

const zipReleaseFolder = () => {
  // Создаём архив прямо в release/, чтобы все артефакты лежали рядом.
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  console.log(`📦 Упаковка ${RELEASE_MODULE_PATH} → ${ZIP_PATH}`);
  execSync(`zip -r "${ZIP_PATH}" "${MODULE_FOLDER}"`, {
    stdio: "inherit",
    cwd: RELEASE_ROOT,
  });
};

const main = () => {
  ensureExists(MODULE_PATH, `Папка ${MODULE_FOLDER} не найдена`);
  ensureExists(MANIFEST_PATH, "Файл module.json не найден в корне модуля");

  const manifest = writeManifestVersion();
  stageReleaseContent();
  zipReleaseFolder();

  console.log(`✅ Готово!
Добавь эти файлы в релиз GitHub:
  - ${ZIP_NAME}

Manifest URL:
  ${manifest.manifest}
Папка релиза:
  ${RELEASE_MODULE_PATH}
`);
};

main();
