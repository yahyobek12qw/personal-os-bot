import crypto from "node:crypto";

// ---------- Telegram WebApp initData tekshiruvi ----------
export function foydalanuvchi(initData: string): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const qator = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const kalit = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hisob = crypto.createHmac("sha256", kalit).update(qator).digest("hex");
  if (hisob.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(hisob), Buffer.from(hash))) return null;
  const vaqt = Number(params.get("auth_date") || 0);
  if (Date.now() / 1000 - vaqt > 7 * 86400) return null;
  try {
    return String(JSON.parse(params.get("user") || "{}").id ?? "");
  } catch {
    return null;
  }
}

// ---------- Studio kaliti: brauzer va planshet uchun (Telegram'dan tashqarida) ----------
// Bot egasiga imzolangan havola beradi: /studio/#k=<muddat>.<imzo>
export const STUDIO_URL = "https://personal-os-bot-gold.vercel.app/studio/";
const studioImzo = (muddat: string) =>
  crypto.createHmac("sha256", crypto.createHash("sha256").update("studio:" + (process.env.TELEGRAM_BOT_TOKEN || "")).digest())
    .update("studio:" + muddat).digest("base64url");

export function studioKalit(kun = 30): string {
  const muddat = String(Math.floor(Date.now() / 1000) + kun * 86400);
  return `${muddat}.${studioImzo(muddat)}`;
}
export function studioKalitTogri(kalit: string): boolean {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false;
  const [muddat, imzo] = String(kalit || "").split(".");
  if (!/^\d{10}$/.test(muddat || "") || !imzo) return false;
  if (Number(muddat) < Date.now() / 1000) return false;
  const kerak = studioImzo(muddat);
  return kerak.length === imzo.length && crypto.timingSafeEqual(Buffer.from(kerak), Buffer.from(imzo));
}
export const studioHavola = (loyihaId?: number) => `${STUDIO_URL}#k=${studioKalit()}${loyihaId ? `&l=${loyihaId}` : ""}`;
