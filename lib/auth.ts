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
