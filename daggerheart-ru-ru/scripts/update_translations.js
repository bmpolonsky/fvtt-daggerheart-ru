#!/usr/bin/env node

/**
 * Скрипт для обновления русских переводов Daggerheart.
 * Он получает данные напрямую с API сайта daggerheart.su и обновляет
 * JSON файлы в директории daggerheart-ru-ru/translations.
 *
 */

// Подключение встроенных модулей Node.js для работы с файловой системой и путями.
const fs = require("fs/promises");
const path = require("path");

// Список эндпоинтов API, с которых будут загружаться данные.
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

// Ручные переопределения для названий предметов классов, которые сложно сопоставить автоматически.
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
 * Ручные переопределения для HTML-содержимого отдельных действий (actions).
 * Используется в случаях, когда API отдает одну большую способность,
 * а в системе Foundry она должна быть разделена на несколько отдельных действий.
 */
const ACTION_OVERRIDES = {
  // Elementalist foundation: flavour text split into two separate actions.
  rxuFLfHP1FILDpds:
    "<p><strong>Потратьте Надежду</strong>, опишите, как контроль над вашей стихией помогает в броске действия, который вы собираетесь сделать, и получите +2 к броску действия.</p>",
  S7HvFD3qIR3ifJRL:
    "<p><strong>Потратьте Надежду</strong>, опишите, как контроль над вашей стихией помогает в броске действия, который вы собираетесь сделать, и получите +3 к броску урона.</p>",

  // Sparing Touch split: healing HP vs Stress.
  aanLNQkeO2ZTIqBl:
    "<p>Один раз до следующего Продолжительного отдыха коснитесь существа и очистите ему 2 Раны.</p>",
  cWdzCQJv8RFfi2NR:
    "<p>Один раз до следующего Продолжительного отдыха коснитесь существа и очистите ему 2 Стресса.</p>",

  // Weapon Specialist split.
  "vay9rVXJS3iksaVR": "<p>Вы владеете многими видами оружия с ужасающей легкостью. Когда вы преуспеваете в атаке, вы можете <strong>потратить Надежду</strong>, чтобы добавить одну из костей урона от вашего вторичного оружия к Броску Урона.</p>",
  "1bBFfxmywJpx5tfk": "<p>Кроме того, один раз до следующего Продолжительного отдыха, когда вы бросаете Кости Истребления, перебросьте любые выпавшие <strong>1</strong>.</p>",

  // Wings of Light split.
  rg2sLCTqY2rTo861:
    "<p><strong>Отметьте Стресс</strong>, чтобы во время полёта поднять и нести союзника вашего размера или меньше.</p>",
  "1qjnoz5I7NqrWMkp":
    "<p><strong>Потратьте Надежду</strong>, чтобы нанести дополнительный <strong>1d8</strong> урона при успешной атаке в полёте.</p>"
};

// Генераторы действий для способностей, которые описаны списком.
// Ключ - ID способности из API.
const FEATURE_ACTION_GENERATORS = {
  147: generateBulletActions,
  159: generateBulletActions,
  160: generateBulletActions,
  161: generateBulletActions
};

const ADVERSARY_FEATURE_RENDERERS = {
  1599: renderBattleBoxRandomTactics
};

// Алиасы для нормализации названий подклассов (исправление опечаток в API или системе).
const SUBCLASS_NAME_ALIASES = {
  comaraderie: "camaraderie",
  partnerinarms: "partnersinarms"
};

// Дубликаты ключей для подклассов (чтобы одна и та же запись была доступна под разными ключами).
const SUBCLASS_DUPLICATE_KEYS = {
  "Comaraderie": "Camaraderie",
  "Partner-in-Arms": "Partners-in-Arms"
};

// Алиасы для названий снаряжения.
const EQUIPMENT_NAME_ALIASES = {
  elundrianchainmail: "elundrianchainarmor"
};

// Алиасы для названий способностей.
const FEATURE_NAME_ALIASES = {
  unshakeable: "unshakable"
};

const BARE_BONES_DOMAIN_SNIPPET =
  "<p>Наденьте указанные ниже доспехи, чтобы использовать эту способность.</p><p>@UUID[Compendium.daggerheart.armors.Item.ITAjcigTcUw5pMCN]{Без доспехов}</p>";

// Ручные переопределения для брони.
const ARMOR_OVERRIDES = {
  "Bare Bones": {
    name: "Без доспехов",
    description: "<p>Благодаря карте домена <strong>«Ничего лишнего»</strong>, пока на вас не экипирована броня, ваш базовый Показатель Брони равен 3 + ваша Сила, а также вы используете следующие значения как ваши базовые пороги урона:</p><ul><li><strong><em>Ранг 1:</em></strong> 9/19</li><li><strong><em>Ранг 2:</em></strong> 11/24</li><li><strong><em>Ранг 3:</em></strong> 13/31</li><li><strong><em>Ранг 4:</em></strong> 15/38</li></ul>"
  }

};

// Устаревшие ключи родословных, которые нужно игнорировать.
const LEGACY_ANCESTRY_KEYS = new Set(["Fearless", "Unshakeable"]);

// Ручные переопределения для поля "label" в JSON-файлах.
const LABEL_OVERRIDES = {
  "daggerheart.ancestries.json": "Родословные",
  "daggerheart.beastforms.json": "Звериные формы",
  "daggerheart.consumables.json": "Расходники",
  "daggerheart.environments.json": "Окружения"
};

// Сопоставление названий из API с именами файлов локализации.
const TRANSLATION_FILES = {
  classes: "daggerheart.classes.json",
  subclasses: "daggerheart.subclasses.json",
  ancestries: "daggerheart.ancestries.json",
  communities: "daggerheart.communities.json",
  domains: "daggerheart.domains.json",
  weapons: "daggerheart.weapons.json",
  armors: "daggerheart.armors.json",
  loot: "daggerheart.loot.json",
  consumables: "daggerheart.consumables.json",
  beastforms: "daggerheart.beastforms.json",
  adversaries: "daggerheart.adversaries.json",
  environments: "daggerheart.environments.json"
};

// Регулярные выражения для очистки HTML и Markdown.
const HTML_LINK_RE = /<a\s+[^>]*>(.*?)<\/a>/gis;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const CLASS_ATTR_RE = /\sclass="[^"]*"/gi;
const HASH_PLACEHOLDER_RE = /#\{([^}]+)\}#/g;

