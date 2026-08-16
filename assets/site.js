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
