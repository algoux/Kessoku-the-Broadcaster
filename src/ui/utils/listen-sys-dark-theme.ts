(function () {
  const html = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(isDark: boolean) {
    html.classList.toggle('dark', isDark);
  }

  applyTheme(media.matches);

  media.addEventListener('change', (e) => {
    applyTheme(e.matches);
  });
})();