// Определение базовых директорий проекта.
const BASE_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(BASE_DIR, "tmp_data"); // Временная папка для скачанных данных
const TRANSLATIONS_DIR = path.join(BASE_DIR, "translations"); // Папка с файлами переводов

/**
 * Нормализует текст для использования в качестве ключа:
 * приводит к нижнему регистру, удаляет знаки препинания и пробелы.
 * @param {string} text - Исходный текст.
 * @returns {string|null} Нормализованный ключ.
 */
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

const DOMAIN_ACTION_SPLITTERS = (() => {
  const map = {};
  const add = (name, config) => {
    const norm = normalize(name);
    if (!norm) return;
    map[norm] = config;
  };

  add("Chain Lightning", {
    forceUnique: true,
    split: ({ markdown }) => splitMarkdownWithRegex(markdown, /(?=Дополнительные|Additional\s+targets?)/i)
  });

  add("Chokehold", {
    forceUnique: true,
    split: ({ markdown }) => splitMarkdownParagraphs(markdown)
  });

  add("Cinder Grasp", {
    forceUnique: true,
    split: ({ markdown }) => splitMarkdownParagraphs(markdown)
  });

  add("Codex-Touched", {
    forceUnique: true,
    split: ({ markdown }) => splitIntroWithBullets(markdown)
  });

  return map;
})();

// Вспомогательная функция для разрешения алиасов.
function resolveAlias(norm, aliases) {
  if (!norm) return norm;
  return aliases[norm] || norm;
}

// Нормализует текст: убирает лишние переносы строк и пробелы.
function normaliseText(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").trim();
}

/**
 * Удаляет из текста HTML/Markdown ссылки и лишние HTML-атрибуты.
 * @param {string} text - Исходный HTML или Markdown.
 * @returns {string} Очищенный текст.
 */
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
  result = result.replace(/[ \t]+([,.;:!?])/g, "$1");
  result = result.replace(/[ \t]{2,}/g, " ");
  return result;
}

// Обертка над stripLinks для полной "санитизации" HTML.
function sanitizeHtml(text) {
  if (text === null || text === undefined) return text;
  return stripLinks(text);
}

// Очищает название от ссылок и лишних пробелов.
function sanitizeName(text) {
  if (text === null || text === undefined) return text;
  return stripLinks(text).trim();
}

function stripLeadingStrongLabel(html) {
  if (!html) return html;
  return html.replace(/^<p><strong>[^<]+?\.<\/strong>\s*/i, "<p>");
}

function normalizeMarkdownSource(markdown) {
  if (!markdown) return "";
  return markdown.replace(/\r\n/g, "\n").trim();
}

function renderMarkdownSegments(segments, desiredCount) {
  if (!segments || !segments.length) return [];
  let chunks = segments
    .map((segment) => (segment || "").trim())
    .filter(Boolean)
    .map((segment) => markdownToHtml(segment));
  if (!chunks.length) return [];
  if (desiredCount && desiredCount > 0) {
    if (chunks.length > desiredCount) {
      chunks = chunks.slice(0, desiredCount);
    } else if (chunks.length < desiredCount) {
      const filler = chunks[chunks.length - 1];
      while (chunks.length < desiredCount) {
        chunks.push(filler);
      }
    }
  }
  return chunks;
}

function splitMarkdownWithRegex(markdown, regex) {
  const source = normalizeMarkdownSource(markdown);
  if (!source) return [];
  const parts = source.split(regex).map((part) => part.trim()).filter(Boolean);
  return parts;
}

function splitMarkdownParagraphs(markdown) {
  const source = normalizeMarkdownSource(markdown);
  if (!source) return [];
  return source.split(/\n\s*\n+/).map((chunk) => chunk.trim()).filter(Boolean);
}

function splitIntroWithBullets(markdown) {
  const source = normalizeMarkdownSource(markdown);
  if (!source) return [];
  const firstBulletIndex = source.search(/-\s+/);
  if (firstBulletIndex === -1) return [];
  const intro = source.slice(0, firstBulletIndex).trim();
  const bulletsBlock = source.slice(firstBulletIndex);
  const bulletRegex = /-\s+[\s\S]*?(?=\n-\s+|\n*$)/g;
  const matches = bulletsBlock.match(bulletRegex);
  if (!matches || !matches.length) return [];
  return matches.map((bullet) => {
    const cleaned = bullet.trim();
    const prefix = intro ? `${intro}\n\n${cleaned}` : cleaned;
    return prefix;
  });
}

