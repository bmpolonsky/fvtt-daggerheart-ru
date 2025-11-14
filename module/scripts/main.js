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
  };

  const applyActionTranslations = (actions, translatedActions) => {
    if (!actions || !translatedActions || typeof translatedActions !== "object") {
      return;
    }
    for (const [actionId, action] of Object.entries(actions)) {
      updateActionNode(action, translatedActions[actionId]);
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
    }
  });
});
