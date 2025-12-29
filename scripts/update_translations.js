#!/usr/bin/env node

/**
 * Обновляет русские переводы без вмешательства в Foundry-специфичные поля:
 * только имена, описания и текстовые поля данных. Действия/эффекты и прочие
 * элементы UI не трогаются. Для полной пересборки используйте
 * scripts/update_translations_full.js.
 */

// Подключение встроенных модулей Node.js для работы с файловой системой и путями.
const fs = require("fs/promises");
const path = require("path");

const QUIET_MODE = process.env.UPDATE_TRANSLATIONS_QUIET === "1";
const logInfo = (...args) => {
  if (!QUIET_MODE) {
    console.log(...args);
  }
};

// Список эндпоинтов API, с которых будут загружаться данные.
const ENDPOINTS = [
  "class",
  "subclass",
  "ancestry",
  "community",
  "domain-card",
  "equipment",
  "beastform",
  "transformation",
  "adversary",
  "environment",
  "rule"
];

// Ручные переопределения для названий предметов классов, которые сложно сопоставить автоматически.
const CLASS_ITEM_OVERRIDES = {
  "50ft of Rope": { name: "Верёвка (15 м)" },
  "A Romance Novel": { name: "Любовный роман" },
  "A Sharpening Stone": { name: "Точильный камень" },
  "Basic Supplies": { name: "Базовые припасы" },
  "Torch": { name: "Факел" },
  "Bundle of Offerings": { name: "Связка подношений" },
  "Drawing Of A Lover": { name: "Рисунок возлюбленного" },
  "Family Heirloom": { name: "Семейная реликвия" },
  "Grappling Hook": { name: "Крюк кошка" },
  "Letter(Never Opened)": { name: "Письмо (никогда не вскрывалось)" },
  "Secret Key": { name: "Секретный ключ" },
  "Set of Forgery Tools": { name: "Набор для фальсификации" },
  "Sigil of Your God": { name: "Символ вашего бога" },
  "Small Bag (Rocks & Bones)": { name: "Маленький мешочек с камнями и костями" },
  "Strange Dirty Penant": { name: "Странный кулон, найденный в грязи" },
  "Tiny Elemental Pet": {
    name: "Маленький питомец элементаль",
    description: "Маленький безобидный питомец элементаль"
  },
  "Totem from Mentor": { name: "Тотем от вашего наставника" },
  "Trophy from your First Kill": { name: "Трофей вашего первого убийства" },
  "Untranslated Book": {
    name: "Непереведенная книга",
    description: "<p>Книга, которую вы пытаетесь перевести.</p>"
  },
  "Broken Compass": { name: "Кажущийся сломанным компас" }
};

const SUBCLASS_NAME_ALIASES = {
  comaraderie: "camaraderie",
  partnerinarms: "partnersinarms",
  draininginvoaction: "draininginvocation"
};

// Алиасы для названий снаряжения.
const EQUIPMENT_NAME_ALIASES = {};

// Алиасы для названий способностей.
const FEATURE_NAME_ALIASES = {
  unshakeable: "unshakable",
  wailingleap: "jumpscare",
  umbraveil: "umbralveil"
};

// Алиасы для записей трансформаций (расхождения имен в модуле и API).
const TRANSFORMATION_ENTRY_ALIASES = {
  demigodichorofthegod: "demigodichorofthegods"
};

const MARTIAL_STANCE_LIST_SNIPPET =
  "<p></p><p>Вы можете перетащить эти свойства на лист персонажа.</p><p></p><h2>Ранг 1</h2><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.MHKcMoI1FOlEbi7M]{Стойка - Жестокая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.ancvKGl3z9tFzTnC]{Стойка - Оборонительная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.pj9E3iEGM6CSrGXW]{Стойка - Захватывающая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.gAB29yCHpBCmvcoY]{Стойка - Точная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.M1CBMs4kVOxMnUIT]{Стойка - Быстрая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.BpeJi5xFnTxmi1Ru]{Стойка - Устойчивая}</p><p></p><h2>Ранг 2</h2><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.8wGHiaqfE9vTL4b4]{Стойка - Смертоносная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.PlOmkkaDCr2cr7Kz]{Стойка - Мешающая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.BnGRJDnIO6CqDY6W]{Стойка - Неподвижная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.iQAXTA6y0KhzKUcU]{Стойка - Бодрящая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.6jexZv6ufhinEvNp]{Стойка - Ловкая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.cpQEaPhWDTtzJaM0]{Стойка - Потусторонняя}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.oW8fm6mYYiQh4mV5]{Стойка - Пугающая}</p><p></p><h2>Ранг 3</h2><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.0J4jLxLWzoDye1ew]{Стойка - Нарастающая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.CIl8Pe4wzhEGuzp9]{Стойка - Отражающая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.84XJzmb6ZORSDA5Q]{Стойка - Разрушительная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.WzzhboGOu8DVPo6i]{Стойка - Дуэльная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.XOYTovtyz7MwsRlP]{Стойка - Избранная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.IRDj7cX6vLINhusw]{Стойка - Неумолимая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.hVQW2ZDnvUKZ8iaA]{Стойка - Укрывающая}</p><p></p><h2>Ранг 4</h2><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.ihGjGgVizC2rS40H]{Стойка - Сокрушительная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.C0ZrpyxqH34H3HUd]{Стойка - Проницательная}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.T0X88UuKtmf5Adlb]{Стойка - Разъяряющая}</p><p>@UUID[Compendium.the-void-unofficial.subclasses.Item.wTKUd4DxHykGwODz]{Стойка - Размашистая}</p><p></p><p></p><p></p><p></p><p></p>";