// Регулярные выражения для поиска специфичных для Foundry VTT тегов.
const TEMPLATE_TAG_RE = /@Template\[[^\]]+\]/gi; // @Template[type:cone|distance:30]
const INLINE_ROLL_RE = /\[\[\/([a-z]+)\s*([^\]]+)\]\]/gi; // [[/r 1d6]]
const UUID_TAG_RE = /@UUID\[([^\]]+)\]\{([^}]*)\}/gi; // @UUID[...]{label}
const SECRET_SECTION_RE = /<section\b[^>]*class=['"][^'"]*\bsecret\b[^'"]*['"][^>]*>[\s\S]*?<\/section>/gi; // <section class="secret">...</section>

// Экранирует строку для использования в регулярном выражении.
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Пытается перенести технические теги Foundry из старого HTML в новый.
 * ВАЖНО: Эта функция не идеальна и может давать сбои.
 * @param {string} oldHtml - Старый HTML, содержащий теги.
 * @param {string} newHtml - Новый HTML, куда нужно перенести теги.
 * @returns {string} Новый HTML с (надеюсь) перенесенными тегами.
 */
function mergeFoundryTags(oldHtml, newHtml) {
  if (!newHtml) return newHtml;
  const source = oldHtml || "";
  let result = newHtml;

  // Обработка тегов @Template
  // Логика: находит все @Template теги в старом тексте и, если их нет в новом,
  // добавляет их в конце. Это может привести к тому, что тег окажется не на своем месте.
  const templateMatches = Array.from(source.matchAll(TEMPLATE_TAG_RE));
  if (templateMatches.length) {
    const appended = [];
    const seen = new Set();
    for (const match of templateMatches) {
      const tag = match[0];
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      if (!result.includes(tag)) {
        appended.push(`<p>${tag}</p>`);
      }
    }
    if (appended.length) {
      result = result.replace(/\s*$/, "") + appended.join("");
    }
  }

  // Обработка инлайн-бросков [[/r ...]]
  const inlineMatches = Array.from(source.matchAll(INLINE_ROLL_RE));
  const appendedRolls = [];
  const appendedRollSet = new Set();
  for (const match of inlineMatches) {
    const full = match[0];
    const expr = (match[2] || "").trim();
    if (!expr || result.includes(full)) continue;
    // Пытается найти текст броска в новом HTML и заменить его полной версией тега.
    const regex = new RegExp(escapeRegExp(expr), "i");
    if (regex.test(result)) {
      result = result.replace(regex, full);
      continue;
    }
    // Если не нашел, добавляет в конец.
    if (!result.includes(full)) {
      if (!appendedRollSet.has(full)) {
        appendedRollSet.add(full);
        appendedRolls.push(`<p>${full}</p>`);
      }
    }
  }
  if (appendedRolls.length) {
    result = result.replace(/\s*$/, "") + appendedRolls.join("");
  }

  // Обработка ссылок на документы @UUID
  // Логика: ищет текст ссылки (label) из старого тега в новом HTML.
  // Если находит, "оборачивает" его обратно в тег.
  // ОШИБКА: Если текст ссылки в переводе изменился, сопоставление не сработает и тег пропадет.
  const uuidMatches = Array.from(source.matchAll(UUID_TAG_RE));
  for (const match of uuidMatches) {
    const full = match[0];
    const path = match[1];
    const label = (match[2] || "").trim();
    if (!path || !label || result.includes(full)) continue;
    const regex = new RegExp(escapeRegExp(label));
    if (regex.test(result)) {
      result = result.replace(regex, `@UUID[${path}]{${label}}`);
    }
  }

  // Обработка секретных секций
  const secretMatches = Array.from(source.matchAll(SECRET_SECTION_RE));
  if (secretMatches.length) {
    const appended = [];
    const seen = new Set();
    for (const match of secretMatches) {
      const block = (match[0] || "").trim();
      if (!block || seen.has(block)) continue;
      seen.add(block);
      if (result.includes(block)) continue;
      const contentMatch = block.match(/^<section[^>]*>([\s\S]*?)<\/section>$/i);
      const content = contentMatch ? contentMatch[1] : "";
      const inner = content.trim();
      if (inner) {
        const idx = result.indexOf(inner);
        if (idx !== -1) {
          const matched = result.slice(idx, idx + inner.length);
          const newBlock = block.replace(/>([\s\S]*?)<\/section>/i, `>${matched}</section>`);
          result = `${result.slice(0, idx)}${newBlock}${result.slice(idx + inner.length)}`;
          continue;
        }
      }
      const questionMatch = result.match(/(<p[^>]*><em>[\s\S]*?<\/em><\/p>)\s*$/i);
      if (questionMatch) {
        const question = questionMatch[1];
        const newBlock = block.replace(/>([\s\S]*?)<\/section>/i, `>${question}</section>`);
        result = result.replace(/(<p[^>]*><em>[\s\S]*?<\/em><\/p>)\s*$/i, `${newBlock}`);
        continue;
      }
      const paragraphMatch = result.match(/(<p[^>]*>[\s\S]*?<\/p>)\s*$/i);
      if (paragraphMatch) {
        const paragraph = paragraphMatch[1];
        const newBlock = block.replace(/>([\s\S]*?)<\/section>/i, `>${paragraph}</section>`);
        result = result.replace(/(<p[^>]*>[\s\S]*?<\/p>)\s*$/i, `${newBlock}`);
        continue;
      }
      appended.push(block);
    }
    if (appended.length) {
      result = result.replace(/\s*$/, "") + appended.join("");
    }
  }

  return result;
}

// Проверяет, есть ли в HTML видимый текст.
function hasVisibleText(html) {
  if (typeof html !== "string") return false;
  const plain = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return plain.length > 0;
}

/**
 * Устанавливает значение HTML-поля в объекте, предварительно очистив его
 * и попытавшись перенести теги Foundry.
 * @param {object} target - Целевой объект (например, entry.actions).
 * @param {string} key - Ключ в объекте.
 * @param {string} html - Новое HTML-содержимое.
 */
function setHtmlField(target, key, html) {
  if (!target) return;
  if (html === null || html === undefined) {
    delete target[key];
    return;
  }
  const sanitized = sanitizeHtml(html);
  if (!sanitized) {
    delete target[key];
    return;
  }
  const merged = mergeFoundryTags(target[key], sanitized);
  if (!hasVisibleText(merged)) {
    delete target[key];
    return;
  }
  target[key] = merged;
}

// Вспомогательная функция, которая убирает тег <p> вокруг текста, если он единственный.
function unwrapSingleParagraph(html) {
  if (!html) return html;
  const match = html.match(/^<p>(.*)<\/p>$/is);
  if (match) {
    return match[1];
  }
  return html;
}

/**
 * Генерирует HTML-описание из массива способностей (features).
 * Если способность одна, возвращает ее описание.
 * Если несколько — создает сводку вида "<p><strong>Название:</strong> Описание</p>".
 * @param {Array} features - Массив объектов способностей из API.
 * @returns {string|null} Сгенерированный HTML.
 */
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
  return name.replace(/\s*[-–—]\s*(?:action|reaction|passive|действие|реакция|пассив[^\s]*)$/iu, "").trim();
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

function renderBattleBoxRandomTactics(feature) {
  if (!feature || !feature.main_body) return null;
  const source = feature.main_body.replace(/\r\n/g, "\n").trim();
  if (!source) return null;

  const introText = source.split(/\n-\s/)[0]?.trim() || "";
  const introHtml = introText ? markdownToHtml(introText) : "";

  const items = Array.from(source.matchAll(/-\s+\*\*(.+?)\*\*/g))
    .map((match) => {
      const rawName = match[1] ? match[1].replace(/\.+$/, "").trim() : "";
      const name = sanitizeName(rawName);
      return name ? `<li><p><strong>${name}</strong></p></li>` : null;
    })
    .filter(Boolean);

  const listHtml = items.length ? `<ol>${items.join("")}</ol>` : "";
  const combined = `${introHtml || ""}${listHtml}`;
  return combined || null;
}

function applyFeatureToItemEntry(itemEntry, feature) {
  if (!itemEntry || !feature) return;
  const cleanedName = sanitizeName(cleanAdversaryItemName(feature.name || ""));
  if (cleanedName) {
    itemEntry.name = cleanedName;
  }
  const customRenderer = ADVERSARY_FEATURE_RENDERERS[feature.id];
  const body =
    customRenderer !== null && customRenderer !== undefined
      ? customRenderer(feature)
      : markdownToHtml(feature.main_body || "");
  if (body) {
    setHtmlField(itemEntry, "description", body);
    if (itemEntry.actions) {
      for (const actionId of Object.keys(itemEntry.actions)) {
        setHtmlField(itemEntry.actions, actionId, body);
      }
    }
  } else {
    delete itemEntry.description;
  }
}

function applyBattleBoxOverrides(entry, raw) {
  if (!entry || !raw) return;
  const items = entry.items || {};
  const itemKeys = Object.keys(items);
  if (itemKeys.length < 2) return;
  const features = raw.features || [];
  if (features.length < 2) return;

  const unstoppable = features[0];
  const randomTactics = features[1];
  const overload = features[2];
  const deathQuake = features[3];

  const unstoppableItem = items[itemKeys[0]];
  if (unstoppableItem) {
    applyFeatureToItemEntry(unstoppableItem, unstoppable);
  }

  const randomItem = items[itemKeys[1]];
  if (randomItem) {
    applyFeatureToItemEntry(randomItem, randomTactics);
  }

  const bulletHtml = generateBulletActions(randomTactics) || [];
  const bulletTargets = itemKeys.slice(2, 2 + bulletHtml.length);
  for (let i = 0; i < bulletTargets.length; i += 1) {
    const html = stripLeadingStrongLabel(bulletHtml[i]);
    if (!html) continue;
    const target = items[bulletTargets[i]];
    if (!target) continue;
    setHtmlField(target, "description", html);
    if (target.actions) {
      for (const actionId of Object.keys(target.actions)) {
        setHtmlField(target.actions, actionId, html);
      }
    }
  }

  if (overload) {
    const overloadItem = items[itemKeys[itemKeys.length - 2]];
    if (overloadItem) {
      applyFeatureToItemEntry(overloadItem, overload);
    }
  }

  if (deathQuake) {
    const deathQuakeItem = items[itemKeys[itemKeys.length - 1]];
    if (deathQuakeItem) {
      applyFeatureToItemEntry(deathQuakeItem, deathQuake);
    }
  }
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
    setHtmlField(entry.actions, ids[i], html);
  }
}

