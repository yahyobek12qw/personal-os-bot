// Zernio REST API (https://zernio.com/api/v1) — akkaunt statistikasi, post joylash va rejalash.
// Kalit: ZERNIO_API_KEY (Vercel env). Kalit yo'q bo'lsa — joylashni rejali agent qiladi.

import { q } from "./db";

const BASE = "https://zernio.com/api/v1";
export const IG_HISOB = process.env.ZERNIO_IG_ACCOUNT || "6afa0146d8425e7df05c6d89"; // Instagram @productcrm
export const zernioBor = () => Boolean(process.env.ZERNIO_API_KEY);

async function z(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  let j: any = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`Zernio ${r.status}: ${String(j?.error ?? j?.message ?? t).slice(0, 200)}`);
  return j;
}

const kun = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---------- Akkaunt (5 daqiqalik kesh) ----------
export async function akkaunt(yangila = false) {
  if (!zernioBor()) return { ulangan: false };
  const k = (await q(`select qiymat from agent_sozlama where kalit = 'akkaunt_kesh'`))[0]?.qiymat;
  if (!yangila && k && Date.now() - k.vaqt < 5 * 60_000) return k.data;
  const bugun = Date.now();
  const [dash, postlar, rejadagi, eng] = await Promise.all([
    z(`/analytics/dashboard?fromDate=${kun(bugun - 29 * 864e5)}&toDate=${kun(bugun)}&compare=previous_period&platform=instagram&topPosts=0&recentPosts=0`),
    z(`/analytics?accountId=${IG_HISOB}&limit=20&sortBy=date&order=desc&view=summary`),
    z(`/posts?status=scheduled&limit=20`).catch(() => ({ posts: [] })),
    z(`/analytics/best-time?accountId=${IG_HISOB}`).catch(() => ({ slots: [] })),
  ]);
  const data = {
    ulangan: true,
    yangilandi: bugun,
    oxirgiSinx: dash?.dataAsOf ?? postlar?.overview?.lastSync ?? null,
    obunachi: dash?.followers?.current ?? null,
    obunachiOsish: dash?.followers?.gained ?? 0,
    jami: dash?.totals ?? {},
    oldingi: dash?.previousTotals ?? {},
    kunlik: (dash?.daily ?? []).map((d: any) => ({ sana: d.date, korish: d.views ?? d.impressions ?? 0, qamrov: d.reach ?? 0 })),
    postlar: (postlar?.posts ?? []).map((p: any) => ({
      id: p.latePostId ?? p._id,
      matn: String(p.content ?? "").slice(0, 300),
      sana: p.publishedAt,
      havola: p.platformPostUrl ?? p.platforms?.[0]?.platformPostUrl ?? null,
      rasm: p.thumbnailUrl ?? null,
      tur: p.mediaProductType ?? p.mediaType ?? null,
      m: p.analytics ?? {},
    })),
    rejadagi: (rejadagi?.posts ?? rejadagi?.data ?? []).map((p: any) => ({
      id: p._id, matn: String(p.content ?? "").slice(0, 200), vaqt: p.scheduledFor, holat: p.status,
    })),
    engYaxshi: (eng?.slots ?? []).slice(0, 5),
  };
  await q(`insert into agent_sozlama (kalit, qiymat) values ('akkaunt_kesh', $1::jsonb) on conflict (kalit) do update set qiymat = excluded.qiymat`,
    [JSON.stringify({ vaqt: bugun, data })]);
  return data;
}

// ---------- Eng yaxshi vaqt: keyingi 7 kundagi eng yaxshi slot (UTC) ----------
// best-time: day_of_week 0 = dushanba, soat UTC
export async function engYaxshiVaqt(): Promise<Date> {
  let slots: any[] = [];
  try { slots = (await z(`/analytics/best-time?accountId=${IG_HISOB}`))?.slots ?? []; } catch { /* yo'q */ }
  const hozir = Date.now() + 20 * 60_000;
  const nomzodlar: Date[] = [];
  for (const s of slots.filter((x) => x.avg_engagement > 0).slice(0, 3)) {
    for (let d = 0; d < 8; d++) {
      const t = new Date(Date.UTC(new Date(hozir).getUTCFullYear(), new Date(hozir).getUTCMonth(), new Date(hozir).getUTCDate() + d, s.hour, 0));
      const dow = (t.getUTCDay() + 6) % 7;
      if (dow === s.day_of_week && t.getTime() > hozir) { nomzodlar.push(t); break; }
    }
  }
  if (nomzodlar.length) return nomzodlar.sort((a, b) => a.getTime() - b.getTime())[0];
  // Ma'lumot kam: bugun yoki ertaga 19:00 (Toshkent) — kechki faol vaqt
  const t = new Date(); t.setUTCHours(14, 0, 0, 0);
  if (t.getTime() < hozir) t.setUTCDate(t.getUTCDate() + 1);
  return t;
}

// ---------- Media yuklash (presign → PUT) ----------
export async function mediaYukla(buf: Buffer, nom: string, mime: string): Promise<string> {
  const p = await z(`/media/presign`, { method: "POST", body: JSON.stringify({ filename: nom, contentType: mime }) });
  const r = await fetch(p.uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: new Blob([new Uint8Array(buf)], { type: mime }) });
  if (!r.ok) throw new Error(`Media yuklanmadi: ${r.status}`);
  return p.publicUrl;
}

// ---------- Post yaratish ----------
export async function postYarat(o: { matn: string; mediaUrl: string; mediaUrls?: string[]; mediaTur: "video" | "image"; vaqt: Date | null }) {
  const body: any = {
    content: o.matn,
    mediaItems: (o.mediaUrls?.length ? o.mediaUrls : [o.mediaUrl]).map((url) => ({ type: o.mediaTur, url })),
    platforms: [{ platform: "instagram", accountId: IG_HISOB }],
  };
  if (o.vaqt) { body.scheduledFor = o.vaqt.toISOString(); body.timezone = "UTC"; }
  else body.publishNow = true;
  const j = await z(`/posts`, { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": crypto.randomUUID() } });
  const post = j?.post ?? j;
  await q(`delete from agent_sozlama where kalit = 'akkaunt_kesh'`);
  return { id: post?._id as string, holat: post?.status as string, havola: post?.platforms?.[0]?.platformPostUrl ?? null };
}

export async function postOchir(id: string) {
  await z(`/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
  await q(`delete from agent_sozlama where kalit = 'akkaunt_kesh'`);
  return { ok: true };
}

export async function postHavolasi(id: string): Promise<string | null> {
  try { const j = await z(`/posts/${encodeURIComponent(id)}`); const p = j?.post ?? j; return p?.platforms?.[0]?.platformPostUrl ?? null; } catch { return null; }
}