const MANUAL_ENTRY_PATCHES = {
  classes: {
    Bard: {
      descriptionPrefix:
        "<p><strong>Примечание:</strong> Начиная с 5-го уровня, используйте способность «Сплочение (уровень 5)» вместо базовой. На данный момент система не производит замену автоматически.</p>"
    },
    Evolution: {
      descriptionSuffix:
        "<p><strong>Примечание:</strong> включите один из эффектов «Эволюция: ...» на вкладке эффектов, например «Эволюция: Проворность», чтобы применить бонус.</p>"
    }
  },
  communities: {
    "Found Family": {
      descriptionReplacements: [
        {
          pattern:
            /<p>В любой момент, когда вы найдете сообщество, частью которого вы когда-то были, или присоединитесь к новому сообществу, вы можете навсегда обменять эту карту сообщества на новую\.<\/p>/giu,
          value: ""
        }
      ]
    },
    Reborne: {
      descriptionSuffix:
        "<p>В любой момент, когда вы найдете сообщество, частью которого вы когда-то были, или присоединитесь к новому сообществу, вы можете навсегда обменять эту карту сообщества на новую.</p>"
    }
  },
  subclasses: {
    "Martial Artist": {
      descriptionSuffix: MARTIAL_STANCE_LIST_SNIPPET
    },
    "Martial Form": {
      descriptionReplacements: [
        {
          pattern: /<p>Возьмите лист Боевых Форм\.\s*/giu,
          value: "<p>"
        }
      ],
      descriptionSuffix: MARTIAL_STANCE_LIST_SNIPPET
    }
  }
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

const VOID_TRANSLATION_SUFFIXES = [
  "classes",
  "subclasses",
  "ancestries",
  "communities",
  "domains",
  "transformations",
  "weapons",
  "adversaries--environments"
];
const VOID_TRANSLATION_PREFIX = "the-void-unofficial.";

const ATTACK_NAME_TRANSLATIONS = {
  attack: "Атака"
};

// Регулярные выражения для очистки HTML и Markdown.
const HTML_LINK_RE = /<a\s+[^>]*>(.*?)<\/a>/gis;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const CLASS_ATTR_RE = /\sclass="[^"]*"/gi;
const HASH_PLACEHOLDER_RE = /#\{([^}]+)\}#/g;
const FOUNDRY_TAG_RE = /@[A-Za-z]+\[|\[\[\/r|<section[^>]+class=['"]secret/;

function parseAdvantagesList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((chunk) => sanitizeName(chunk))
    .filter(Boolean);
}

function capitalizeFirstLetter(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function translateAttackName(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const lookup = trimmed.toLowerCase();
  const translated = ATTACK_NAME_TRANSLATIONS[lookup];
  return translated ? sanitizeName(translated) : null;
}

function normalizeItemAttack(entry) {
  if (!entry || typeof entry.attack !== "string") return;
  const trimmed = entry.attack.trim();
  if (!trimmed) return;
  const translated = translateAttackName(trimmed);
  if (translated) {
    entry.attack = translated;
  }
}

// Определение базовых директорий проекта.
const BASE_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(BASE_DIR, "tmp_data"); // Временная папка для скачанных данных
const API_CACHE_DIR = path.join(DATA_DIR, "api"); // Отдельная папка для API-данных
const TRANSLATIONS_DIR = path.join(BASE_DIR, "module", "translations"); // Папка с файлами переводов

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
  let cleaned = stripLinks(text);
  cleaned = collapseAdjacentInlineTags(cleaned, "em");
  cleaned = collapseAdjacentInlineTags(cleaned, "strong");
  return cleaned;
}

// Очищает название от ссылок и лишних пробелов.
function sanitizeName(text) {
  if (text === null || text === undefined) return text;
  return stripLinks(text).trim();
}

function normalizeMarkdownSource(markdown) {
  if (!markdown) return "";
  return markdown.replace(/\r\n/g, "\n").trim();
}

function collapseAdjacentInlineTags(html, tagName) {
  if (!html) return html;
  const pattern = new RegExp(
    `<${tagName}([^>]*)>([^<]*)</${tagName}>((?:\\s|&nbsp;)+)<${tagName}([^>]*)>([^<]*)</${tagName}>`,
    "gi"
  );
  let result = html;
  let previous;
  do {
    previous = result;
    result = result.replace(pattern, (_match, attrsLeft, left, gap, attrsRight, right) => {
      const attrString = attrsLeft || attrsRight || "";
      const leftTrimmed = left.replace(/\s+$/, "");
      const rightTrimmed = right.replace(/^\s+/, "");
      const leftEnd = leftTrimmed.slice(-1);
      const rightStart = rightTrimmed.slice(0, 1);
      const gapHasNbsp = /&nbsp;/.test(gap || "");
      let spacer = "";
      if (gapHasNbsp) {
        spacer = "&nbsp;";
      } else if (
        !leftTrimmed ||
        !rightTrimmed ||
        /[([{«]$/.test(leftEnd) ||
        /^[)\]},.:;!?]/.test(rightStart)
      ) {
        spacer = "";
      } else {
        spacer = " ";
      }
      return `<${tagName}${attrString}>${leftTrimmed}${spacer}${rightTrimmed}</${tagName}>`;
    });
  } while (result !== previous);
  return result;
}

// Регулярные выражения для поиска специфичных для Foundry VTT тегов.
const TEMPLATE_TAG_RE = /@Template\[[^\]]+\]/gi; // @Template[type:cone|distance:30]
const INLINE_ROLL_RE = /\[\[\/([a-z]+)\s*([^\]]+)\]\]/gi; // [[/r 1d6]]
const UUID_TAG_RE = /@UUID\[([^\]]+)\]\{([^}]*)\}/gi; // @UUID[...]{label}
const SECRET_SECTION_RE = /<section\b[^>]*class=['"][^'"]*\bsecret\b[^'"]*['"][^>]*>[\s\S]*?<\/section>/gi; // <section class="secret">...</section>
const SECRET_SECTION_WRAPPER_RE =
  /(<section\b[^>]*class=['"][^'"]*\bsecret\b[^'"]*['"][^>]*>)([\s\S]*?)(<\/section>)/gi;

// Экранирует строку для использования в регулярном выражении.
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appendBeforeSecret(html, fragments) {
  if (!fragments || !fragments.length) return html;
  const block = fragments.join("");
  const secretIndex = html.search(/<section\b/i);
  if (secretIndex === -1) {
    return html.replace(/\s*$/, "") + block;
  }
  return `${html.slice(0, secretIndex)}${block}${html.slice(secretIndex)}`;
}

function findBlockIndex(html, index) {
  if (!html || typeof index !== "number" || Number.isNaN(index)) return null;
  const blockRegex = /<(?:p|ul|ol)[^>]*>[\s\S]*?<\/(?:p|ul|ol)>/gi;
  let position = -1;
  let current = -1;
  let match;
  while ((match = blockRegex.exec(html))) {
    current += 1;
    if (match.index + match[0].length <= index) {
      position = current;
    } else {
      break;
    }
  }
  return position >= 0 ? position : null;
}

function insertAfterBlockIndex(html, blockIndex, snippet) {
  if (!html || blockIndex === null || blockIndex === undefined || blockIndex < 0 || !snippet) {
    return null;
  }
  const blockRegex = /<(?:p|ul|ol)[^>]*>[\s\S]*?<\/(?:p|ul|ol)>/gi;
  let current = -1;
  let match;
  while ((match = blockRegex.exec(html))) {
    current += 1;
    if (current === blockIndex) {
      const insertionPoint = match.index + match[0].length;
      return `${html.slice(0, insertionPoint)}${snippet}${html.slice(insertionPoint)}`;
    }
  }
  return null;
}

function extractPlainText(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function fragmentHasQuestion(html) {
  if (!html) return false;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.includes("?");
}

function removePlainTextOutsideSecrets(html, plainText) {
  if (!html || !plainText) {
    return { html, removed: false };
  }
  const placeholders = [];
  const placeholderToken = (index) => `__SECRET_BLOCK_${index}__`;
  let transformed = html.replace(SECRET_SECTION_RE, (match) => {
    const token = placeholderToken(placeholders.length);
    placeholders.push(match);
    return token;
  });
  if (!transformed.includes(plainText)) {
    return { html, removed: false };
  }
  transformed = transformed.replace(plainText, "");
  let restored = transformed;
  placeholders.forEach((section, index) => {
    const token = placeholderToken(index);
    restored = restored.replace(token, section);
  });
  return { html: restored, removed: true };
}

function dedupeSecretContent(html) {
  if (!html) return html;
  let result = html;
  const matches = Array.from(result.matchAll(SECRET_SECTION_RE));
  if (!matches.length) return result;
  for (const match of matches) {
    const block = match[0];
    const innerMatch = block.match(/^<section[^>]*>([\s\S]*?)<\/section>$/i);
    const inner = innerMatch ? innerMatch[1].trim() : "";
    if (!inner) continue;
    const plainInner = stripLinks(inner).replace(/\s+/g, " ").trim();
    if (!plainInner) continue;
    const removal = removePlainTextOutsideSecrets(result, plainInner);
    result = removal.html;
  }
  return result;
}

function normalizeSecretSections(html) {
  if (!html) return html;
  return html.replace(SECRET_SECTION_WRAPPER_RE, (full, open, inner, close) => {
    const paragraphMatches = Array.from(inner.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi));
    if (!paragraphMatches.length) return full;
    const questionIndex = paragraphMatches.findIndex((match) => fragmentHasQuestion(match[0]));
    if (questionIndex <= 0) return full;
    const anchorMatch = paragraphMatches[questionIndex];
    const anchorIndex =
      typeof anchorMatch.index === "number" ? anchorMatch.index : inner.indexOf(anchorMatch[0]);
    if (anchorIndex <= 0) return full;
    const before = inner.slice(0, anchorIndex);
    if (!before.trim()) return full;
    const after = inner.slice(anchorIndex);
    return `${before}${open}${after}${close}`;
  });
}

function mergeFoundryTags(oldHtml, newHtml) {
  if (!newHtml) return newHtml;
  const source = oldHtml || "";
  let result = newHtml;

  // Обработка тегов @Template
  // Логика: находит все @Template теги в старом тексте и, если их нет в новом,
  // добавляет их в конце. Это может привести к тому, что тег окажется не на своем месте.
  const templateMatches = Array.from(source.matchAll(TEMPLATE_TAG_RE));
  if (templateMatches.length) {
    const pendingTemplates = [];
    const seen = new Set();
    for (const match of templateMatches) {
      const tag = match[0];
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      if (!result.includes(tag)) {
        const snippet = `<p>${tag}</p>`;
        const blockIndex =
          typeof match.index === "number" ? findBlockIndex(source, match.index) : null;
        if (blockIndex !== null && blockIndex !== undefined) {
          const anchored = insertAfterBlockIndex(result, blockIndex, snippet);
          if (anchored) {
            result = anchored;
            continue;
          }
        }
        pendingTemplates.push(snippet);
      }
    }
    if (pendingTemplates.length) {
      result = appendBeforeSecret(result, pendingTemplates);
    }
  }

  const inlineMatches = Array.from(source.matchAll(INLINE_ROLL_RE));
  const appendedRolls = [];
  const appendedRollSet = new Set();
  for (const match of inlineMatches) {
    const full = match[0];
    const expr = (match[2] || "").trim();
    if (!expr || result.includes(full)) continue;
    const preferredWrappers = [];
    if (typeof match.index === "number") {
      const before = source.slice(0, match.index);
      const after = source.slice(match.index + full.length);
      if (/<strong[^>]*>$/.test(before) && /^<\/strong>/i.test(after)) {
        preferredWrappers.push("strong");
      }
      if (/<em[^>]*>$/.test(before) && /^<\/em>/i.test(after)) {
        preferredWrappers.push("em");
      }
    }
    let replaced = false;
    for (const tag of preferredWrappers) {
      const specificWrapper = new RegExp(
        `(<${tag}[^>]*>)\\s*${escapeRegExp(expr)}\\s*(</${tag}>)`,
        "i"
      );
      if (specificWrapper.test(result)) {
        result = result.replace(specificWrapper, `$1${full}$2`);
        replaced = true;
        break;
      }
    }
    if (replaced) continue;
    const regex = new RegExp(escapeRegExp(expr), "i");
    if (regex.test(result)) {
      result = result.replace(regex, full);
      continue;
    }
    const wrapperRegex = new RegExp(
      `(<(?:strong|em)[^>]*>)\\s*${escapeRegExp(expr)}\\s*(</(?:strong|em)>)`,
      "i"
    );
    if (wrapperRegex.test(result)) {
      result = result.replace(wrapperRegex, `$1${full}$2`);
      continue;
    }
    if (!result.includes(full)) {
      if (!appendedRollSet.has(full)) {
        appendedRollSet.add(full);
        appendedRolls.push(`<p>${full}</p>`);
      }
    }
  }
  if (appendedRolls.length) {
    result = appendBeforeSecret(result, appendedRolls);
  }

  const uuidMatches = Array.from(source.matchAll(UUID_TAG_RE));
  for (const match of uuidMatches) {
    const full = match[0];
    const pathRef = match[1];
    const label = (match[2] || "").trim();
    if (!pathRef || !label || result.includes(full)) continue;
    const regex = new RegExp(escapeRegExp(label));
    if (regex.test(result)) {
      result = result.replace(regex, `@UUID[${pathRef}]{${label}}`);
    }
  }

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
      const blockHasQuestion = fragmentHasQuestion(inner);
      if (inner) {
        const idx = result.indexOf(inner);
        if (idx !== -1) {
          const matched = result.slice(idx, idx + inner.length);
          const newBlock = block.replace(/>([\s\S]*?)<\/section>/i, `>${matched}</section>`);
          result = `${result.slice(0, idx)}${newBlock}${result.slice(idx + inner.length)}`;
          continue;
        }
      }
      if (blockHasQuestion) {
        const questionMatch = result.match(/(<p[^>]*><em>[\s\S]*?<\/em><\/p>)\s*$/i);
        if (questionMatch && fragmentHasQuestion(questionMatch[1])) {
          const question = questionMatch[1];
          const newBlock = block.replace(/>([\s\S]*?)<\/section>/i, `>${question}</section>`);
          result = result.replace(/(<p[^>]*><em>[\s\S]*?<\/em><\/p>)\s*$/i, `${newBlock}`);
          continue;
        }
        const paragraphMatch = result.match(/(<p[^>]*>[\s\S]*?<\/p>)\s*$/i);
        if (paragraphMatch && fragmentHasQuestion(paragraphMatch[1])) {
          const paragraph = paragraphMatch[1];
          const newBlock = block.replace(/>([\s\S]*?)<\/section>/i, `>${paragraph}</section>`);
          result = result.replace(/(<p[^>]*>[\s\S]*?<\/p>)\s*$/i, `${newBlock}`);
          continue;
        }
      }
      appended.push(block);
    }
    if (appended.length) {
      result = result.replace(/\s*$/, "") + appended.join("");
    }
  }

  if (source) {
    const plainSource = extractPlainText(source);
    const plainResult = extractPlainText(result);
    const sourceHasSpecial = FOUNDRY_TAG_RE.test(source);
    const resultHasSpecial = FOUNDRY_TAG_RE.test(result);
    if (plainSource && plainResult && plainSource === plainResult) {
      if (sourceHasSpecial && !resultHasSpecial) {
        return source;
      }
    }
  }

  return normalizeSecretSections(result);
}

function hasVisibleText(html) {
  if (typeof html !== "string") return false;
  const plain = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return plain.length > 0;
}

function setHtmlField(target, key, html) {
  if (!target) return;
  if (html === null || html === undefined) return;
  const sanitized = sanitizeHtml(html);
  if (!sanitized) return;
  const existingRaw = typeof target[key] === "string" ? target[key] : "";
  const existingSanitized = existingRaw ? sanitizeHtml(existingRaw) : "";
  let merged = mergeFoundryTags(existingRaw, sanitized);
  merged = collapseAdjacentInlineTags(merged, "em");
  merged = collapseAdjacentInlineTags(merged, "strong");
  if (!hasVisibleText(merged)) return;
  const normalisePlain = (value) => extractPlainText(value);
  if (existingRaw) {
    const existingPlain = normalisePlain(existingSanitized || existingRaw);
    const mergedPlain = normalisePlain(merged);
    if (existingPlain && mergedPlain && existingPlain === mergedPlain) {
      const hasLinks =
        /<a[\s>]/i.test(existingRaw) || /\[[^\]]+\]\([^)]+\)/.test(existingRaw);
      if (hasLinks && existingSanitized && existingSanitized !== existingRaw) {
        target[key] = existingSanitized;
      } else {
        target[key] = existingRaw;
      }
      return;
    }
  }
  target[key] = merged;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function unwrapSingleParagraph(html) {
  if (!html) return html;
  const match = html.match(/^<p>(.*)<\/p>$/is);
  if (match) {
    return match[1];
  }
  return html;
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
  let inQuote = false;

  for (const rawLine of lines) {
    let line = rawLine.trim();
    const isQuote = line.startsWith(">");
    if (isQuote) line = line.replace(/^>\s*/, "");
    if (!line) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (inQuote) {
        out.push("</blockquote>");
        inQuote = false;
      }
      continue;
    }
    if (isQuote && !inQuote) {
      out.push("<blockquote>");
      inQuote = true;
    } else if (!isQuote && inQuote) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push("</blockquote>");
      inQuote = false;
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
  if (inQuote) out.push("</blockquote>");
  let resultHtml = out.join("");
  resultHtml = collapseAdjacentInlineTags(resultHtml, "em");
  return stripLinks(resultHtml);
}

