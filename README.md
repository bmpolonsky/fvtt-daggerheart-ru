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

* **Foundry VTT:** v13+
* **Система Daggerheart для Foundry (Foundryborne):** 1.2.1+
* **Модуль:** [Babele](https://foundryvtt.com/packages/babele) 2.0.0+

> Модуль — это **локализация**, он ставится **поверх** установленной системы Daggerheart (Foundryborne). Саму систему Daggerheart необходимо установить отдельно.

---

## Что внутри

* Перевод интерфейса системы Daggerheart (UI-надписи, диалоги, подсказки).
* Локализованные **компедиумы SRD**: классы, родословные, подклассы, домены, окружения, противники, оружие и др.
* Частично переведённый контент из беты **The Void**.
* Сохранение Foundry-тегов и `@UUID`-ссылок в текстах для корректной работы карточек, макросов и бросков.
* Структура перевода, совместимая с модулем **Babele** (перевод «поверх» оригинальных компедиумов, без перепаковки чужого контента).

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
