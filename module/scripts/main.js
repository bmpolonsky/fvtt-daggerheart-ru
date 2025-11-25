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
      updateActionNode(action, translatedActions[actionId]);
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
      if (!effectId) continue;
      updateEffectNode(effect, translatedEffects[effectId]);
    }
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
        const translation = transItems[item._id];
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
        const translation = translatedGroups[groupId];
        if (!translation || typeof translation.label !== "string") continue;
        const trimmed = translation.label.trim();
        if (trimmed) {
          group.label = trimmed;
        }
      }
      return origGroups;
    }
  });
});