function getCachePath(endpoint, lang = "ru") {
  return path.join(API_CACHE_DIR, lang, `${endpoint}.json`);
}

async function loadLanguageDataset(endpoint, lang) {
  const cachePath = getCachePath(endpoint, lang);
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf-8")).data;
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  throw new Error(
    `API cache file is missing: ${cachePath}. Run scripts/update_sources.js to refresh API data.`
  );
}

async function loadApi(endpoint) {
  const [ru, en] = await Promise.all([
    loadLanguageDataset(endpoint, "ru"),
    loadLanguageDataset(endpoint, "en")
  ]);
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

function normaliseText(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").trim();
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

function buildTransformationEntriesMap(enEntries, ruEntries) {
  const ruBySlug = new Map();
  for (const entry of ruEntries || []) {
    if (!entry) continue;
    const slug = entry.slug || (entry.id !== undefined && entry.id !== null ? String(entry.id) : null);
    if (slug) {
      ruBySlug.set(slug, entry);
    }
  }

  const map = {};
  for (const enEntry of enEntries || []) {
    if (!enEntry) continue;
    const slug = enEntry.slug || (enEntry.id !== undefined && enEntry.id !== null ? String(enEntry.id) : null);
    if (!slug) continue;
    const ruEntry = ruBySlug.get(slug);
    if (!ruEntry) continue;
    const ruFeatures = new Map();
    for (const feature of ruEntry.features || []) {
      if (!feature || feature.id === undefined || feature.id === null) continue;
      ruFeatures.set(feature.id, feature);
    }
    const shortDescription = ruEntry.short_description || "";
    const baseName = sanitizeName(ruEntry.name || enEntry.name || "") || "";
    for (const feature of enEntry.features || []) {
      if (!feature || feature.id === undefined || feature.id === null) continue;
      const ruFeature = ruFeatures.get(feature.id);
      if (!ruFeature) continue;
      const keyName = `${enEntry.name || ""} - ${feature.name || ""}`.trim();
      const norm = normalize(keyName);
      if (!norm) continue;
      const featureName = sanitizeName(ruFeature.name || feature.name || "") || "";
      map[norm] = {
        name: featureName ? `${baseName} - ${featureName}` : baseName,
        shortDescription,
        featureName,
        featureBody: ruFeature.main_body || ""
      };
    }
  }
  return map;
}

function renderTransformationDescription(info) {
  if (!info) return "";
  const sections = [];
  const shortHtml = markdownToHtml(info.shortDescription || "");
  if (shortHtml) {
    sections.push(shortHtml);
  }
  const body = (info.featureBody || "").trim();
  if (body) {
    const featureMarkdown = info.featureName ? `${info.featureName}: ${body}` : body;
    const featureHtml = markdownToHtml(featureMarkdown);
    if (featureHtml) {
      sections.push(featureHtml);
    }
  }
  return sections.join("");
}

function extractUuidParagraphs(html) {
  if (!html) return [];
  const matches = html.match(
    /<p[^>]*>(?:(?!<\/p>)[\s\S])*?@UUID\[[^\]]+\](?:(?!<\/p>)[\s\S])*?<\/p>/gi
  );
  return matches ? matches : [];
}

function appendUuidParagraphs(html, legacyHtml) {
  const fragments = extractUuidParagraphs(legacyHtml);
  if (!fragments.length) return html;
  let result = html || "";
  for (const fragment of fragments) {
    if (!result.includes(fragment)) {
      result = `${result}${fragment}`;
    }
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

async function detectVoidTranslationFiles() {
  const specs = [];
  for (const suffix of VOID_TRANSLATION_SUFFIXES) {
    const file = `${VOID_TRANSLATION_PREFIX}${suffix}.json`;
    const fullPath = path.join(TRANSLATIONS_DIR, file);
    if (await fileExists(fullPath)) {
      specs.push({
        key: `void${capitalizeFirstLetter(suffix)}`,
        suffix,
        file,
        fullPath
      });
    }
  }
  return specs;
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

async function updateEntries(filePath, updater, options = {}) {
  let sortKeys = false;
  let stats = null;
  if (typeof options === "boolean") {
    sortKeys = options;
  } else if (options) {
    ({ sortKeys = false, stats = null } = options);
  }
  const raw = await fs.readFile(filePath, "utf-8");
  const hadTrailingNewline = raw.endsWith("\n");
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
  const suffix = hadTrailingNewline ? "\n" : "";
  await fs.writeFile(filePath, `${output}${suffix}`, "utf-8");
  return missing;
}

async function applyLabelOverride(filePath, newLabel) {
  if (!newLabel) return;
  const source = await fs.readFile(filePath, "utf-8");
  const hadTrailingNewline = source.endsWith("\n");
  const raw = JSON.parse(source);
  if (raw.label !== newLabel) {
    raw.label = newLabel;
    const suffix = hadTrailingNewline ? "\n" : "";
    await fs.writeFile(filePath, `${JSON.stringify(raw, null, 2)}${suffix}`, "utf-8");
  }
}

function applyClassQuestionLists(entry, rawInfo) {
  if (!entry || !rawInfo) return;
  const sanitizeList = (values) => {
    if (!Array.isArray(values)) return null;
    const cleaned = values
      .map((value) => sanitizeName(value))
      .filter((value) => typeof value === "string" && value.length > 0);
    return cleaned.length ? cleaned : null;
  };
  const backgrounds = sanitizeList(rawInfo.background_questions) || null;
  if (backgrounds) {
    entry.backgroundQuestions = backgrounds;
  }
  const connections = sanitizeList(rawInfo.connection_questions) || null;
  if (connections) {
    entry.connections = connections;
  }
}

function applyManualEntryPatches(sectionKey, entryKey, entry) {
  if (!entry) return;
  const sectionConfig = MANUAL_ENTRY_PATCHES[sectionKey];
  if (!sectionConfig) return;
  const patch = sectionConfig[entryKey];
  if (!patch) return;
  entry.description = applyManualDescriptionPatches(sectionKey, entryKey, entry.description);
}

function ensureHtmlFragment(html, fragment, { position }) {
  if (!fragment) return html || "";
  const base = html || "";
  if (base.includes(fragment)) return base;
  const basePlain = extractPlainText(base);
  const fragmentPlain = extractPlainText(fragment);
  if (fragmentPlain && basePlain && basePlain.includes(fragmentPlain)) {
    return base;
  }
  return position === "prefix" ? `${fragment}${base}` : `${base}${fragment}`;
}

function applyManualDescriptionPatches(sectionKey, entryKey, html) {
  if (html === null || html === undefined) return html;
  const sectionConfig = MANUAL_ENTRY_PATCHES[sectionKey];
  if (!sectionConfig) return html;
  const patch = sectionConfig[entryKey];
  if (!patch) return html;
  let updated = html;
  if (patch.descriptionReplacements && updated) {
    for (const replacement of patch.descriptionReplacements) {
      if (!replacement) continue;
      const { pattern, value } = replacement;
      if (value === undefined || value === null) continue;
      if (pattern instanceof RegExp) {
        updated = updated.replace(pattern, value);
      } else if (pattern) {
        updated = updated.replace(pattern, value);
      }
    }
  }
  if (patch.descriptionPrefix) {
    updated = ensureHtmlFragment(updated, patch.descriptionPrefix, { position: "prefix" });
  }
  if (patch.descriptionSuffix) {
    updated = ensureHtmlFragment(updated, patch.descriptionSuffix, { position: "suffix" });
  }
  return updated;
}

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
    const entryInfo = {
      name: sanitizeName(ruEntry.name || enEntry.name),
      description
    };
    map[norm] = entryInfo;
  }
  return map;
}

async function applyEquipmentMap(targetPath, map, fallback = {}, options = {}) {
  const { overrides = {}, preserveFallbackDescription = true, stats = null } = options;
  const fallbackEntries = (fallback && fallback.entries) || {};
  return updateEntries(
    targetPath,
    (norm, entry, key) => {
      const fallbackEntry = fallbackEntries[key];
      if (overrides[key]) {
        const override = overrides[key];
        entry.name = sanitizeName(override.name || entry.name);
        if (override.description) {
          setHtmlField(entry, "description", override.description);
        }
        normalizeItemAttack(entry);
        return true;
      }
      if (!norm) return false;
      const info = map[norm] || map[resolveAlias(norm, EQUIPMENT_NAME_ALIASES)];
      if (!info) {
        if (fallbackEntry) {
          entry.name = fallbackEntry.name;
          if (fallbackEntry.description) {
            entry.description = fallbackEntry.description;
          }
          normalizeItemAttack(entry);
          return true;
        }
        return false;
      }
      entry.name = sanitizeName(info.name);
      if (info.description) {
        setHtmlField(entry, "description", info.description);
      } else if (preserveFallbackDescription && fallbackEntry && fallbackEntry.description) {
        entry.description = fallbackEntry.description;
      }
      normalizeItemAttack(entry);
      return true;
    },
    { stats }
  );
}

function resolveAlias(norm, aliases) {
  if (!norm) return norm;
  return aliases[norm] || norm;
}

async function updateClassesFile(path, { classTop, featureMap, classItemsMap, ruleTop }, stats) {
  return updateEntries(
    path,
    (norm, entry, key) => {
      if (!norm) return false;
      let handled = false;
      const classInfo = classTop[norm];
      if (classInfo) {
        entry.name = sanitizeName(classInfo.name);
        if (classInfo.description) {
          const patched = applyManualDescriptionPatches("classes", key, classInfo.description);
          setHtmlField(entry, "description", patched);
        }
        applyClassQuestionLists(entry, classInfo.raw);
        handled = true;
      }

      const featureInfo = featureMap[norm];
      if (featureInfo) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          const patched = applyManualDescriptionPatches("classes", key, featureInfo.description);
          setHtmlField(entry, "description", patched);
        }
        handled = true;
      }

      if (norm === normalize("Rally Level 5") && featureMap[normalize("Rally")]) {
        const info = featureMap[normalize("Rally")];
        entry.name = `${sanitizeName(info.name)} (уровень 5)`;
        if (info.description) {
          const patched = applyManualDescriptionPatches("classes", key, info.description);
          setHtmlField(entry, "description", patched);
        }
        handled = true;
      }

      const itemOverride = classItemsMap[norm];
      if (itemOverride) {
        entry.name = itemOverride;
        handled = true;
      }

      const staticOverride = CLASS_ITEM_OVERRIDES[key];
      if (staticOverride) {
        const override =
          typeof staticOverride === "string" ? { name: staticOverride } : staticOverride;
        if (override.name) {
          entry.name = override.name;
        }
        if (override.description) {
          const patched = applyManualDescriptionPatches("classes", key, override.description);
          setHtmlField(entry, "description", patched);
        }
        handled = true;
      }

      const ruleInfo = ruleTop[norm];
      if (ruleInfo && (!handled || !entry.description)) {
        entry.name = sanitizeName(ruleInfo.name);
        if (ruleInfo.description) {
          const patched = applyManualDescriptionPatches("classes", key, ruleInfo.description);
          setHtmlField(entry, "description", patched);
        }
        handled = true;
      }

      applyManualEntryPatches("classes", key, entry);
      return handled;
    },
    { stats }
  );
}

