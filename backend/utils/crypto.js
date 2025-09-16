// backend/utils/crypto.js
const crypto = require("crypto");
const redis = require("./redisClient"); // PARA auto-migración (necesario)
const { tokenKey } = require("../middleware/ensureShopAccess"); // PARA auto-migración

const ENC_KEY_B64 = process.env.ENCRYPTION_KEY; // 32 bytes en base64
if (!ENC_KEY_B64) {
  console.warn(
    "[WARN] ENCRYPTION_KEY no definido: no se podrá cifrar/descifrar tokens."
  );
}
const ENC_KEY = ENC_KEY_B64 ? Buffer.from(ENC_KEY_B64, "base64") : null;

// ----- Utilidades internas -----
function isLikelyEncrypted(jsonStr) {
  // Formato esperado: JSON con iv/tag/data/alg/ver
  if (!jsonStr) return false;
  if (jsonStr[0] !== "{" || jsonStr[jsonStr.length - 1] !== "}") return false;
  try {
    const obj = JSON.parse(jsonStr);
    return !!(obj && obj.iv && obj.tag && obj.data && obj.alg);
  } catch {
    return false;
  }
}

function encrypt(text) {
  if (!ENC_KEY) throw new Error("ENCRYPTION_KEY no configurado");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
    alg: "aes-256-gcm",
    ver: 1,
  };
  return JSON.stringify(payload);
}

function decrypt(payloadJson) {
  if (!ENC_KEY) throw new Error("ENCRYPTION_KEY no configurado");
  const payload = JSON.parse(payloadJson);
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * getAccessTokenAuto(shop)
 * - Lee el token en Redis.
 * - Si está cifrado (JSON válido), lo descifra y lo devuelve.
 * - Si está en texto plano (p.ej. "shpua_..."), lo devuelve, y SI hay ENCRYPTION_KEY:
 *     - lo cifra y lo guarda de vuelta (auto-migración).
 */
async function getAccessTokenAuto(shop) {
  const key = tokenKey(shop);
  const raw = await redis.get(key);
  if (!raw) throw new Error("Token no encontrado");

  // Caso 1: ya cifrado
  if (isLikelyEncrypted(raw)) {
    if (!ENC_KEY)
      throw new Error("ENCRYPTION_KEY no configurado (no puedo descifrar)");
    const token = decrypt(raw);
    return token;
  }

  // Caso 2: texto plano (legacy)
  const legacyToken = raw; // ya es el access_token
  if (ENC_KEY) {
    try {
      const enc = encrypt(legacyToken);
      await redis.set(key, enc); // migración silenciosa
      // (no cambiamos el valor que devolvemos a la app)
    } catch (e) {
      console.warn("[WARN] No se pudo re-cifrar el token legacy:", e.message);
    }
  } else {
    console.warn(
      "[WARN] Token legacy en texto plano y ENCRYPTION_KEY ausente."
    );
  }
  return legacyToken;
}

module.exports = { encrypt, decrypt, getAccessTokenAuto };