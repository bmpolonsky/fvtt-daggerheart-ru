# Daggerheart — Русская локализация (Foundry VTT)

Почти полная русская локализация системы **Daggerheart** для Foundry VTT: переведены SRD-компедиумы, листы персонажей, а также почти все интерфейсные части, связанные с системой Daggerheart.

> Основа текстов — перевод с сайта https://daggerheart.su/ (с согласия авторов перевода и с адаптацией под структуру Foundry VTT; используются только текстовые материалы, без иллюстраций и логотипов).

Проект изначально основан на модуле перевода https://github.com/LooseSlives/daggerheart-ru-ru, но в данный момент развивается отдельно и поддерживается для актуальных версий системы Foundryborne.

---

## Установка

### Способ 1. Через официальный каталог Foundry (рекомендуется)

1. В **Foundry VTT** откройте: **Add-on Modules → Install Module**.
2. В строке поиска введите `fvtt-daggerheart-ru`
3. В списке модулей выберите **Daggerheart Russian translation** с:
   - **Package ID:** `fvtt-daggerheart-ru`
   - **Author:** `Cultivator`
4. Нажмите **Install** и дождитесь завершения установки.
5. В своём мире откройте **Game Settings → Manage Modules**, включите  
   **Daggerheart Russian translation** и **Babele**, затем сохраните настройки.

> В каталоге есть другой модуль с таким же названием.  
> Ориентируйтесь именно на **ID `fvtt-daggerheart-ru` и автора `Cultivator`**.

Страница пакета в каталоге:  
https://foundryvtt.com/packages/fvtt-daggerheart-ru

---

### Способ 2. Через manifest-ссылку

1. В **Foundry VTT** откройте **Add-on Modules → Install Module**.
2. В нижней части окна вставьте manifest-ссылку и нажмите **Install**:

```text
https://raw.githubusercontent.com/bmpolonsky/fvtt-daggerheart-ru/main/module/module.json
````

3. В своём **мире** включите модуль на вкладке **Manage Modules** (и **Babele**, если ещё не включён).

> На странице пакета в каталоге Foundry также доступна manifest-ссылка конкретной версии (кнопка **Manifest URL** в блоке Available Versions).

---

## Требования и совместимость

* **Foundry VTT:** v14.359+ (проверено на v14.360)
* **Система Daggerheart для Foundry (Foundryborne):** 2.0.0+ (проверено на 2.2.0)
* **Модуль:** [Babele](https://foundryvtt.com/packages/babele) 2.7.5+

> Модуль — это **локализация**, он ставится **поверх** установленной системы Daggerheart (Foundryborne). Саму систему Daggerheart необходимо установить отдельно.

---

## Что внутри

* Перевод интерфейса системы Daggerheart (UI-надписи, диалоги, подсказки).
* Локализованные **компедиумы SRD**: классы, родословные, подклассы, домены, окружения, противники, оружие и др.
* Частично переведённый контент из беты **The Void**.
* Сохранение Foundry-тегов и `@UUID`-ссылок в текстах для корректной работы карточек, макросов и бросков.
* Структура перевода, совместимая с модулем **Babele** (перевод «поверх» оригинальных компедиумов, без перепаковки чужого контента).

---

## Workflow поддержки

В проекте есть две линии поддержки:

* `main` — актуальная ветка для Foundry VTT v14 и Foundryborne Daggerheart 2.x.
* `v13-compat` — отдельная ветка совместимости для Foundry VTT v13 и Foundryborne Daggerheart 1.9.10.

Перед любой синхронизацией сначала проверьте состояние репозитория:

```bash
git status --short --branch
git -C tmp_data/original-daggerheart status --short --branch
git -C tmp_data/the-void-unofficial status --short --branch
```

Не перетирайте чужие локальные изменения. Если рабочее дерево не чистое, сначала разберитесь, какие правки уже есть. Это касается и временных репозиториев в `tmp_data`: особенно легко не заметить грязные LevelDB-файлы The Void.

### Обычная актуальная ветка (`main`)

Обычный поток обновления:

```bash
git switch main
npm run update:sources
npm run generate:originals
npm run sync:i18n
```

Если обновление The Void мешает SRD-обновлению из-за локально изменённых pack-файлов, можно временно пропустить его:

```bash
SKIP_VOID_UPDATE=1 npm run update:sources
```

После этого вручную проверьте diff в `module/`, переведите новые строки и поправьте места, где автоматическая синхронизация не справилась.

Для релиза:

```bash
npm run build:release -- YYYY.MM.DD
git add CHANGELOG.md module/module.json package.json package-lock.json
git commit -m "chore: new release YYYY.MM.DD"
git tag vYYYY.MM.DD
```

Скрипт сборки должен оставить manifest на `main`:

```text
https://raw.githubusercontent.com/bmpolonsky/fvtt-daggerheart-ru/main/module/module.json
```

### Ветка совместимости (`v13-compat`)

Сначала подтяните обычные изменения из `main`:

```bash
git switch v13-compat
git merge main
```

В конфликтах release metadata сохраняйте v13-линию:

* `module/module.json` version вида `YYYY.MM.DD-v13`;
* Foundry compatibility `13.346` / `13.351` / `maximum: 13`;
* Daggerheart system compatibility `1.9.10`;
* manifest на ветку `v13-compat`;
* download на конкретный v13 release tag.

Если нужно подтянуть свежую структуру из upstream-ветки Foundryborne `V13`, используйте add-only поток:

```bash
git -C tmp_data/original-daggerheart switch V13
git -C tmp_data/original-daggerheart pull --ff-only
npm run generate:originals
npm run sync:i18n:add-only
git restore --source=HEAD -- original
git -C tmp_data/original-daggerheart switch main
```

Важно: `original/` в ветке `v13-compat` должен оставаться актуальным v14-снимком из `main`. V13 `original` используется только временно как источник для add-only синхронизации.

При ручной проверке v13 diff:

* оставляйте v13-only entries/actions/effects с другими ID;
* не возвращайте удалённые в v14 поля на тех же ID (`description`, `advantageSources`, `disadvantageSources` и т.п.), потому что Babele применит их и к v14-документам;
* старые переводы берите из истории до перехода на Foundryborne 2.x, если там уже была устоявшаяся формулировка;
* проверяйте, что `module/translations` не содержит случайно добавленных английских строк, кроме исходных ключей match-map.

Быстрая проверка опасных same-ID добавлений после v13 add-only sync:

```bash
git diff -- module/translations | rg '^\+\s+"(description|advantageSources|disadvantageSources)"'
```

Если команда что-то нашла, это не всегда ошибка, но такие места нужно проверить вручную: для существующих в v14 ID эти поля обычно надо удалить из перевода.

Для v13-релиза:

```bash
npm run build:release -- YYYY.MM.DD-v13
git add CHANGELOG.md module/module.json package.json package-lock.json
git commit -m "chore: new release YYYY.MM.DD-v13"
git tag vYYYY.MM.DD-v13
```

Скрипт сборки должен оставить manifest на `v13-compat`:

```text
https://raw.githubusercontent.com/bmpolonsky/fvtt-daggerheart-ru/v13-compat/module/module.json
```

А `download` должен указывать на конкретный архив релиза:

```text
https://github.com/bmpolonsky/fvtt-daggerheart-ru/releases/download/vYYYY.MM.DD-v13/fvtt-daggerheart-ru-vYYYY.MM.DD-v13.zip
```

После сборки проверьте manifest внутри архива:

```bash
unzip -p release/fvtt-daggerheart-ru-vYYYY.MM.DD-v13.zip module/module.json
```

---

## Благодарности

* Авторам исходного фанатского перевода Daggerheart на сайте [https://daggerheart.su/](https://daggerheart.su/).
* Автору проекта локализации [daggerheart-ru-ru](https://github.com/LooseSlives/daggerheart-ru-ru), от которого изначально был сделан форк.
* Сообществу Foundry VTT и Foundryborne за систему Daggerheart в Foundry.

---

## License & Attribution

This project is a community-created add-on for Foundry VTT. It contains only localization data and code; it does not include any DRP/CR art, logos, maps, or rulebook text.

**Daggerheart™ Compatible** — terms at [https://www.daggerheart.com](https://www.daggerheart.com)

This product includes materials from the **Daggerheart System Reference Document 1.0**, © Critical Role, LLC, under the terms of the **Darrington Press Community Gaming License (DPCGL)**.
The SRD is available at [https://www.daggerheart.com](https://www.daggerheart.com) and the license at [https://darringtonpress.com/license/](https://darringtonpress.com/license/).
This project provides translations of Public Game Content; modifications consist of localization and adaptation by the repository contributors.

© 2025 Contributors. Code and localization files in this repository are under **MIT**, except for DRP/CR Public Game Content referenced under the DPCGL.