async function updateSubclassesFile(path, { subclassTop, featureMap }, stats) {
  return updateEntries(
    path,
    (norm, entry, key) => {
      if (!norm) return false;
      const lookup = resolveAlias(norm, SUBCLASS_NAME_ALIASES);
      let handled = false;
      const subclassInfo = subclassTop[lookup];
      if (subclassInfo) {
        entry.name = sanitizeName(subclassInfo.name);
        if (subclassInfo.description) {
          setHtmlField(entry, "description", subclassInfo.description);
        }
        handled = true;
      }
      const featureInfo = featureMap[lookup] || featureMap[norm];
      if (featureInfo) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          setHtmlField(entry, "description", featureInfo.description);
        }
        handled = true;
      }
      applyManualEntryPatches("subclasses", key, entry);
      return handled;
    },
    { stats }
  );
}

async function updateAncestriesFile(path, { ancestryTop, featureMap }, stats) {
  return updateEntries(
    path,
    (norm, entry) => {
      if (!norm) return false;
      const lookup = resolveAlias(norm, FEATURE_NAME_ALIASES);
      let handled = false;
      const topInfo = ancestryTop[lookup];
      if (topInfo) {
        entry.name = sanitizeName(topInfo.name);
        if (topInfo.description) {
          setHtmlField(entry, "description", topInfo.description);
        }
        handled = true;
      }
      const featureInfo = featureMap[lookup] || featureMap[norm];
      if (featureInfo) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          setHtmlField(entry, "description", featureInfo.description);
        }
        handled = true;
      }
      return handled;
    },
    { stats }
  );
}

