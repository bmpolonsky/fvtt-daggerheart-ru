import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(path.join(__dirname, ".."));

function createWorkspace() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "daggerheart-test-"));
  const tempModuleDir = path.join(tempRoot, "module");
  fs.cpSync(PROJECT_ROOT, tempRoot, { recursive: true });
  return { tempRoot, moduleDir: tempModuleDir };
}

function runUpdater(moduleDir) {
  execFileSync("node", ["../scripts/update_translations_full.js"], {
    cwd: moduleDir,
    env: {
      ...process.env,
      SKIP_API_REFRESH: "1",
      UPDATE_TRANSLATIONS_QUIET: "1"
    },
    stdio: "inherit"
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data));
}

function getActionDescription(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    return value.description || "";
  }
  return "";
}

function tmpDataPath(moduleDir, file, lang = "ru") {
  const modern = path.join(moduleDir, "..", "tmp_data", "api", lang, file);
  if (fs.existsSync(modern)) return modern;
  return path.join(moduleDir, "..", "tmp_data", "api", file);
}

function withWorkspace(testFn) {
  const { tempRoot, moduleDir } = createWorkspace();
  return async (t) => {
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
    await testFn({ moduleDir });
  };
}

test(
  "domain actions reflect modified API text",
  withWorkspace(async ({ moduleDir }) => {
    const ruDomainPath = tmpDataPath(moduleDir, "domain-card.json");
    const ruDomainData = readJson(ruDomainPath);
    const domainEntry = ruDomainData.data.find((item) => item.slug === "adjust-reality");
    assert.ok(domainEntry, "Adjust Reality domain is present in cache");
    const newBody = "Тестовое описание для обновления действий домена.";
    domainEntry.main_body = newBody;
    writeJson(ruDomainPath, ruDomainData);

    runUpdater(moduleDir);

    const domains = readJson(path.join(moduleDir, "translations", "daggerheart.domains.json"));
    const actionHtml = getActionDescription(
      domains.entries["Adjust Reality"].actions["3Aiqds9jVXdlWmfm"]
    );
    assert.ok(actionHtml.includes("Тестовое описание"), "domain action HTML must update");
  })
);

test(
  "domain multi-action splitting keeps per-feature text",
  withWorkspace(async ({ moduleDir }) => {
    const ruDomainPath = tmpDataPath(moduleDir, "domain-card.json");
    const ruDomainData = readJson(ruDomainPath);
    const book = ruDomainData.data.find((item) => item.slug === "book-of-ava");
    assert.ok(book, "Book of Ava domain exists");
    const markerA = "Маркер действий А";
    const markerB = "Маркер действий B";
    book.features[0].main_body = markerA;
    book.features[1].main_body = markerB;
    writeJson(ruDomainPath, ruDomainData);

    runUpdater(moduleDir);

    const domains = readJson(path.join(moduleDir, "translations", "daggerheart.domains.json"));
    const actions = Object.values(domains.entries["Book of Ava"].actions || {}).map((value) =>
      getActionDescription(value)
    );
    assert.ok(actions.some((html) => html.includes(markerA)), "first marker present in actions");
    assert.ok(actions.some((html) => html.includes(markerB)), "second marker present in actions");
  })
);

test(
  "environment item descriptions update while manual actions remain untouched",
  withWorkspace(async ({ moduleDir }) => {
    const envPath = tmpDataPath(moduleDir, "environment.json");
    const envData = readJson(envPath);
    const envEntry = envData.data.find((item) => item.slug === "abandoned-grove");
    assert.ok(envEntry, "Abandoned Grove environment is present in cache");
    const marker = "Специальное описание окружения для автотеста.";
    envEntry.features[1].main_body = marker;
    writeJson(envPath, envData);

    const translationsPath = path.join(moduleDir, "translations", "daggerheart.environments.json");
    const beforeTranslations = readJson(translationsPath);
    const baselineActions = {};
    Object.entries(beforeTranslations.entries["Abandoned Grove"].items || {}).forEach(([itemId, item]) => {
      baselineActions[itemId] = { ...(item.actions || {}) };
    });

    runUpdater(moduleDir);

    const environments = readJson(translationsPath);
    const updatedEntry = environments.entries["Abandoned Grove"];
    const descMatches = Object.values(updatedEntry.items || {}).some((item) => (item.description || "").includes(marker));
    assert.ok(descMatches, "environment item descriptions must reflect updated feature text");
    Object.entries(updatedEntry.items || {}).forEach(([itemId, item]) => {
      assert.deepEqual(item.actions || {}, baselineActions[itemId] || {}, "environment actions should remain manual");
    });
  })
);

