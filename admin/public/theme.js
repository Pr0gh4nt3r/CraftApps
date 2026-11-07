// Sets the design before the page is drawn, so it doesn't flash dark first. Loaded as a file of
// its own: the admin UI's CSP allows no inline scripts. The switch itself is src/web/lib/theme.ts.
try {
  const theme = localStorage.getItem('craftapps.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // storage blocked – the system's design applies
}
