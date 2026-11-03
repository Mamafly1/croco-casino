// Nom de fichier local d'une image Steam (copie hébergée sur le site, dans img/steam/).
// Hachage FNV-1a à deux graines : 16 caractères, calculable aussi bien dans le navigateur que dans Node.
export function localImageName(i) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let k = 0; k < i.length; k++) {
    const c = i.charCodeAt(k);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