test(
  "environment manual action text is preserved across updater runs",
  withWorkspace(async ({ moduleDir }) => {
    const translationsPath = path.join(moduleDir, "translations", "daggerheart.environments.json");
    const before = readJson(translationsPath);
    const baselineAsh = before.entries["Burning Heart of the Woods"].items.kYxuTZjH7HDUGeWh.actions;
    const baselineCliff = before.entries["Cliffside Ascent"].items.EP4FXeQqbqFGQoIX.actions;

    runUpdater(moduleDir);

    const after = readJson(translationsPath);
    assert.deepEqual(
      after.entries["Burning Heart of the Woods"].items.kYxuTZjH7HDUGeWh.actions,
      baselineAsh,
      "Choking Ash actions should stay untouched"
    );
    assert.deepEqual(
      after.entries["Cliffside Ascent"].items.EP4FXeQqbqFGQoIX.actions,
      baselineCliff,
      "Cliffside Ascent actions should stay untouched"
    );
  })
);

test(
  "environment descriptions dedupe duplicate secret paragraphs",
  withWorkspace(async ({ moduleDir }) => {
    const translationsPath = path.join(moduleDir, "translations", "daggerheart.environments.json");
    const beforeTranslations = readJson(translationsPath);
    const baselineDesc =
      beforeTranslations.entries["Raging River"].items["4ILX7BCinmsGqrJM"].description;

    const envPath = tmpDataPath(moduleDir, "environment.json");
  const envData = readJson(envPath);
  const ragingRiver = envData.data.find((item) => item.slug === "raging-river");
  assert.ok(ragingRiver, "Raging River environment exists in cache");
  const targetFeature =
    ragingRiver.features.find((feature) => feature.name.toLowerCase().includes("переправа")) ||
    ragingRiver.features[0];
  assert.ok(targetFeature, "Raging River must contain at least one feature");
    targetFeature.main_body =
      "Чтобы переправиться через реку, группа должна продвинуть Отсчёт прогресса (4). Персонаж, который провалил бросок со Страхом, немедленно становится целью действия «Подводное течение», и для этого не требуется тратить Страх на это свойство.\n\n*Кто-нибудь из персонажей уже переправлялся через реку таким образом? Кто-нибудь из них боится утонуть?*";
    writeJson(envPath, envData);

    runUpdater(moduleDir);

    const afterTranslations = readJson(translationsPath);
    const updatedDesc =
      afterTranslations.entries["Raging River"].items["4ILX7BCinmsGqrJM"].description;
    assert.equal(
      updatedDesc,
      baselineDesc,
      "description should remain identical after deduplication"
    );
  })
);

test(
  "adversary feature changes propagate into translated items",
  withWorkspace(async ({ moduleDir }) => {
    const adversaryPath = tmpDataPath(moduleDir, "adversary.json");
    const adversaryData = readJson(adversaryPath);
    const ooze = adversaryData.data.find((item) => item.slug === "red-ooze");
    assert.ok(ooze, "Red Ooze entry exists");
    const marker = "Новое описание способности противника";
    ooze.features[1].main_body = marker;
    writeJson(adversaryPath, adversaryData);

    runUpdater(moduleDir);

    const adversaries = readJson(path.join(moduleDir, "translations", "daggerheart.adversaries.json"));
    const updatedOoze = adversaries.entries["Red Ooze"];
    const descriptions = Object.values(updatedOoze.items || {}).map((item) => item.description || "");
    assert.ok(descriptions.some((html) => html.includes(marker)), "adversary item description should change");
  })
);

test(
  "beastform advantage list is regenerated from ru API values",
  withWorkspace(async ({ moduleDir }) => {
    const beastPath = tmpDataPath(moduleDir, "beastform.json");
    const beastData = readJson(beastPath);
    const beastEntry = beastData.data.find((item) => item.slug === "agile-scout");
    assert.ok(beastEntry, "Agile Scout beastform must exist in cache");
    beastEntry.advantages = "полету, рывке";
    writeJson(beastPath, beastData);

    runUpdater(moduleDir);

    const beastforms = readJson(path.join(moduleDir, "translations", "daggerheart.beastforms.json"));
    assert.deepEqual(beastforms.entries["Agile Scout"].advantageOn, ["Полету", "Рывке"]);
  })
);