async function updateCommunitiesFile(path, { communityTop, featureMap }, stats) {
  return updateEntries(
    path,
    (norm, entry, key) => {
      if (!norm) return false;
      let handled = false;
      const topInfo = communityTop[norm];
      if (topInfo) {
        entry.name = sanitizeName(topInfo.name);
        if (topInfo.description) {
          setHtmlField(entry, "description", topInfo.description);
        }
        handled = true;
      }
      const featureInfo = featureMap[norm];
      if (featureInfo) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          setHtmlField(entry, "description", featureInfo.description);
        }
        handled = true;
      }
      applyManualEntryPatches("communities", key, entry);
      return handled;
    },
    { stats }
  );
}

async function updateDomainsFile(path, { domainTop, featureMap }, stats) {
  return updateEntries(
    path,
    (norm, entry, key) => {
      if (!norm) return false;
      const lookup = resolveAlias(norm, FEATURE_NAME_ALIASES);
      let handled = false;
      const domainInfo = domainTop[lookup];

      if (domainInfo) {
        entry.name = sanitizeName(domainInfo.name);
        const raw = domainInfo.raw;
        const features = raw.features || [];

        let fullDescSource = raw.main_body || "";
        if (!fullDescSource && features.length > 0) {
          fullDescSource = features
            .map((feature) => {
              const namePart = feature.name ? `**${sanitizeName(feature.name)}:** ` : "";
              return `${namePart}${feature.main_body || ""}`;
            })
            .join("\n\n");
        }
        const fullDescHtml = markdownToHtml(fullDescSource);
        if (fullDescHtml) {
          setHtmlField(entry, "description", fullDescHtml);
        }
        if (key === "Bare Bones" && entry.description) {
          if (!entry.description.includes("Compendium.daggerheart.armors.Item.ITAjcigTcUw5pMCN")) {
            const appended = `${entry.description.replace(/\s*$/, "")}${BARE_BONES_DOMAIN_SNIPPET}`;
            setHtmlField(entry, "description", appended);
          }
        }

        handled = true;
      }

      const featureInfo = featureMap[lookup] || featureMap[norm];
      if (featureInfo && !handled) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          setHtmlField(entry, "description", featureInfo.description);
        }
        handled = true;
      }

      return handled;
    },
    { stats }
  );
}

