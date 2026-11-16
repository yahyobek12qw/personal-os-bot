// Har bir postga qo'shiladigan murojaat havolalari (egasi qarori, 2026-11-16)
export const ADMIN = "yahyobekqodirov";
export const BOT = "productCRMbot";
export const KANAL = "product_crm";

// Instagram: havola bosilmaydi — Telegram nomlari (@...) aniq ko'rinadi, heshteglardan oldin
export const IG_FUTER = `📩 Savol va demo — Telegram: @${ADMIN}\n🤖 Bepul sinov: @${BOT}\n📢 Telegram kanal: @${KANAL}`;
// Telegram: bosiladigan havolalar
export const TG_FUTER = `📩 Admin: t.me/${ADMIN}\n🤖 Bepul sinov: t.me/${BOT}\n📢 Kanal: t.me/${KANAL}`;

const borMi = (m: string) => new RegExp(`(@|t\\.me/)${BOT}`, "i").test(m) && new RegExp(`(@|t\\.me/)${ADMIN}`, "i").test(m);

export function igHavola(caption: string): string {
  const m = String(caption ?? "").trim();
  if (!m || borMi(m)) return m;
  const qatorlar = m.split("\n");
  // Oxirgi heshteg qatorlari oldiga qo'yamiz
  let i = qatorlar.length;
  while (i > 0 && /^\s*(#\S+\s*)+$/.test(qatorlar[i - 1])) i--;
  const asosiy = qatorlar.slice(0, i).join("\n").trimEnd();
  const teg = qatorlar.slice(i).join("\n").trim();
  return [asosiy, IG_FUTER, teg].filter(Boolean).join("\n\n").slice(0, 2200);
}
export function tgHavola(matn: string): string {
  const m = String(matn ?? "").trim();
  if (!m || borMi(m)) return m;
  // Telegram'da heshteglar keraksiz — olib tashlaymiz
  const toza = m.split("\n").filter((q) => !/^\s*(#\S+\s*)+$/.test(q)).join("\n").trimEnd();
  return `${toza}\n\n${TG_FUTER}`;
}