/**
 * Общая функция для обновления одной способности (feature).
 * @param {object} entry - Запись для обновления.
 * @param {object} featureInfo - Информация о способности из API.
 */
function _updateFeature(entry, featureInfo) {
  if (!featureInfo) return;
  if (featureInfo.name) {
    entry.name = sanitizeName(featureInfo.name);
  }
  if (featureInfo.description !== null && featureInfo.description !== undefined) {
    if (featureInfo.description) {
      setHtmlField(entry, "description", featureInfo.description);
      if (entry.actions) {
        for (const actionId of Object.keys(entry.actions)) {
          setHtmlField(entry.actions, actionId, featureInfo.description);
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

function buildFeatureMap(enEntries, ruBySlug, fields, sourceLabel, targetMap, featureSources, conflicts) {
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

        if (targetMap[key]) {
          const existing = targetMap[key];
          if (candidate.description && existing.description && candidate.description !== existing.description) {
            conflicts.add(`${nameEn}|||${sourceLabel}|||${featureSources[key]}`);
          }
          continue;
        }

        targetMap[key] = candidate;
        featureSources[key] = sourceLabel;
      }
    }
  }
}

function enFeatureName(feature) {
  return feature.name || "";
}

function buildTopLevelMap(enEntries, ruEntries, descriptionFields, mainField = null, options = {}) {
  const { processMainField } = options;
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

    const descRuParts = [];
    const descEnParts = [];
    const collectPart = (value, target) => {
      if (!value) return;
      const trimmed = String(value).trim();
      if (trimmed) target.push(trimmed);
    };
    for (const field of descriptionFields) {
      collectPart(ruEntry[field], descRuParts);
      collectPart(enEntry[field], descEnParts);
    }
    if (mainField) {
      const ruValueRaw = ruEntry[mainField];
      const enValueRaw = enEntry[mainField];
      const ruValue = processMainField
        ? processMainField({ entry: ruEntry, value: ruValueRaw, locale: "ru" })
        : ruValueRaw;
      const enValue = processMainField
        ? processMainField({ entry: enEntry, value: enValueRaw, locale: "en" })
        : enValueRaw;
      collectPart(ruValue, descRuParts);
      collectPart(enValue, descEnParts);
    }
    const descRu = descRuParts.join("\n\n");
    const descEn = descEnParts.join("\n\n");

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

function prepareCommunityMainBody({ value }) {
  if (!value) return value;
  const withoutImages = value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img[^>]*>/gi, "");
  const chunks = withoutImages
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!chunks.length) return "";
  const selected = [chunks[0]];
  if (chunks[1] && chunks[1].startsWith("*")) {
    selected.push(chunks[1]);
  }
  return selected.join("\n\n");
}

function prepareAncestryMainBody({ value, entry }) {
  if (!value) return value;
  const imageMatch = value.search(/(?:\n!\[[^\]]*\]\([^)]*\)|\n<img[^>]*>)/i);
  const truncated = imageMatch >= 0 ? value.slice(0, imageMatch) : value;
  const normalised = truncated.replace(/\r\n/g, "\n");
  const paragraphs = normalised
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (paragraphs.length === 0) {
    const fallback = entry?.short_description ? String(entry.short_description).trim() : "";
    return fallback;
  }
  return paragraphs.join("\n\n");
}

function createStatsTracker(file) {
  return {
    file,
    total: 0,
    processed: 0,
    updated: 0,
    unchanged: [],
    missing: []
  };
}

