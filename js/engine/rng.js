// Hasard cryptographique, identique dans le navigateur et sur le serveur.
const buf = new Uint32Array(2);
export function rng() {
  crypto.getRandomValues(buf);
  return (buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53;
}