async function updateBeastformsFile(path, { beastTop, featureMap }, stats) {
  return updateEntries(
    path,
    (norm, entry) => {
      if (!norm) return false;

      const info = beastTop[norm];
      if (info) {
        entry.name = sanitizeName(info.name);

        const raw = info.raw;
        const ruFeatures = raw.features || [];
        const items = entry.items || {};
        const hadDescription = !!entry.description;
        const allowDescription = hadDescription && Object.keys(items).length > 0;

        if (ruFeatures.length > 0 && Object.keys(items).length === 0) {
          const descriptionHtml = buildFeatureDescription(ruFeatures);
          if (allowDescription && descriptionHtml) {
            setHtmlField(entry, "description", descriptionHtml);
          } else {
            delete entry.description;
          }
        } else if (info.description) {
          if (allowDescription) {
            setHtmlField(entry, "description", info.description);
          } else {
            delete entry.description;
          }
        } else {
          delete entry.description;
        }

        const ruAdvantages = parseAdvantagesList(raw.advantages);
        if (ruAdvantages.length) {
          entry.advantageOn = ruAdvantages.map((value) => capitalizeFirstLetter(value));
        } else {
          delete entry.advantageOn;
        }

        if (raw && raw.examples) {
          const examples = sanitizeHtml(stripLinks(raw.examples));
          if (examples) {
            entry.examples = examples;
          } else {
            delete entry.examples;
          }
        } else {
          delete entry.examples;
        }

        return true;
      }

      // Фолбэк для редких случаев (когда способность - отдельная запись)
      const featureInfo = featureMap[norm];
      if (featureInfo) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          setHtmlField(entry, "description", featureInfo.description);
        }
        return true;
      }
      return false;
    },
    { stats }
  );
}

async function updateTransformationsFile(path, { transformationEntries }, stats) {
  return updateEntries(
    path,
    (norm, entry) => {
      if (!norm) return false;
      const lookup = resolveAlias(norm, TRANSFORMATION_ENTRY_ALIASES);
      const info = transformationEntries[lookup];
      if (!info) return false;

      if (info.name) {
        entry.name = sanitizeName(info.name);
      }
      const originalDescription = entry.description;
      let descriptionHtml = renderTransformationDescription(info);
      descriptionHtml = appendUuidParagraphs(descriptionHtml, originalDescription);
      if (descriptionHtml) {
        setHtmlField(entry, "description", descriptionHtml);
      }

      return true;
    },
    { stats }
  );
}