async function updateEntries(filePath, updater, options = {}) {
  let sortKeys = false;
  let stats = null;
  if (typeof options === "boolean") {
    sortKeys = options;
  } else if (options) {
    ({ sortKeys = false, stats = null } = options);
  }
  const raw = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(raw);
  const missing = [];

  for (const [key, entry] of Object.entries(data.entries || {})) {
    const norm = normalize(key);
    if (stats) {
      stats.total += 1;
    }
    const before = stats ? JSON.stringify(entry) : null;
    const handled = await updater(norm, entry, key);
    if (!handled) {
      missing.push(key);
      if (stats) stats.missing.push(key);
      continue;
    }
    if (stats) {
      stats.processed += 1;
      const after = JSON.stringify(entry);
      if (before === after) {
        stats.unchanged.push(key);
      } else {
        stats.updated += 1;
      }
    }
  }

  const output = sortKeys ? JSON.stringify(data, Object.keys(data).sort(), 2) : JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, `${output}`, "utf-8");
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
    return fs.writeFile(path, `${JSON.stringify(data, null, 2)}`, "utf-8");
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
  const translationFiles = Object.values(TRANSLATION_FILES);

  for (const file of translationFiles) {
    const fullPath = path.join(TRANSLATIONS_DIR, file);
    const raw = await fs.readFile(fullPath, "utf-8");
    oldTranslations[file] = JSON.parse(raw);
  }

  const classTop = buildTopLevelMap(classData.en, classData.ru, ["description"]);
  const subclassTop = buildTopLevelMap(subclassData.en, subclassData.ru, ["description"]);
  const ancestryTop = buildTopLevelMap(
    ancestryData.en,
    ancestryData.ru,
    ["short_description", "description"],
    "main_body",
    { processMainField: prepareAncestryMainBody }
  );
  const communityTop = buildTopLevelMap(
    communityData.en,
    communityData.ru,
    ["description", "short_description"],
    "main_body",
    { processMainField: prepareCommunityMainBody }
  );
  const domainTop = buildTopLevelMap(domainData.en, domainData.ru, [], "main_body");
  const equipmentTop = buildTopLevelMap(equipmentData.en, equipmentData.ru, [], "main_body");
  const beastTop = buildTopLevelMap(beastData.en, beastData.ru, ["main_body", "short_description"]);
  const adversaryTop = buildTopLevelMap(adversaryData.en, adversaryData.ru, ["short_description"]);
  const environmentTop = buildTopLevelMap(environmentData.en, environmentData.ru, ["short_description"]);
  const ruleTop = buildTopLevelMap(ruleData.en, ruleData.ru, ["description"], "main_body");

  // Создаем объект для хранения раздельных карт способностей.
  const scopedFeatureMaps = {
    class: {},
    subclass: {},
    ancestry: {},
    community: {},
    "domain-card": {},
    beastform: {},
    adversary: {},
    environment: {}
  };
  const conflicts = new Set();

  const buildFeature = (enEntries, ruEntries, fields, label, targetMap) => {
    const ruBySlug = new Map();
    for (const entry of ruEntries) {
      const slug = entry.slug || String(entry.id);
      if (slug) ruBySlug.set(slug, entry);
    }
    // featureSources больше не нужен в глобальном скоупе.
    buildFeatureMap(enEntries, ruBySlug, fields, label, targetMap, {}, conflicts);
  };

  buildFeature(classData.en, classData.ru, ["features"], "class", scopedFeatureMaps.class);
  buildFeature(subclassData.en, subclassData.ru, ["foundation_features", "specialization_features", "mastery_features"], "subclass", scopedFeatureMaps.subclass);
  buildFeature(ancestryData.en, ancestryData.ru, ["features"], "ancestry", scopedFeatureMaps.ancestry);
  buildFeature(communityData.en, communityData.ru, ["features"], "community", scopedFeatureMaps.community);
  buildFeature(domainData.en, domainData.ru, ["features"], "domain-card", scopedFeatureMaps["domain-card"]);
  buildFeature(beastData.en, beastData.ru, ["features"], "beastform", scopedFeatureMaps.beastform);
  buildFeature(adversaryData.en, adversaryData.ru, ["features"], "adversary", scopedFeatureMaps.adversary);
  buildFeature(environmentData.en, environmentData.ru, ["features"], "environment", scopedFeatureMaps.environment);

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

  const domainsOld = oldTranslations[TRANSLATION_FILES.domains];
  const oldDomainActions = {};
  if (domainsOld) {
    for (const [key, value] of Object.entries(domainsOld.entries || {})) {
      if (value.actions) oldDomainActions[key] = value.actions;
    }
  }

  const weaponsOld = oldTranslations[TRANSLATION_FILES.weapons] || {};
  const armorsOld = oldTranslations[TRANSLATION_FILES.armors] || {};
  const consumablesOld = oldTranslations[TRANSLATION_FILES.consumables] || {};
  const lootOld = oldTranslations[TRANSLATION_FILES.loot] || {};

  const updateSimpleTop = (topMap, aliases) => (norm, entry, key) =>
    !!topMap[resolveAlias(norm, aliases || {})] &&
    (( () => {
      const info = topMap[resolveAlias(norm, aliases || {})];
      entry.name = sanitizeName(info.name);
      if (info.description !== null && info.description !== undefined) {
        if (info.description) {
          setHtmlField(entry, "description", info.description);
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
          setHtmlField(entry, "description", topInfo.description);
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
    const { overrides = {}, preserveFallbackDescription = true, stats = null } = options;
    return updateEntries(targetPath, (norm, entry, key) => {
      if (overrides[key]) {
        const override = overrides[key];
        entry.name = sanitizeName(override.name || entry.name);
        if (override.description) {
          setHtmlField(entry, "description", override.description);
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
        setHtmlField(entry, "description", info.description);
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
    }, { stats });
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
      setHtmlField(entry.actions, actionIds[i], body);
    }
  }

  function applyActionOverrides(entry) {
    if (!entry || !entry.actions) return;
    for (const [actionId, html] of Object.entries(entry.actions)) {
      if (!html) continue;
      if (ACTION_OVERRIDES[actionId]) {
        setHtmlField(entry.actions, actionId, ACTION_OVERRIDES[actionId]);
      }
    }
  }

  async function applyLabelOverride(filePath, newLabel) {
    if (!newLabel) return;
    const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
    if (raw.label !== newLabel) {
      raw.label = newLabel;
      await fs.writeFile(filePath, `${JSON.stringify(raw, null, 2)}`, "utf-8");
    }
  }

  async function updateClassesFile(path, { classTop, featureMap, classItemsMap, ruleTop }, stats) {
    return updateEntries(path, (norm, entry, key) => {
      if (!norm) return false;
      let handled = false;
      const classInfo = classTop[norm];
      if (classInfo) {
        entry.name = sanitizeName(classInfo.name);
        if (classInfo.description !== null && classInfo.description !== undefined) {
          if (classInfo.description) {
            setHtmlField(entry, "description", classInfo.description);
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
            setHtmlField(entry, "description", featureInfo.description);
            if (entry.actions) {
              for (const actionId of Object.keys(entry.actions)) {
                setHtmlField(entry.actions, actionId, featureInfo.description);
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
          setHtmlField(entry, "description", info.description);
          if (entry.actions) {
            for (const actionId of Object.keys(entry.actions)) {
              setHtmlField(entry.actions, actionId, info.description);
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
      if (ruleInfo && (!handled || !entry.description)) {
        entry.name = sanitizeName(ruleInfo.name);
        if (ruleInfo.description !== null && ruleInfo.description !== undefined) {
          if (ruleInfo.description) {
            setHtmlField(entry, "description", ruleInfo.description);
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
    }, { stats });
  }

  async function updateSubclassesFile(path, { subclassTop, featureMap }, stats) {
    const result = await updateEntries(path, (norm, entry) => {
      if (!norm) return false;
      const lookup = resolveAlias(norm, SUBCLASS_NAME_ALIASES);
      let handled = false;
      const subclassInfo = subclassTop[lookup];
      if (subclassInfo) {
        entry.name = sanitizeName(subclassInfo.name);
        if (subclassInfo.description !== null && subclassInfo.description !== undefined) {
          if (subclassInfo.description) {
            setHtmlField(entry, "description", subclassInfo.description);
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
            setHtmlField(entry, "description", featureInfo.description);
            if (entry.actions) {
              for (const actionId of Object.keys(entry.actions)) {
                setHtmlField(entry.actions, actionId, featureInfo.description);
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
    }, { stats });
    await applySubclassDuplicates(path);
    return result;
  }

  async function updateAncestriesFile(path, { ancestryTop, featureMap }, stats) {
    return updateEntries(path, updateTopWithFeatures(ancestryTop, featureMap, FEATURE_NAME_ALIASES), { stats });
  }

  async function updateCommunitiesFile(path, { communityTop, featureMap }, stats) {
    return updateEntries(path, updateTopWithFeatures(communityTop, featureMap), { stats });
  }

  function normaliseHtmlForComparison(html) {
    if (!html) return "";
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function deriveActionOrder(currentActions, oldActions) {
    const actionIds = Object.keys(currentActions || {});
    const uniqueIds = [];
    const duplicateMap = {};
    const seen = new Map();

    for (const actionId of actionIds) {
      const source =
        (oldActions && oldActions[actionId] !== undefined ? oldActions[actionId] : currentActions[actionId]) || "";
      const key = normaliseHtmlForComparison(source) || actionId;
      if (seen.has(key)) {
        duplicateMap[actionId] = seen.get(key);
      } else {
        seen.set(key, actionId);
        uniqueIds.push(actionId);
      }
    }

    return { uniqueIds, duplicateMap };
  }

  function splitMarkdownToHtmlSections(markdown) {
    if (!markdown) return [];
    const prepared = markdown.replace(/\r\n/g, "\n").trim();
    if (!prepared) return [];
    const parts = prepared.split(/\n\s*\n/).map((piece) => piece.trim()).filter(Boolean);
    if (!parts.length) return [];
    return parts
      .map((piece) => markdownToHtml(piece))
      .filter(Boolean);
  }

  function buildActionHtmlFromFeature(feature) {
    if (!feature) return null;
    const bodyHtml = markdownToHtml(feature.main_body || "");
    if (!bodyHtml) return null;
    const name = sanitizeName(feature.name || "");
    if (!name) return bodyHtml;
    if (bodyHtml.startsWith("<p>")) {
      return bodyHtml.replace("<p>", `<p><strong>${name}:</strong> `);
    }
    return `<p><strong>${name}:</strong></p>${bodyHtml}`;
  }

  function buildSegmentsForActions(features, fullMarkdownSource, desiredCount) {
    let segments = [];

    if (features && features.length) {
      for (const feature of features) {
        const chunk = buildActionHtmlFromFeature(feature);
        if (chunk) segments.push(chunk);
      }
    }

    if (!segments.length && fullMarkdownSource) {
      segments = splitMarkdownToHtmlSections(fullMarkdownSource);
    }

    if (!segments.length && fullMarkdownSource) {
      const html = markdownToHtml(fullMarkdownSource);
      if (html) segments = [html];
    }

    if (!segments.length) return [];

    if (desiredCount <= 0) {
      return segments.slice();
    }

    if (segments.length < desiredCount && fullMarkdownSource) {
      const fallback = splitMarkdownToHtmlSections(fullMarkdownSource);
      if (fallback.length >= desiredCount) {
        segments = fallback;
      }
    }

    if (!segments.length) return [];

    const adjusted = segments.slice();
    if (adjusted.length > desiredCount) {
      while (adjusted.length > desiredCount) {
        const extra = adjusted.pop();
        adjusted[adjusted.length - 1] = `${adjusted[adjusted.length - 1]}${extra}`;
      }
    } else if (adjusted.length < desiredCount) {
      const filler = adjusted[adjusted.length - 1];
      while (adjusted.length < desiredCount) {
        adjusted.push(filler);
      }
    }

    return adjusted;
  }

  async function updateDomainsFile(path, { domainTop, featureMap, oldDomainActions }, stats) {
    return updateEntries(path, (norm, entry, key) => {
      if (!norm) return false;
      let handled = false;
      const domainInfo = domainTop[norm];

      if (domainInfo) {
        entry.name = sanitizeName(domainInfo.name);
        const raw = domainInfo.raw;
        const features = raw.features || [];

        // ШАГ 1: Собираем полное описание (без изменений)
        let fullDescSource = raw.main_body || "";
        if (!fullDescSource && features.length > 0) {
          fullDescSource = features.map(feature => {
            const namePart = feature.name ? `**${sanitizeName(feature.name)}:** ` : "";
            return `${namePart}${feature.main_body || ""}`;
          }).join('\n\n');
        }
        const fullDescHtml = markdownToHtml(fullDescSource);
        if (fullDescHtml) {
          setHtmlField(entry, "description", fullDescHtml);
        } else {
          delete entry.description;
        }

        if (key === "Bare Bones" && entry.description) {
          if (!entry.description.includes("Compendium.daggerheart.armors.Item.ITAjcigTcUw5pMCN")) {
            const appended = `${entry.description.replace(/\s*$/, "")}${BARE_BONES_DOMAIN_SNIPPET}`;
            setHtmlField(entry, "description", appended);
          }
        }

        // ШАГ 2: Обрабатываем 'actions' с новой "гибкой" логикой
        if (entry.actions) {
          const oldActionIds = Object.keys(entry.actions);
          const numActions = oldActionIds.length;
          if (numActions) {
            const previous = oldDomainActions[key] || {};
            const splitterConfig = DOMAIN_ACTION_SPLITTERS[norm];
            const forceUnique = splitterConfig?.forceUnique;
            const orderInfo = forceUnique
              ? { uniqueIds: oldActionIds.slice(), duplicateMap: {} }
              : deriveActionOrder(entry.actions, previous);
            const { uniqueIds, duplicateMap } = orderInfo;
            const desiredUniqueCount = uniqueIds.length;
            let segments = [];

            if (splitterConfig?.split) {
              const customSegments = splitterConfig.split({
                markdown: fullDescSource,
                html: fullDescHtml,
                desiredCount: desiredUniqueCount,
                features,
                raw
              });
              segments = renderMarkdownSegments(customSegments, desiredUniqueCount);
            }

            if (!segments.length) {
              if (desiredUniqueCount <= 1) {
                if (fullDescHtml && desiredUniqueCount === 1) {
                  segments = [fullDescHtml];
                }
              } else {
                segments = buildSegmentsForActions(features, fullDescSource, desiredUniqueCount);
              }
            }

            if (!segments.length && fullDescHtml && desiredUniqueCount) {
              segments = Array(desiredUniqueCount).fill(fullDescHtml);
            }

            if (segments.length) {
              for (let i = 0; i < uniqueIds.length; i += 1) {
                const actionId = uniqueIds[i];
                const html = segments[i] || fullDescHtml;
                if (html) {
                  setHtmlField(entry.actions, actionId, html);
                } else if (fullDescHtml) {
                  setHtmlField(entry.actions, actionId, fullDescHtml);
                } else {
                  delete entry.actions[actionId];
                }
              }

              for (const [dupId, originalId] of Object.entries(duplicateMap)) {
                const cloned = entry.actions[originalId] || fullDescHtml;
                if (cloned) {
                  setHtmlField(entry.actions, dupId, cloned);
                } else {
                  delete entry.actions[dupId];
                }
              }
            } else if (entry.description) {
              for (const actionId of oldActionIds) {
                setHtmlField(entry.actions, actionId, entry.description);
              }
            } else {
              for (const actionId of oldActionIds) {
                delete entry.actions[actionId];
              }
            }
          }
        }

        handled = true;
      }

      const featureInfo = featureMap[norm];
      if (featureInfo && !handled) {
        _updateFeature(entry, featureInfo);
        handled = true;
      }

      applyActionOverrides(entry);
      return handled;
    }, { stats });
  }

  async function updateBeastformsFile(path, { beastTop, featureMap }, stats) {
    return updateEntries(path, (norm, entry, key) => {
      if (!norm) return false;

      const info = beastTop[norm];
      if (info) {
      // 1. Обновляем основную информацию о форме (имя и общее описание)
        entry.name = sanitizeName(info.name);

        const raw = info.raw;
        const ruFeatures = raw.features || [];
        const items = entry.items || {};
        const hadDescription = !!entry.description;
        const allowDescription = hadDescription && Object.keys(items).length > 0;

        // 2. Определяем, как генерировать описание
        if (ruFeatures.length > 0 && Object.keys(items).length === 0) {
        // СЦЕНАРИЙ 1: "Цельная" форма (напр. "Легендарный Зверь")
          // Есть features в API, но нет вложенных items в JSON.
          // Значит, features - это и есть основное описание.
          const descriptionHtml = buildFeatureDescription(ruFeatures);
          if (allowDescription && descriptionHtml) {
            setHtmlField(entry, "description", descriptionHtml);
          } else {
            delete entry.description;
          }
        } else {
          // СЦЕНАРИЙ 2: "Стандартная" форма (составная или простая)
          // Обновляем основное описание из short_description, а потом (если нужно) вложенные items.
          if (allowDescription && info.description) {
            setHtmlField(entry, "description", info.description);
          } else {
            delete entry.description;
          }

          // Обновляем вложенные 'items', если они есть
          if (ruFeatures.length > 0 && Object.keys(items).length > 0) {
            const featureList = ruFeatures.slice();
            for (const itemEntry of Object.values(items)) {
              const feature = featureList.shift();
              if (!feature) break;

              itemEntry.name = sanitizeName(feature.name || "");
              const body = markdownToHtml(feature.main_body || "");
              if (body) {
                setHtmlField(itemEntry, "description", body);
                if (itemEntry.actions) {
                  for (const actionId of Object.keys(itemEntry.actions)) {
                    setHtmlField(itemEntry.actions, actionId, body);
                  }
                }
              } else {
                delete itemEntry.description;
              }
            }
          }
        }

        // 3. Добавляем "Примеры"
        if (raw && raw.examples) {
          const examples = sanitizeHtml(stripLinks(raw.examples));
          if (examples) {
            entry.examples = examples;
          }
        }

        applyActionOverrides(entry);
        return true;
      }

    // Фолбэк для редких случаев (когда способность - отдельная запись)
    const featureInfo = featureMap[norm];
    if (featureInfo) {
      _updateFeature(entry, featureInfo);
        applyActionOverrides(entry);
        return true;
      }

      applyActionOverrides(entry);
      return false;
    }, { stats });
  }

  async function updateAdversariesFile(path, { adversaryTop, featureMap }, stats) {
    return updateEntries(path, (norm, entry, key) => {
      if (!norm) return false;
      const info = adversaryTop[norm];
      if (info) {
        entry.name = sanitizeName(info.name);
        const raw = info.raw;
        const desc = markdownToHtml(raw.short_description || raw.main_body || "");
        if (desc) {
          setHtmlField(entry, "description", desc);
        } else {
          delete entry.description;
        }
        if (raw.motives) setHtmlField(entry, "motivesAndTactics", raw.motives);
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
        if (raw.slug === "battle-box") {
          applyBattleBoxOverrides(entry, raw);
        } else {
          const featureList = ruFeatures.slice();
          for (const itemEntry of Object.values(items)) {
            const nextFeature = featureList.shift();
            if (!nextFeature) break;
            applyFeatureToItemEntry(itemEntry, nextFeature);
          }
        }
        applyActionOverrides(entry);
        return true;
      }
      const featureInfo = featureMap[norm];
      if (featureInfo) {
        _updateFeature(entry, featureInfo);
        applyActionOverrides(entry);
        return true;
      }
      applyActionOverrides(entry);
      return false;
    }, { stats });
  }

  async function updateEnvironmentsFile(path, { environmentTop, featureMap }, stats) {
    return updateEntries(path, (norm, entry) => {
      if (!norm) return false;
      const info = environmentTop[norm];
      if (info) {
        entry.name = sanitizeName(info.name);
        const raw = info.raw;
        const desc = markdownToHtml(raw.short_description || raw.main_body || "");
        if (desc) {
          setHtmlField(entry, "description", desc);
        } else {
          delete entry.description;
        }
        const ruFeatures = raw.features || [];
        const items = entry.items || {};
        if (ruFeatures.length && Object.keys(items).length) {
          const featureList = ruFeatures.slice();
          for (const itemEntry of Object.values(items)) {
            const feature = featureList.shift();
            if (!feature) break;
            itemEntry.name = sanitizeName(cleanAdversaryItemName(feature.name || ""));
            const body = markdownToHtml(feature.main_body || "");
            if (body) {
              setHtmlField(itemEntry, "description", body);
              if (itemEntry.actions) {
                for (const actionId of Object.keys(itemEntry.actions)) {
                  setHtmlField(itemEntry.actions, actionId, body);
                }
              }
            } else {
              delete itemEntry.description;
            }
          }
        }
        if (raw.impulses) setHtmlField(entry, "impulses", raw.impulses);
        return true;
      }
      const featureInfo = featureMap[norm];
      if (featureInfo) {
        _updateFeature(entry, featureInfo);
        applyActionOverrides(entry);
        return true;
      }
      applyActionOverrides(entry);
      return false;
    }, { stats });
  }

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

  const filePaths = Object.fromEntries(
    Object.entries(TRANSLATION_FILES).map(([key, file]) => [key, path.join(TRANSLATIONS_DIR, file)])
  );

  const statsByFile = {};
  for (const key of Object.keys(TRANSLATION_FILES)) {
    statsByFile[key] = createStatsTracker(TRANSLATION_FILES[key]);
  }

  const tasks = [
    {
      key: "classes",
      file: TRANSLATION_FILES.classes,
      run: () =>
        updateClassesFile(filePaths.classes, {
          classTop,
          featureMap: scopedFeatureMaps.class,
          classItemsMap,
          ruleTop
        }, statsByFile.classes)
    },
    {
      key: "subclasses",
      file: TRANSLATION_FILES.subclasses,
      run: () =>
        updateSubclassesFile(filePaths.subclasses, {
          subclassTop,
          featureMap: scopedFeatureMaps.subclass
        }, statsByFile.subclasses)
    },
    {
      key: "ancestries",
      file: TRANSLATION_FILES.ancestries,
      run: async () => {
        const stats = statsByFile.ancestries;
        const missing = await updateAncestriesFile(filePaths.ancestries, {
          ancestryTop,
          featureMap: scopedFeatureMaps.ancestry
        }, stats);
        const filtered = missing.filter((key) => !LEGACY_ANCESTRY_KEYS.has(key));
        const legacyRemoved = stats.missing.length - filtered.length;
        if (legacyRemoved > 0) {
          stats.total -= legacyRemoved;
        }
        stats.missing = stats.missing.filter((key) => !LEGACY_ANCESTRY_KEYS.has(key));
        return filtered;
      }
    },
    {
      key: "communities",
      file: TRANSLATION_FILES.communities,
      run: () =>
        updateCommunitiesFile(filePaths.communities, {
          communityTop,
          featureMap: scopedFeatureMaps.community
        }, statsByFile.communities)
    },
    {
      key: "domains",
      file: TRANSLATION_FILES.domains,
      run: () =>
        updateDomainsFile(filePaths.domains, {
          domainTop,
          featureMap: scopedFeatureMaps["domain-card"],
          oldDomainActions
        }, statsByFile.domains)
    },
    {
      key: "beastforms",
      file: TRANSLATION_FILES.beastforms,
      run: () =>
        updateBeastformsFile(filePaths.beastforms, {
          beastTop,
          featureMap: scopedFeatureMaps.beastform
        }, statsByFile.beastforms)
    },
    {
      key: "adversaries",
      file: TRANSLATION_FILES.adversaries,
      run: () =>
        updateAdversariesFile(filePaths.adversaries, {
          adversaryTop,
          featureMap: scopedFeatureMaps.adversary,
          oldEntries: oldTranslations[TRANSLATION_FILES.adversaries]
        }, statsByFile.adversaries)
    },
    {
      key: "environments",
      file: TRANSLATION_FILES.environments,
      run: () =>
        updateEnvironmentsFile(filePaths.environments, {
          environmentTop,
          featureMap: scopedFeatureMaps.environment
        }, statsByFile.environments)
    },
    {
      key: "armors",
      file: TRANSLATION_FILES.armors,
      run: () =>
        applyEquipmentMap(filePaths.armors, armorMap, armorsOld, {
          overrides: ARMOR_OVERRIDES,
          preserveFallbackDescription: false,
          stats: statsByFile.armors
        })
    },
    {
      key: "weapons",
      file: TRANSLATION_FILES.weapons,
      run: () => applyEquipmentMap(filePaths.weapons, weaponMap, weaponsOld, { stats: statsByFile.weapons })
    },
    {
      key: "consumables",
      file: TRANSLATION_FILES.consumables,
      run: () => applyEquipmentMap(filePaths.consumables, consumableMap, consumablesOld, { stats: statsByFile.consumables })
    },
    {
      key: "loot",
      file: TRANSLATION_FILES.loot,
      run: () => applyEquipmentMap(filePaths.loot, lootMap, lootOld, { stats: statsByFile.loot })
    }
  ];

  const taskResults = {};
  for (const task of tasks) {
    const result = await task.run();
    taskResults[task.key] = Array.isArray(result) ? result : [];
  }

  console.log("Update summary:");
  for (const [key, stats] of Object.entries(statsByFile)) {
    const total = stats.total;
    const updated = stats.updated;
    const unchangedCount = stats.unchanged.length;
    const missingCount = stats.missing.length;
    console.log(`- ${key}: total ${total}, updated ${updated}, unchanged ${unchangedCount}, missing ${missingCount}`);
    if (!updated && unchangedCount && total) {
      const sample = stats.unchanged.slice(0, 3);
      console.log(
        `  · Entries already matched API (sample unchanged keys: ${sample.join(", ")}${
          stats.unchanged.length > sample.length ? ", ..." : ""
        }`
      );
    }
  }

  for (const [file, label] of Object.entries(LABEL_OVERRIDES)) {
    const targetPath = path.join(TRANSLATIONS_DIR, file);
    await applyLabelOverride(targetPath, label);
  }

  const missingSummary = taskResults;

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
