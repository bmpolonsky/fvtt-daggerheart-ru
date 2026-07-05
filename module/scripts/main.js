// Регистрируем модуль перевода и все кастомные конвертеры после инициализации Babele.
Hooks.once('babele.init', (babele) => {
  babele.register({
    module: 'fvtt-daggerheart-ru',
    lang: 'ru',
    dir: 'translations'
  });

  // Foundry хранит разные типы компендиев по-разному: Item-паки (классы, домены) содержат только
  // system.* и обрабатываются простым mapping, а Actor-паки (противники, окружения) включают массив
  // вложенных Item'ов. Вспомогательные функции ниже помогают проставлять переводы в те части,
  // куда Babele сам не лезет (embedded items, action-узлы, advantage-листы).

  // Ищет перевод сначала по стабильному _id, затем по имени для файлов, экспортированных из Foundry.
  const getTranslationByIdOrName = (translations, id, name) => {
    if (!translations || typeof translations !== "object") {
      return null;
    }
    if (id && translations[id]) {
      return translations[id];
    }
    if (name && translations[name]) {
      return translations[name];
    }
    return null;
  };

  // Обновляет одно действие (name/description) исходя из перевода.
  const updateActionNode = (action, translated) => {
    if (!action || !translated || typeof translated !== "object") {
      return;
    }
    const { name, description } = translated;
    if (name) {
      action.name = name;
    }
    if (description) {
      action.description = description;
    }
    applyCountdownTranslations(action.countdown, translated.countdown);
  };

  // Применяет перевод к эффекту, включая вложенные advantage/disadvantage sources.
  const updateEffectNode = (effect, translated) => {
    if (!effect || !translated || typeof translated !== "object") {
      return;
    }
    const { name, description } = translated;
    if (name) {
      effect.name = name;
    }
    if (description) {
      effect.description = description;
    }
    applySourceTranslations(effect, translated.advantageSources, "system.advantageSources");
    applySourceTranslations(effect, translated.disadvantageSources, "system.disadvantageSources");
  };

  // Проставляет переведённые имена/описания action-нодам по их ID.
  const applyActionTranslations = (actions, translatedActions) => {
    if (!actions || !translatedActions || typeof translatedActions !== "object") {
      return;
    }
    for (const [actionId, action] of Object.entries(actions)) {
      updateActionNode(action, getTranslationByIdOrName(translatedActions, actionId, action?.name));
    }
  };

  // Синхронизирует массив эффектов с переводами, включая advantageSources.
  const applyEffectTranslations = (effects, translatedEffects) => {
    if (!Array.isArray(effects) || !translatedEffects || typeof translatedEffects !== "object") {
      return;
    }
    for (const effect of effects) {
      if (!effect) continue;
      const effectId = typeof effect._id === "string" ? effect._id : null;
      const translation = getTranslationByIdOrName(translatedEffects, effectId, effect.name);
      updateEffectNode(effect, translation);
    }
  };

  // Опыты противников хранятся объектом по ID. Babele не умеет сам обновлять name/value внутри узлов.
  const applyExperienceTranslations = (experiences, translatedExperiences) => {
    if (!experiences || typeof experiences !== "object" || !translatedExperiences || typeof translatedExperiences !== "object") {
      return;
    }
    for (const [experienceId, experience] of Object.entries(experiences)) {
      if (!experience || typeof experience !== "object") continue;
      const currentName = experience.name || experience.value || experience.label;
      const translation = getTranslationByIdOrName(translatedExperiences, experienceId, currentName);
      const translatedName = typeof translation === "string" ? translation : translation?.name;
      if (typeof translatedName !== "string") continue;
      const trimmed = translatedName.trim();
      if (!trimmed) continue;
      if (typeof experience.name === "string") {
        experience.name = trimmed;
      }
      if (typeof experience.value === "string") {
        experience.value = trimmed;
      }
      if (typeof experience.label === "string") {
        experience.label = trimmed;
      }
    }
  };

  // Обновляет списки строк вроде вопросов предыстории и связей.
  const applyStringListTranslations = (list, translatedList) => {
    if (!Array.isArray(list) || !Array.isArray(translatedList)) {
      return list;
    }
    for (let index = 0; index < list.length; index += 1) {
      const replacement = translatedList[index];
      if (typeof replacement !== "string") continue;
      const trimmed = replacement.trim();
      if (!trimmed) continue;
      if (typeof list[index] === "string") {
        list[index] = trimmed;
      } else if (list[index] && typeof list[index] === "object") {
        if (typeof list[index].value === "string") {
          list[index].value = trimmed;
        }
        if (typeof list[index].text === "string") {
          list[index].text = trimmed;
        }
      }
    }
    return list;
  };

  // Меняет строки advantage/disadvantageSources внутри effect.changes на переведённые значения.
  const applySourceTranslations = (effect, replacementMap, targetKey) => {
    if (!effect || !replacementMap || typeof replacementMap !== "object") {
      return;
    }
    const changes = Array.isArray(effect.changes) ? effect.changes : [];
    for (const change of changes) {
      if (!change || change.key !== targetKey) {
        continue;
      }
      const current = typeof change.value === "string" ? change.value : "";
      if (!current) {
        continue;
      }
      const candidate = replacementMap[current];
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        change.value = trimmed;
      }
    }
  };

  // Проставляет переводы имен шагов отсчётов внутри action.countdown.
  const applyCountdownTranslations = (countdownList, translatedMap) => {
    if (!Array.isArray(countdownList) || !translatedMap || typeof translatedMap !== "object") {
      return;
    }
    for (const node of countdownList) {
      if (!node || typeof node.name !== "string") {
        continue;
      }
      const translatedName = translatedMap[node.name];
      if (typeof translatedName !== "string") {
        continue;
      }
      const trimmed = translatedName.trim();
      if (trimmed) {
        node.name = trimmed;
      }
    }
  };

  Babele.get().registerConverters({
    /**
     * Actor-документы (противники, окружения) держат свои способности в массиве items.
     * Нам нужно самим пройтись и обновить каждую запись по _id.
     */
    "toItemsWithActions": (origItems, transItems) => {
      if (!Array.isArray(origItems) || !transItems) {
        return origItems;
      }
      for (const item of origItems) {
        if (!item) {
          continue;
        }
        const translation = getTranslationByIdOrName(transItems, item._id, item.name);
        if (!translation) {
          continue;
        }
        if (translation.name) {
          item.name = translation.name;
        }
        const system = item.system;
        if (!system) {
          continue;
        }
        const desc = translation.description;
        if (desc) {
          system.description = desc;
        }
        applyActionTranslations(system.actions, translation.actions);
        applyEffectTranslations(item.effects, translation.effects);
      }
      return origItems;
    },

    /**
     * Item-паки (классы, домены, оружие и т. д.) сами по себе являются Item'ами Foundry,
     * и их действия лежат в system.actions.
     */
    "toActions": (origActions, transActions) => {
      applyActionTranslations(origActions, transActions);
      return origActions;
    },

    /**
     * Сопоставляет эффекты по _id и применяет переводы.
     */
    "toEffects": (origEffects, transEffects) => {
      applyEffectTranslations(origEffects, transEffects);
      return origEffects;
    },

    /**
     * Обновляет названия опытов у противников и окружений.
     */
    "toExperiences": (origExperiences, transExperiences) => {
      applyExperienceTranslations(origExperiences, transExperiences);
      return origExperiences;
    },

    /**
     * Обновляет массивы строк, которые Babele может не заменить напрямую.
     */
    "toStringList": (origList, transList) => applyStringListTranslations(origList, transList),

    /**
     * Преимущества у звероформ внутри Foundry хранятся объектом {id: { value }}.
     * Но в переводах у нас есть просто список строк, поэтому конвертер проставляет строки в value в том же порядке.
     */
    "toAdvantageList": (origObj, values) => {
      if (!Array.isArray(values)) {
        return origObj;
      }
      Object.keys(origObj).forEach((id, index) => {
        const node = origObj[id];
        const replacement = values[index];
        if (!node || typeof node.value !== "string" || typeof replacement !== "string") {
          return;
        }
        const trimmed = replacement.trim();
        if (trimmed) {
          node.value = trimmed;
        }
      });
      return origObj;
    },

    /**
     * Обновляет подписи потенциальных противников у окружений.
     */
    "toPotentialAdversaries": (origGroups, translatedGroups) => {
      if (!origGroups || typeof origGroups !== "object" || !translatedGroups || typeof translatedGroups !== "object") {
        return origGroups;
      }
      for (const [groupId, group] of Object.entries(origGroups)) {
        if (!group || typeof group !== "object") continue;
        const translation = getTranslationByIdOrName(translatedGroups, groupId, group.label);
        if (!translation || typeof translation.label !== "string") continue;
        const trimmed = translation.label.trim();
        if (trimmed) {
          group.label = trimmed;
        }
      }
      return origGroups;
    },

    /**
     * У таблиц добычи дополнительные формулы хранятся объектом в flags.daggerheart.altFormula.
     * Babele не умеет сопоставлять такие вложенные узлы сам, поэтому обновляем подписи по ID.
     */
    "toRolltableAltFormula": (formulas, translations = {}) => {
      for (const [id, formula] of Object.entries(formulas ?? {})) {
        const name = translations[id]?.name?.trim();
        if (name) {
          formula.name = name;
        }
      }
      return formulas;
    },

    /**
     * Babele 2.8 перевёл TableResult на общий document-конвертер и потерял старый fallback:
     * document-result больше не подтягивает name из связанного Item-пака по documentUuid.
     */
    "toRolltableResults": (results, translations = {}) => {
      for (const result of results ?? []) {
        const key = Array.isArray(result.range) ? `${result.range[0]}-${result.range[1]}` : result._id;
        const translation = translations?.[key] ?? translations?.[result._id];

        const description = typeof translation === "string" ? translation : translation?.description;
        let name = translation?.name;
        if (!name && result.type === "document" && result.documentUuid) {
          const parsed = foundry.utils.parseUuid(result.documentUuid);
          const collection = typeof parsed?.collection === "string" ? parsed.collection : parsed?.collection?.collection;
          name = collection ? game.babele?.translateField?.("name", collection, { name: result.name }) : null;
        }

        const update = {};
        if (name) {
          update.name = name;
        }
        if (description) {
          update.description = description;
        }
        if (!Object.keys(update).length) {
          continue;
        }
        if (typeof result.updateSource === "function") {
          result.updateSource(update);
        } else {
          Object.assign(result, update);
        }
      }
      return results;
    }
  });
});