async function updateAdversariesFile(path, { adversaryTop, featureMap }, stats) {
  return updateEntries(
    path,
    (norm, entry) => {
      if (!norm) return false;
      const info = adversaryTop[norm];
      if (info) {
        entry.name = sanitizeName(info.name);
        const raw = info.raw;
        const desc = markdownToHtml(raw.short_description || raw.main_body || "");
        if (desc) {
          setHtmlField(entry, "description", desc);
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
        return true;
      }
      const featureInfo = featureMap[norm];
      if (featureInfo) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          setHtmlField(entry, "description", featureInfo.description);
        }
        return true;
      }
      return false;
    },
    { stats }
  );
}

async function updateEnvironmentsFile(path, { environmentTop, featureMap }, stats) {
  return updateEntries(
    path,
    (norm, entry) => {
      if (!norm) return false;
      const info = environmentTop[norm];
      if (info) {
        entry.name = sanitizeName(info.name);
        const raw = info.raw;
        const desc = markdownToHtml(raw.short_description || raw.main_body || "");
        if (desc) {
          setHtmlField(entry, "description", desc);
          entry.description = dedupeSecretContent(entry.description);
        }
        if (raw.impulses) setHtmlField(entry, "impulses", raw.impulses);
        return true;
      }
      const featureInfo = featureMap[norm];
      if (featureInfo) {
        if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
        if (featureInfo.description) {
          setHtmlField(entry, "description", featureInfo.description);
        }
        return true;
      }
      return false;
    },
    { stats }
  );
}

async function updateAdversariesEnvironmentsFile(
  path,
  { adversaryTop, adversaryFeatureMap, environmentTop, environmentFeatureMap },
  stats
) {
  return updateEntries(
    path,
    (norm, entry) => {
      const hasAdversaryData = adversaryTop[norm] || adversaryFeatureMap[norm];
      if (hasAdversaryData) {
        return translateAdversaryEntry(norm, entry, adversaryTop, adversaryFeatureMap);
      }
      const hasEnvironmentData = environmentTop[norm] || environmentFeatureMap[norm];
      if (hasEnvironmentData) {
        return translateEnvironmentEntry(norm, entry, environmentTop, environmentFeatureMap);
      }
      return false;
    },
    { stats }
  );
}