test(
  "class descriptions update from API text",
  withWorkspace(async ({ moduleDir }) => {
    const classPath = tmpDataPath(moduleDir, "class.json");
    const classData = readJson(classPath);
    const bard = classData.data.find((item) => item.slug === "bard");
    assert.ok(bard, "Bard class entry exists");
    const marker = "Тестовое описание класса Бард.";
    bard.description = marker;
    writeJson(classPath, classData);

    runUpdater(moduleDir);

    const classes = readJson(path.join(moduleDir, "translations", "daggerheart.classes.json"));
    assert.ok(classes.entries["Bard"].description.includes(marker), "class description should refresh");
  })
);

test(
  "equipment mapping (Elundrian Chain Armor) refreshes description",
  withWorkspace(async ({ moduleDir }) => {
    const equipmentPath = tmpDataPath(moduleDir, "equipment.json");
    const equipmentData = readJson(equipmentPath);
    const elundrian = equipmentData.data.find((item) => item.slug === "elundrian-chain-armor");
    assert.ok(elundrian, "Elundrian Chain Armor exists");
    const marker = "Описание брони для проверки алиаса.";
    elundrian.features = [
      {
        id: 1,
        name: "Особенность",
        main_body: marker
      }
    ];
    writeJson(equipmentPath, equipmentData);

    runUpdater(moduleDir);

    const armors = readJson(path.join(moduleDir, "translations", "daggerheart.armors.json"));
    assert.ok(
      armors.entries["Elundrian Chain Armor"].description.includes(marker),
      "armor description must use updated feature text"
    );
  })
);

test(
  "Bare Bones domain always appends manual snippet",
  withWorkspace(async ({ moduleDir }) => {
    const domainPath = tmpDataPath(moduleDir, "domain-card.json");
    const domainData = readJson(domainPath);
    const bareBones = domainData.data.find((item) => item.slug === "bare-bones");
    assert.ok(bareBones, "Bare Bones entry exists");
    bareBones.main_body = "<p>Тестовое описание Bare Bones без ссылки.</p>";
    writeJson(domainPath, domainData);

    runUpdater(moduleDir);

    const domains = readJson(path.join(moduleDir, "translations", "daggerheart.domains.json"));
    const desc = domains.entries["Bare Bones"].description;
    assert.ok(
      desc.includes("Compendium.daggerheart.armors.Item.ITAjcigTcUw5pMCN"),
      "Bare Bones description must contain manual armor snippet"
    );
  })
);

test(
  "label overrides restore canonical labels",
  withWorkspace(async ({ moduleDir }) => {
    const target = path.join(moduleDir, "translations", "daggerheart.ancestries.json");
    const data = readJson(target);
    data.label = "TEMP LABEL";
    writeJson(target, data);

    runUpdater(moduleDir);

    const refreshed = readJson(target);
    assert.equal(refreshed.label, "Родословные");
  })
);

test(
  "action overrides take precedence over API text",
  withWorkspace(async ({ moduleDir }) => {
    const subclassPath = tmpDataPath(moduleDir, "subclass.json");
    const subclassData = readJson(subclassPath);
    const elementalist = subclassData.data.find((item) => item.slug === "warden-of-the-elements");
    assert.ok(elementalist, "Elementalist subclass entry exists");
    const marker = "Новый текст, который должен быть переопределен.";
    elementalist.foundation_features[0].main_body = marker;
    writeJson(subclassPath, subclassData);

    runUpdater(moduleDir);

    const subclasses = readJson(path.join(moduleDir, "translations", "daggerheart.subclasses.json"));
    const elementalistEntry = subclasses.entries["Elementalist"];
    const actionHtml = getActionDescription(elementalistEntry.actions["rxuFLfHP1FILDpds"]);
    assert.ok(
      actionHtml.includes("Потратьте Надежду"),
      "override text should remain in place for Elementalist action"
    );
    assert.ok(!actionHtml.includes(marker), "API marker text must not leak into overridden action");
  })
);
