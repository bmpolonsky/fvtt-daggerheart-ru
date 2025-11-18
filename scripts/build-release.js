#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");


const BASE_DIR = path.resolve(__dirname, "..");

// --- Настройки/константы ---
const MODULE_FOLDER = "module";
const RELEASE_ROOT = path.resolve(BASE_DIR, "release");
const RELEASE_MODULE_PATH = path.join(RELEASE_ROOT, MODULE_FOLDER);

// Что пакуем (поддерживаются файлы и папки)
const RELEASE_CONTENT = [
  "module.json",
  "i18n",
  "translations",
  "scripts/main.js",
  "styles/daggerheart-ru.css"
];
const IGNORED_STAGING_ITEMS = new Set([".DS_Store"]);

// --- Версия (CalVer: YYYY.MM.DD) ---
function todayCalVer() {
  const d = new Date();
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function toCalVer(input) {
  if (!input) return todayCalVer();
  // допускаем YYYY-MM-DD или YYYY.MM.DD
  let v = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = v.replace(/-/g, ".");
  if (!/^\d{4}\.\d{2}\.\d{2}(?:\.\d{1,2})?$/.test(v)) {
    throw new Error(`Неверный формат версии "${v}". Ожидаю YYYY.MM.DD[.NN]`);
  }
  return v;
}

const VERSION = toCalVer(process.argv[2] || new Date().toISOString().slice(0, 10));

// --- Пути ---
const MODULE_PATH = path.resolve(BASE_DIR, MODULE_FOLDER);
const MANIFEST_PATH = path.join(MODULE_PATH, "module.json");
const PACKAGE_JSON_PATH = path.join(BASE_DIR, "package.json");

// --- Утилиты ---
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

const ensureExists = (target, why) => {
  if (!fs.existsSync(target)) fail(why);
};

const copyRecursive = (src, dest) => {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (IGNORED_STAGING_ITEMS.has(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
};

// --- Шаги сборки ---
function readManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);
  if (!manifest.id) fail('В module.json нет поля "id"');
  return manifest;
}

function updateManifest(manifest, zipName) {
  // Обновляем версию
  manifest.version = VERSION;

  // Ставим "фиксированную" ссылку download на тег v<version>
  // Пример: https://github.com/<owner>/<repo>/releases/download/v2025.11.12/<zip>
  // Owner/Repo не шьём в коде — оставляем существующее значение, если оно кастомное.
  // Если download отсутствовал или вёл на latest — сформируем URL-шаблон для GitHub Releases текущего репо.
  const repoEnv = (process.env.GITHUB_REPOSITORY || "").trim(); // owner/repo (если запускаете в GitHub Actions)
  if (repoEnv) {
    manifest.download = `https://github.com/${repoEnv}/releases/download/v${VERSION}/${zipName}`;
  } else {
    // если скрипт запускается локально, а ссылку всё же хотим — попросим заполнить руками
    manifest.download = `https://github.com/bmpolonsky/fvtt-daggerheart-ru/releases/download/v${VERSION}/${zipName}`;
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log("📝 module.json обновлён (version, download)");
  return manifest;
}

function updatePackageJsonVersion() {
  ensureExists(PACKAGE_JSON_PATH, "package.json не найден в корне репозитория");
  const raw = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
  const pkg = JSON.parse(raw);
  pkg.version = VERSION;
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + "\n");
  console.log("📝 package.json обновлён (version)");
}

function stageReleaseContent() {
  // Пересобираем release/ с нуля
  fs.rmSync(RELEASE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(RELEASE_MODULE_PATH, { recursive: true });

  for (const relPath of RELEASE_CONTENT) {
    const src = path.join(MODULE_PATH, relPath);
    const dst = path.join(RELEASE_MODULE_PATH, relPath);
    ensureExists(src, `Release-элемент "${relPath}" не найден`);
    copyRecursive(src, dst);
  }
  console.log(`📂 Сформирована папка релиза: ${RELEASE_MODULE_PATH}`);
}

function zipReleaseFolder(zipName) {
  // Создаём архив прямо в release/
  const zipPath = path.join(RELEASE_ROOT, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  console.log(`📦 Упаковка ${RELEASE_MODULE_PATH} → ${zipPath}`);
  // Требуется системная утилита zip (macOS/Linux; в Windows — через Git Bash/WSL)
  execSync(`zip -r "${zipName}" "${MODULE_FOLDER}"`, {
    stdio: "inherit",
    cwd: RELEASE_ROOT,
  });

  return zipPath;
}

function main() {
  ensureExists(MODULE_PATH, `Папка ${MODULE_FOLDER} не найдена`);
  ensureExists(MANIFEST_PATH, "Файл module.json не найден в корне модуля");
  ensureExists(PACKAGE_JSON_PATH, "package.json не найден в корне репозитория");

  const initial = readManifest();

  // Имя архива по id и версии (без пробелов/экзотики)
  const safeId = String(initial.id).replace(/[^a-z0-9-_]/gi, "-");
  const ZIP_NAME = `${safeId}-v${VERSION}.zip`;

  // Обновляем manifest (version + download)
  const manifest = updateManifest(initial, ZIP_NAME);
  updatePackageJsonVersion();

  // Стадия релиза и упаковка
  stageReleaseContent();
  const zipPath = zipReleaseFolder(ZIP_NAME);

  // Итоговая памятка
  const repoEnv = (process.env.GITHUB_REPOSITORY || "bmpolonsky/fvtt-daggerheart-ru").trim();
  console.log(`\n✅ Готово!
К следующему шагу:
  1) Создайте тег:           v${VERSION}
  2) Откройте релиз:         https://github.com/${repoEnv}/releases/new?tag=v${VERSION}
  3) Прикрепите архив:       ${ZIP_NAME}
  4) Проверка manifest URL:  ${manifest.manifest || "(заполните поле manifest в module.json)"}

Папка релиза:
  ${RELEASE_MODULE_PATH}
Архив:
  ${zipPath}
`);
}

main();
