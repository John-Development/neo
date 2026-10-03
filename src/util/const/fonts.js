const DROPCAP_FONTS = {
  literary: '"Didot", "Bodoni 72", Georgia, serif',
  fantasy: '"Apple Chancery", "Snell Roundhand", cursive',
  scifi: 'Futura, "Avenir Next", "Helvetica Neue", sans-serif'
};
const BODY_FONTS = {
  'Georgia': 'Georgia, "Times New Roman", serif',
  'Palatino': '"Palatino", "Palatino Linotype", serif',
  'Baskerville': 'Baskerville, "Baskerville Old Face", Georgia, serif',
  'Hoefler Text': '"Hoefler Text", Georgia, serif',
  'Iowan Old Style': '"Iowan Old Style", Georgia, serif',
  'Cambria': 'Cambria, Georgia, serif',
  'Constantia': 'Constantia, Georgia, serif',
  // a sans-serif for those who write in one (bundled, so it's the same everywhere)
  'Jost': '"Jost", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  // iA Writer's own face, bundled too (SIL Open Font License)
  'iA Writer Quattro': '"iA Writer Quattro", "Helvetica Neue", Arial, sans-serif'
};

// Hoefler Text and Iowan Old Style ship only with macOS; elsewhere they
// would fall back to Georgia, so offer the fonts Windows actually has.
// Keep in step with bodyFonts in main.js.
const BODY_FONT_CHOICES = IS_MAC
  ? ['Georgia', 'Palatino', 'Baskerville', 'Hoefler Text', 'Iowan Old Style', 'Jost', 'iA Writer Quattro']
  : ['Georgia', 'Palatino', 'Baskerville', 'Cambria', 'Constantia', 'Jost', 'iA Writer Quattro'];

const LINUX_BODY_FONTS = {
  'Gelasio': '"Gelasio", Georgia, "Times New Roman", serif',
  'TeX Gyre Pagella': '"TeX Gyre Pagella", Palatino, "Palatino Linotype", serif',
  'Libre Baskerville': '"Libre Baskerville", Baskerville, Georgia, serif',
  'Alegreya': '"Alegreya", "Hoefler Text", Georgia, serif',
  'Source Serif Pro': '"Source Serif Pro", "Iowan Old Style", Georgia, serif',
  'Jost': '"Jost", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  'iA Writer Quattro': '"iA Writer Quattro", "Helvetica Neue", Arial, sans-serif'
};