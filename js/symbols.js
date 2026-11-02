// Symboles de la machine à sous, dessinés en SVG (aucun emoji).
const S = {
  cherry: `<path d="M32 10c-4 8-12 14-18 20M32 10c2 9 6 16 14 21" fill="none" stroke="#b07a00" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 10c6-4 14-4 18 0-6 3-12 3-18 0z" fill="#3ddc5f"/>
    <circle cx="18" cy="42" r="12" fill="#de0607"/><circle cx="46" cy="44" r="12" fill="#de0607"/>
    <circle cx="14" cy="38" r="3.5" fill="#f0f0e6" opacity=".75"/><circle cx="42" cy="40" r="3.5" fill="#f0f0e6" opacity=".75"/>`,
  lemon: `<ellipse cx="32" cy="34" rx="24" ry="17" fill="#ffbf17" transform="rotate(-18 32 34)"/>
    <path d="M10 42l-4 4M54 26l4-4" stroke="#b07a00" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="25" cy="28" rx="8" ry="4" fill="#fff3c4" opacity=".7" transform="rotate(-18 25 28)"/>`,
  bell: `<path d="M32 8c-11 0-17 9-17 20v10l-6 8h46l-6-8V28c0-11-6-20-17-20z" fill="#ffbf17" stroke="#b07a00" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="32" cy="52" r="6" fill="#b07a00"/><rect x="29" y="3" width="6" height="7" rx="2" fill="#b07a00"/>
    <path d="M22 26c0-6 3-10 8-11" stroke="#fff3c4" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>`,
  bar: `<rect x="5" y="18" width="54" height="28" rx="6" fill="#181818" stroke="#ffbf17" stroke-width="3"/>
    <text x="32" y="39" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="19" fill="#f0f0e6">BAR</text>`,
  diamond: `<path d="M18 12h28l12 14-26 30L6 26z" fill="#9fd8ff" stroke="#f0f0e6" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6 26h52M18 12l8 14 6 30M46 12l-8 14-6 30M26 26l6-14 6 14" fill="none" stroke="#4b69ff" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M18 12l8 14H6z" fill="#f0f0e6" opacity=".55"/>`,
  seven: `<path d="M12 10h40v9L32 56H19l19-35H12z" fill="#de0607" stroke="#ffbf17" stroke-width="3" stroke-linejoin="round"/>`,
  croco: `<path d="M6 40c0-12 10-22 24-22h10c10 0 18 6 18 14v6c0 4-3 7-7 7H18c-7 0-12-2-12-5z" fill="#3ddc5f" stroke="#1d6b2d" stroke-width="2.5"/>
    <path d="M14 45l4-5 4 5 4-5 4 5 4-5 4 5 4-5 4 5" fill="none" stroke="#f0f0e6" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="7" fill="#3ddc5f" stroke="#1d6b2d" stroke-width="2.5"/><circle cx="25" cy="23" r="3.4" fill="#181818"/><circle cx="26" cy="22" r="1.2" fill="#f0f0e6"/>
    <circle cx="50" cy="30" r="1.8" fill="#1d6b2d"/><circle cx="54" cy="31" r="1.8" fill="#1d6b2d"/>
    <path d="M30 14l3-5 3 5 3-5 3 5" fill="#ffbf17" stroke="#b07a00" stroke-width="1.5" stroke-linejoin="round"/>`,
};
export const SYMBOL_NAMES = { croco: 'Croco', seven: 'Sept', diamond: 'Diamant', bar: 'BAR', bell: 'Cloche', lemon: 'Citron', cherry: 'Cerise' };
export function symbolSVG(id, size = 64) {
  return `<svg class="sym" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${SYMBOL_NAMES[id]}">${S[id]}</svg>`;
}

// Jeton de casino en SVG
const CHIP_COLORS = { 0.5: ['#f0f0e6', '#181818'], 1: ['#3f8cff', '#f0f0e6'], 5: ['#de0607', '#f0f0e6'], 10: ['#ffbf17', '#181818'], 25: ['#2e9e4f', '#f0f0e6'], 100: ['#181818', '#ffbf17'] };
export const CHIP_VALUES = [0.5, 1, 5, 10, 25, 100];
export function chipSVG(value, label = null, size = 40) {
  const key = CHIP_VALUES.slice().reverse().find((v) => value >= v) || 0.5;
  const [bg, fg] = CHIP_COLORS[key];
  const txt = label ?? (value >= 1000 ? Math.round(value / 100) / 10 + 'k' : String(value).replace('.', ','));
  const fs = txt.length > 3 ? 9 : 11;
  return `<svg class="chipsvg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="19" fill="${bg}" stroke="#000" stroke-opacity=".35"/>
    <circle cx="20" cy="20" r="15" fill="none" stroke="${fg}" stroke-width="3.5" stroke-dasharray="5 4.4" opacity=".9"/>
    <circle cx="20" cy="20" r="11" fill="${bg}" stroke="${fg}" stroke-opacity=".5"/>
    <text x="20" y="${20 + fs * 0.36}" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-weight="800" font-size="${fs}" fill="${fg}">${txt}</text></svg>`;
}
