for (const block of document.querySelectorAll('.code-block')) {
    const code = block.querySelector('code');

    if (!code) {
        continue;
    }

    const button = document.createElement('button');
    button.className = 'copy-button';
    button.type = 'button';
    button.textContent = 'Copy';
    button.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(code.textContent);
            button.textContent = 'Copied';
        } catch {
            button.textContent = 'Select text';
        }

        window.setTimeout(() => {
            button.textContent = 'Copy';
        }, 1600);
    });
    block.append(button);
}

for (const year of document.querySelectorAll('[data-current-year]')) {
    year.textContent = String(new Date().getFullYear());
}

const playgroundFrame = document.querySelector('#playground-frame');

if (playgroundFrame) {
    const siteOrigin = location.origin;
    const recipeName = new URLSearchParams(location.search).get('recipe');
    const supportedRecipes = new Set(['round-trip', 'recovery', 'boundary']);
    let playgroundReady = false;
    let recipeSource = null;

    function loadRecipe() {
        if (!playgroundReady || typeof recipeSource !== 'string') {
            return;
        }

        playgroundFrame.contentWindow?.postMessage({
            type: 'js-message:load',
            source: recipeSource
        }, siteOrigin);
    }

    playgroundFrame.addEventListener('load', () => {
        playgroundReady = true;
        loadRecipe();
    });

    if (playgroundFrame.contentDocument?.readyState === 'complete') {
        playgroundReady = true;
    }

    if (supportedRecipes.has(recipeName)) {
        import('../playground/recipes.js').then(({ default: recipeSources }) => {
            recipeSource = recipeSources[recipeName];
            loadRecipe();
        }).catch(() => {});
    }

    globalThis.addEventListener('message', async (event) => {
        if (event.source !== playgroundFrame.contentWindow || event.origin !== siteOrigin || !event.data || typeof event.data !== 'object') {
            return;
        }

        if (event.data.type === 'js-message:ready') {
            playgroundReady = true;
            loadRecipe();
            return;
        }

        if (event.data.type !== 'js-message:copy' || typeof event.data.source !== 'string' || event.data.source.length > 32768) {
            return;
        }

        let ok = false;

        try {
            await navigator.clipboard.writeText(event.data.source);
            ok = true;
        } catch {}

        playgroundFrame.contentWindow?.postMessage({
            type: 'js-message:copy-result',
            ok
        }, siteOrigin);
    });
}