function translateAdversaryEntry(norm, entry, adversaryTop, featureMap) {
  if (!norm) return false;
  const info = adversaryTop[norm];
  if (info) {
    entry.name = sanitizeName(info.name);
    const raw = info.raw;
    const desc = markdownToHtml(raw.short_description || raw.main_body || "");
    if (desc) {
      setHtmlField(entry, "description", desc);
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
    return true;
  }
  const featureInfo = featureMap[norm];
  if (featureInfo) {
    if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
    if (featureInfo.description) {
      setHtmlField(entry, "description", featureInfo.description);
    }
    return true;
  }
  return false;
}

function translateEnvironmentEntry(norm, entry, environmentTop, featureMap) {
  if (!norm) return false;
  const info = environmentTop[norm];
  if (info) {
    entry.name = sanitizeName(info.name);
    const raw = info.raw;
    const desc = markdownToHtml(raw.short_description || raw.main_body || "");
    if (desc) {
      setHtmlField(entry, "description", desc);
      entry.description = dedupeSecretContent(entry.description);
    }
    if (raw.impulses) setHtmlField(entry, "impulses", raw.impulses);
    return true;
  }
  const featureInfo = featureMap[norm];
  if (featureInfo) {
    if (featureInfo.name) entry.name = sanitizeName(featureInfo.name);
    if (featureInfo.description) {
      setHtmlField(entry, "description", featureInfo.description);
    }
    return true;
  }
  return false;
}

async function main() {
  const [
    classData,
    subclassData,
    ancestryData,
    communityData,
    domainData,
    equipmentData,
    beastData,
    transformationData,
    adversaryData,
    environmentData,
    ruleData
  ] = await Promise.all(ENDPOINTS.map((endpoint) => loadApi(endpoint)));

  const voidTranslationSpecs = await detectVoidTranslationFiles();

  const translationFileInfos = [
    ...Object.entries(TRANSLATION_FILES).map(([key, file]) => ({
      key,
      file,
      fullPath: path.join(TRANSLATIONS_DIR, file)
    })),
    ...voidTranslationSpecs.map((spec) => ({
      key: spec.key,
      file: spec.file,
      fullPath: spec.fullPath
    }))
  ];

  const oldTranslations = {};
  for (const info of translationFileInfos) {
    const raw = await fs.readFile(info.fullPath, "utf-8");
    oldTranslations[info.file] = JSON.parse(raw);
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
  const transformationEntries = buildTransformationEntriesMap(transformationData.en, transformationData.ru);
  const adversaryTop = buildTopLevelMap(adversaryData.en, adversaryData.ru, ["short_description"]);
  const environmentTop = buildTopLevelMap(environmentData.en, environmentData.ru, ["short_description"]);
  const ruleTop = buildTopLevelMap(ruleData.en, ruleData.ru, ["description"], "main_body");

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
  const featureSources = {};

  const buildFeature = (enEntries, ruEntries, fields, label, targetMap) => {
    const ruBySlug = new Map();
    for (const entry of ruEntries) {
      const slug = entry.slug || String(entry.id);
      if (slug) ruBySlug.set(slug, entry);
    }
    buildFeatureMap(enEntries, ruBySlug, fields, label, targetMap, featureSources, conflicts);
  };

  buildFeature(classData.en, classData.ru, ["features"], "class", scopedFeatureMaps.class);
  buildFeature(
    subclassData.en,
    subclassData.ru,
    ["foundation_features", "specialization_features", "mastery_features"],
    "subclass",
    scopedFeatureMaps.subclass
  );
  buildFeature(ancestryData.en, ancestryData.ru, ["features"], "ancestry", scopedFeatureMaps.ancestry);
  buildFeature(communityData.en, communityData.ru, ["features"], "community", scopedFeatureMaps.community);
  buildFeature(domainData.en, domainData.ru, ["features"], "domain-card", scopedFeatureMaps["domain-card"]);
  buildFeature(beastData.en, beastData.ru, ["features"], "beastform", scopedFeatureMaps.beastform);
  buildFeature(adversaryData.en, adversaryData.ru, ["features"], "adversary", scopedFeatureMaps.adversary);
  buildFeature(
    environmentData.en,
    environmentData.ru,
    ["features"],
    "environment",
    scopedFeatureMaps.environment
  );

  if (conflicts.size) {
    logInfo("Conflicting feature translations detected:");
    for (const entry of conflicts) {
      const [name, newSrc, oldSrc] = entry.split("|||");
      logInfo(` - ${name}: ${oldSrc} vs ${newSrc}`);
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

  const weaponsOld = oldTranslations[TRANSLATION_FILES.weapons] || {};
  const armorsOld = oldTranslations[TRANSLATION_FILES.armors] || {};
  const consumablesOld = oldTranslations[TRANSLATION_FILES.consumables] || {};
  const lootOld = oldTranslations[TRANSLATION_FILES.loot] || {};

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
  for (const spec of voidTranslationSpecs) {
    filePaths[spec.key] = spec.fullPath;
  }

  const statsByFile = {};
  for (const info of translationFileInfos) {
    statsByFile[info.key] = createStatsTracker(info.file);
  }

  const runAncestryUpdate = (fileKey) => async () => {
    const stats = statsByFile[fileKey];
    const missing = await updateAncestriesFile(
      filePaths[fileKey],
      {
        ancestryTop,
        featureMap: scopedFeatureMaps.ancestry
      },
      stats
    );
    const filtered = missing.filter((key) => !LEGACY_ANCESTRY_KEYS.has(key));
    const legacyRemoved = stats.missing.length - filtered.length;
    if (legacyRemoved > 0) {
      stats.total -= legacyRemoved;
    }
    stats.missing = stats.missing.filter((key) => !LEGACY_ANCESTRY_KEYS.has(key));
    return filtered;
  };

  const tasks = [
    {
      key: "classes",
      file: TRANSLATION_FILES.classes,
      run: () =>
        updateClassesFile(
          filePaths.classes,
          {
            classTop,
            featureMap: scopedFeatureMaps.class,
            classItemsMap,
            ruleTop
          },
          statsByFile.classes
        )
    },
    {
      key: "subclasses",
      file: TRANSLATION_FILES.subclasses,
      run: () =>
        updateSubclassesFile(
          filePaths.subclasses,
          {
            subclassTop,
            featureMap: scopedFeatureMaps.subclass
          },
          statsByFile.subclasses
        )
    },
    {
      key: "ancestries",
      file: TRANSLATION_FILES.ancestries,
      run: runAncestryUpdate("ancestries")
    },
    {
      key: "communities",
      file: TRANSLATION_FILES.communities,
      run: () =>
        updateCommunitiesFile(
          filePaths.communities,
          {
            communityTop,
            featureMap: scopedFeatureMaps.community
          },
          statsByFile.communities
        )
    },
    {
      key: "domains",
      file: TRANSLATION_FILES.domains,
      run: () =>
        updateDomainsFile(
          filePaths.domains,
          {
            domainTop,
            featureMap: scopedFeatureMaps["domain-card"]
          },
          statsByFile.domains
        )
    },
    {
      key: "beastforms",
      file: TRANSLATION_FILES.beastforms,
      run: () =>
        updateBeastformsFile(
          filePaths.beastforms,
          {
            beastTop,
            featureMap: scopedFeatureMaps.beastform
          },
          statsByFile.beastforms
        )
    },
    {
      key: "adversaries",
      file: TRANSLATION_FILES.adversaries,
      run: () =>
        updateAdversariesFile(
          filePaths.adversaries,
          {
            adversaryTop,
            featureMap: scopedFeatureMaps.adversary
          },
          statsByFile.adversaries
        )
    },
    {
      key: "environments",
      file: TRANSLATION_FILES.environments,
      run: () =>
        updateEnvironmentsFile(
          filePaths.environments,
          {
            environmentTop,
            featureMap: scopedFeatureMaps.environment
          },
          statsByFile.environments
        )
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
      run: () =>
        applyEquipmentMap(filePaths.consumables, consumableMap, consumablesOld, { stats: statsByFile.consumables })
    },
    {
      key: "loot",
      file: TRANSLATION_FILES.loot,
      run: () => applyEquipmentMap(filePaths.loot, lootMap, lootOld, { stats: statsByFile.loot })
    }
  ];

  for (const spec of voidTranslationSpecs) {
    let task = null;
    const stats = statsByFile[spec.key];
    switch (spec.suffix) {
      case "classes":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateClassesFile(
              filePaths[spec.key],
              {
                classTop,
                featureMap: scopedFeatureMaps.class,
                classItemsMap,
                ruleTop
              },
              stats
            )
        };
        break;
      case "subclasses":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateSubclassesFile(
              filePaths[spec.key],
              {
                subclassTop,
                featureMap: scopedFeatureMaps.subclass
              },
              stats
            )
        };
        break;
      case "ancestries":
        task = {
          key: spec.key,
          file: spec.file,
          run: runAncestryUpdate(spec.key)
        };
        break;
      case "communities":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateCommunitiesFile(
              filePaths[spec.key],
              {
                communityTop,
                featureMap: scopedFeatureMaps.community
              },
              stats
            )
        };
        break;
      case "domains":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateDomainsFile(
              filePaths[spec.key],
              {
                domainTop,
                featureMap: scopedFeatureMaps["domain-card"]
              },
              stats
            )
        };
        break;
      case "adversaries":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateAdversariesFile(
              filePaths[spec.key],
              {
                adversaryTop,
                featureMap: scopedFeatureMaps.adversary
              },
              stats
            )
        };
        break;
      case "beastforms":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateBeastformsFile(
              filePaths[spec.key],
              {
                beastTop,
                featureMap: scopedFeatureMaps.beastform
              },
              stats
            )
        };
        break;
      case "transformations":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateTransformationsFile(
              filePaths[spec.key],
              {
                transformationEntries
              },
              stats
            )
        };
        break;
      case "weapons":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            applyEquipmentMap(filePaths[spec.key], weaponMap, oldTranslations[spec.file] || {}, { stats })
        };
        break;
      case "adversaries--environments":
        task = {
          key: spec.key,
          file: spec.file,
          run: () =>
            updateAdversariesEnvironmentsFile(
              filePaths[spec.key],
              {
                adversaryTop,
                adversaryFeatureMap: scopedFeatureMaps.adversary,
                environmentTop,
                environmentFeatureMap: scopedFeatureMaps.environment
              },
              stats
            )
        };
        break;
      default:
        break;
    }
    if (task) {
      tasks.push(task);
    }
  }

  const taskResults = {};
  for (const task of tasks) {
    const result = await task.run();
    taskResults[task.key] = Array.isArray(result) ? result : [];
  }

  logInfo("Update summary:");
  for (const [key, stats] of Object.entries(statsByFile)) {
    const total = stats.total;
    const updated = stats.updated;
    const unchangedCount = stats.unchanged.length;
    const missingCount = stats.missing.length;
    logInfo(`- ${key}: total ${total}, updated ${updated}, unchanged ${unchangedCount}, missing ${missingCount}`);
    if (!updated && unchangedCount && total) {
      const sample = stats.unchanged.slice(0, 3);
      logInfo(
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

  logInfo("Missing entries report:");
  for (const [category, items] of Object.entries(missingSummary)) {
    const remaining = items.filter(Boolean);
    if (!remaining.length) continue;
    logInfo(`- ${category}: ${remaining.length} entries without updates`);
    for (const item of remaining) {
      logInfo(`  * ${item}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
