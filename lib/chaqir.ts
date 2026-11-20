// Claude agentini darhol chaqirish (rejali vazifaning API trigger'i orqali).
// Agentlar avtomatik ishlamaydi (egasi qarori, 2026-11-20): vazifa navbatga tushganda ilova dispetcherni o'zi chaqiradi.
// Sozlanmagan bo'lsa — egasi Claude ilovasida «Agent dispetcher» → «Run now» ni bosadi.

import { q } from "./db";

export const chaqiruvBor = () => Boolean(process.env.CLAUDE_FIRE_URL && process.env.CLAUDE_FIRE_TOKEN);

// Navbatdagi vazifa haqida egasiga ko'rsatiladigan matn
export function kutishMatni() {
  return chaqiruvBor()
    ? { matn: "Claude chaqirildi — 1–3 daqiqada boshlaydi", darhol: true }
    : { matn: "Navbatda — Claude ilovasida «Agent dispetcher» → «Run now» ni bosing", darhol: false };
}

// Bir daqiqa ichida qayta chaqirmaymiz: dispetcher butun navbatni bir yo'la oladi (limit: 30 chaqiruv/soat).
export async function claudeChaqir(sabab: string): Promise<{ chaqirildi: boolean; sabab?: string }> {
  if (!chaqiruvBor()) return { chaqirildi: false, sabab: "sozlanmagan" };
  const t = Date.now();
  try {
    await q(`create table if not exists agent_sozlama (kalit text primary key, qiymat jsonb)`);
    const ol = await q(
      `insert into agent_sozlama (kalit, qiymat) values ('oxirgi_chaqiruv', $1::jsonb)
       on conflict (kalit) do update set qiymat = excluded.qiymat
       where coalesce((agent_sozlama.qiymat->>'t')::bigint, 0) < $2 returning kalit`,
      [JSON.stringify({ t, sabab: sabab.slice(0, 80), manba: "bot" }), t - 60_000],
    );
    if (!ol.length) return { chaqirildi: false, sabab: "yaqinda chaqirilgan" };
    const r = await fetch(process.env.CLAUDE_FIRE_URL!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLAUDE_FIRE_TOKEN}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      await q(`update agent_sozlama set qiymat = jsonb_build_object('t', 0, 'xato', $1::text) where kalit = 'oxirgi_chaqiruv'`, [`${r.status}`]);
      return { chaqirildi: false, sabab: `Claude ${r.status}` };
    }
    return { chaqirildi: true };
  } catch (e) {
    console.error("claudeChaqir", e);
    return { chaqirildi: false, sabab: (e as Error).message.slice(0, 80) };
  }
}
