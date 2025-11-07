#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// === Настройки ===
const MODULE_FOLDER = "daggerheart-ru-ru";        // имя папки модуля
const VERSION = process.argv[2] || new Date().toISOString().slice(0, 10);       // версия передается аргументом

// === Пути ===
const ZIP_NAME = `${MODULE_FOLDER}.zip`;
const ZIP_PATH = path.resolve(ZIP_NAME);
const MANIFEST_PATH = path.resolve(MODULE_FOLDER, "module.json");

// === 1. Проверяем, что папка существует ===
if (!fs.existsSync(MODULE_FOLDER)) {
  console.error(`❌ Папка ${MODULE_FOLDER} не найдена`);
  process.exit(1);
}

// === 2. Упаковываем zip ===
console.log(`📦 Упаковка ${MODULE_FOLDER} → ${ZIP_NAME}`);
if (fs.existsSync(ZIP_PATH)) {
  fs.unlinkSync(ZIP_PATH);
}
execSync(`zip -r "${ZIP_PATH}" "${MODULE_FOLDER}"`, { stdio: "inherit" });

// === 3. Обновляем module.json ===
if (!fs.existsSync(MANIFEST_PATH)) {
  console.error("❌ Файл module.json не найден в корне");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
manifest.version = VERSION;

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log("📝 module.json обновлён: версия и ссылки скорректированы");

// === 4. Готово ===
console.log(`✅ Готово!
Добавь эти файлы в релиз GitHub:
  - ${ZIP_NAME}

Manifest URL:
  ${manifest.manifest}
`);
