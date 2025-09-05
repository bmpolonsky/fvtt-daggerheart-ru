
Hooks.once('babele.init', (babele) => {

    babele.register({
        module: 'daggerheart-ru-ru',
        lang: 'ru',
        dir: 'translations'
    });

    Babele.get().registerConverters({

        "toAdversariesItems": (original, translation) => {
            for (i in original) {
								if (original[i]._id in translation){
									original[i].name = translation[original[i]._id]?.name;
									original[i].system.description = translation[original[i]._id]?.description;
								}
            }
            return;
        }
				
    });

});
