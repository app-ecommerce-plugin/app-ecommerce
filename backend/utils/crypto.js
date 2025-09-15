// backend/utils/crypto.js
const crypto = require("crypto");

const ENC_KEY_B64 = process.env.ENCRYPTION_KEY; // 32 bytes en base64
if (!ENC_KEY_B64) {
  // Mantengo verificación estricta: evita almacenar tokens en claro accidentalmente.
  console.warn(
    "[WARN] ENCRYPTION_KEY no definido: no se podrá cifrar/descifrar tokens."
  );
}
const ENC_KEY = ENC_KEY_B64 ? Buffer.from(ENC_KEY_B64, "base64") : null;

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

module.exports = { encrypt, decrypt };