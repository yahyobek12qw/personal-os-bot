// Claude agentlarini darhol chaqirish (rejali vazifalarning API trigger'i orqali).
// Agentlar avtomatik ishlamaydi (egasi qarori, 2026-11-20): vazifa navbatga tushganda ilova kerakli agentni o'zi chaqiradi.
// Ikki agent: «matn» (tahlil, kontent, rasmli post, hisobot, tasdiqlangan postni joylash) va «video» (video, kunlik, studio).
// Muhit: CLAUDE_FIRE_MATN_URL/TOKEN, CLAUDE_FIRE_VIDEO_URL/TOKEN (zaxira — CLAUDE_FIRE_URL/TOKEN, ikkalasiga).
// Sozlanmagan bo'lsa — egasi Claude ilovasida «Agent dispetcher» → «Run now» ni bosadi.

import { q } from "./db";

export type Agent = "matn" | "video";
const VIDEO_TURLAR = new Set(["video", "kunlik", "studio"]);
export const agentTuri = (tur?: string | null): Agent => (tur && VIDEO_TURLAR.has(tur) ? "video" : "matn");

function sozlama(a: Agent) {
  const K = a === "video" ? "VIDEO" : "MATN";
  const url = process.env[`CLAUDE_FIRE_${K}_URL`] || process.env.CLAUDE_FIRE_URL;
  const token = process.env[`CLAUDE_FIRE_${K}_TOKEN`] || process.env.CLAUDE_FIRE_TOKEN;
  return url && token ? { url, token } : null;
}
export const chaqiruvBor = (a: Agent = "matn") => Boolean(sozlama(a));

// Navbatdagi vazifa haqida egasiga ko'rsatiladigan matn
export function kutishMatni(a: Agent = "matn") {
  return chaqiruvBor(a)
    ? { matn: "Claude chaqirildi — 1–3 daqiqada boshlaydi", darhol: true }
    : { matn: "Navbatda — Claude ilovasida «Agent dispetcher» → «Run now» ni bosing", darhol: false };
}

// Bir daqiqa ichida o'sha agentni qayta chaqirmaymiz: agent navbatdagi hamma ishini bir yo'la oladi (limit: 30/soat).
export async function claudeChaqir(sabab: string, tur?: string | null): Promise<{ chaqirildi: boolean; sabab?: string; agent?: Agent }> {
  const a = agentTuri(tur);
  const s = sozlama(a);
  if (!s) return { chaqirildi: false, sabab: "sozlanmagan", agent: a };
  const t = Date.now();
  const kalit = `oxirgi_chaqiruv_${a}`;
  try {
    await q(`create table if not exists agent_sozlama (kalit text primary key, qiymat jsonb)`);
    const ol = await q(
      `insert into agent_sozlama (kalit, qiymat) values ($3, $1::jsonb)
       on conflict (kalit) do update set qiymat = excluded.qiymat
       where coalesce((agent_sozlama.qiymat->>'t')::bigint, 0) < $2 returning kalit`,
      [JSON.stringify({ t, sabab: sabab.slice(0, 80), manba: "bot" }), t - 60_000, kalit],
    );
    if (!ol.length) return { chaqirildi: false, sabab: "yaqinda chaqirilgan", agent: a };
    const r = await fetch(s.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      await q(`update agent_sozlama set qiymat = jsonb_build_object('t', 0, 'xato', $1::text) where kalit = $2`, [`${r.status}`, kalit]);
      return { chaqirildi: false, sabab: `Claude ${r.status}`, agent: a };
    }
    return { chaqirildi: true, agent: a };
  } catch (e) {
    console.error("claudeChaqir", e);
    return { chaqirildi: false, sabab: (e as Error).message.slice(0, 80), agent: a };
  }
}
