#!/usr/bin/env node

const fs = require("fs/promises");
const { existsSync } = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const BASE_DIR = path.resolve(__dirname, "..");
const TMP_DATA_DIR = path.join(BASE_DIR, "tmp_data");
const DAGGERHEART_REPO_DIR = path.join(TMP_DATA_DIR, "original-daggerheart");
const DAGGERHEART_REPO_URL = "https://github.com/Foundryborne/daggerheart";
const VOID_REPO_DIR = path.join(TMP_DATA_DIR, "the-void-unofficial");
const VOID_REPO_URL = "https://github.com/brunocalado/the-void-unofficial";
const VOID_PACKS_DIR = path.join(VOID_REPO_DIR, "packs");
const VOID_UNPACKED_DIR = path.join(TMP_DATA_DIR, "the-void-unofficial-json");
const VOID_MODULE_ID = "the-void-unofficial";
const VOID_PACK_NAMES = [
  "classes",
  "subclasses",
  "ancestries",
  "communities",
  "domains",
  "transformations",
  "weapons",
  "macros",
  "adversaries--environments"
];

const SKIP_REMOTE_UPDATE = process.env.SKIP_REMOTE_UPDATE === "1";
const SKIP_VOID_UPDATE = process.env.SKIP_VOID_UPDATE === "1";
const SKIP_VOID_UNPACK = process.env.SKIP_VOID_UNPACK === "1";

async function main() {
  await fs.mkdir(TMP_DATA_DIR, { recursive: true });
  await ensureDaggerheartRepo();
  await ensureVoidRepo();
  await unpackVoidPacks();
  console.log("Исходники обновлены.");
}

async function ensureDaggerheartRepo() {
  if (!existsSync(DAGGERHEART_REPO_DIR)) {
    console.log("Cloning Daggerheart source...");
    runGitCommand(["clone", DAGGERHEART_REPO_URL, path.basename(DAGGERHEART_REPO_DIR)], TMP_DATA_DIR);
    return;
  }
  if (SKIP_REMOTE_UPDATE) {
    console.log("Skipping Daggerheart source update (cached repo).");
    return;
  }
  console.log("Updating Daggerheart source...");
  runGitCommand(["-C", DAGGERHEART_REPO_DIR, "pull", "--ff-only"]);
}

async function ensureVoidRepo() {
  if (!existsSync(VOID_REPO_DIR)) {
    console.log("Cloning The Void source...");
    runGitCommand(["clone", VOID_REPO_URL, path.basename(VOID_REPO_DIR)], TMP_DATA_DIR);
    return;
  }
  if (SKIP_VOID_UPDATE) {
    console.log("Skipping The Void source update (cached repo).");
    return;
  }
  console.log("Updating The Void source...");
  runGitCommand(["-C", VOID_REPO_DIR, "pull", "--ff-only"]);
}

async function unpackVoidPacks() {
  await fs.mkdir(VOID_UNPACKED_DIR, { recursive: true });
  if (SKIP_VOID_UNPACK) {
    console.log("Skipping The Void pack unpacking (cached data).");
    return;
  }
  for (const packName of VOID_PACK_NAMES) {
    await unpackVoidPack(packName);
  }
}

async function unpackVoidPack(packName) {
  const outputDir = path.join(VOID_UNPACKED_DIR, packName);
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`Unpacking The Void pack ${packName}...`);
  const args = [
    "--yes",
    "@foundryvtt/foundryvtt-cli",
    "package",
    "unpack",
    packName,
    "--type",
    "Module",
    "--id",
    VOID_MODULE_ID,
    "--inputDirectory",
    VOID_PACKS_DIR,
    "--outputDirectory",
    outputDir,
    "--folders",
    "--clean"
  ];
  const result = spawnSync("npx", args, { cwd: BASE_DIR, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Failed to unpack ${packName} pack from The Void module.`);
  }
}

function runGitCommand(args, cwd = undefined) {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
