// Loyiha media galereyasi: Telegram arxivi, Notion fayllari va internet havolalari bir ro'yxatda.

import crypto from "node:crypto";
import { YOZUVLAR, LOYIHALAR, sorovHammasi, bloklarOl, sarlavha, tgFaylMatn } from "./notion";
import { tgFaylOqi, arxivHavola, type ArxivFayl } from "./arxiv";
import { BOLIMLAR } from "./bolimlar";

export const KONTENT = () => process.env.KONTENT_DS_ID || "086825d3-689d-4d30-8d2b-2c4d6a6279e1";
const MAKS_TG = 20 * 1024 * 1024; // Bot API getFile chegarasi
const BOSHQA = (): Array<[string, string]> => [
  ["O'rganish", BOLIMLAR.organish.ds],
  ["TATU", BOLIMLAR.topshiriq.ds],
  ["TATU", BOLIMLAR.fan.ds],
  ["O'qitish", BOLIMLAR.dars.ds],
  ["O'rganish", BOLIMLAR.odars.ds],
  ["O'qitish", BOLIMLAR.modul.ds],
  ["Qarz", BOLIMLAR.qarz.ds],
  ["Jamg'arma", BOLIMLAR.jamgarma.ds],
  ["To'lov", BOLIMLAR.doimiy.ds],
];

export type MediaItem = {
  key: string;
  tur: "rasm" | "video" | "youtube" | "havola" | "ovoz" | "fayl";
  manba: "telegram" | "notion" | "internet";
  nom: string;
  sana: string;
  loyihalar: string[];
  src?: string | null;
  thumb?: string | null;
  url?: string;
  tgLink?: string;
  sahifa?: string;
  hajm?: number;
  katta?: boolean;
  sayt?: boolean;
  blockId?: string;
  bolim?: string;
};

// ---------- imzo (proksi havolalari uchun) ----------
const kalit = () => `${process.env.TELEGRAM_BOT_TOKEN}:media`;
const hmac = (s: string) => crypto.createHmac("sha256", kalit()).update(s).digest("hex").slice(0, 32);
export function imzoTekshir(f: string, e: number, s: string) {
  if (!e || e < Date.now() / 1000) return false;
  const t = hmac(`${f}.${e}`);
  return t.length === s.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(s));
}
export function proksi(f: string) {
  const e = (Math.floor(Date.now() / 3600000) + 7) * 3600; // soat boshiga yaxlitlangan: kesh ishlaydi
  return `/api/media?f=${encodeURIComponent(f)}&e=${e}&s=${hmac(`${f}.${e}`)}`;
}

// ---------- internet havolalari ----------
const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i;
const RASM = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const OG = new Map<string, { img: string | null; title: string | null; t: number }>();

const domen = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const meta = (html: string, nomlar: string[]) => {
  for (const n of nomlar) {
    const r =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']`, "i")) ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, "i"));
    if (r) return r[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  return null;
};

async function ogOl(url: string) {
  const k = OG.get(url);
  if (k && Date.now() - k.t < 6 * 3600 * 1000) return k;
  let v = { img: null as string | null, title: null as string | null, t: Date.now() };
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(3500),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TelegramBot (like TwitterBot))", Accept: "text/html" },
    });
    if (r.ok && (r.headers.get("content-type") || "").includes("html")) {
      const html = (await r.text()).slice(0, 400_000);
      const img = meta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
      const title = meta(html, ["og:title", "twitter:title"]) ?? html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null;
      v = { img: img ? new URL(img, r.url || url).toString() : null, title, t: Date.now() };
    }
  } catch {
    /* sayt javob bermadi — oddiy havola sifatida ko'rsatamiz */
  }
  OG.set(url, v);
  return v;
}

const skrinshot = (url: string) => `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=800&h=600`;

async function internet(url: string, asos: Omit<MediaItem, "key" | "tur" | "manba" | "nom">, nom?: string): Promise<MediaItem> {
  const yt = url.match(YT);
  if (yt) return { ...asos, key: `yt:${yt[1]}`, tur: "youtube", manba: "internet", nom: nom || "YouTube video", url, thumb: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`, src: yt[1] };
  if (RASM.test(url)) return { ...asos, key: `u:${url}`, tur: "rasm", manba: "internet", nom: nom || domen(url), url, src: url, thumb: url };
  if (VIDEO.test(url)) return { ...asos, key: `u:${url}`, tur: "video", manba: "internet", nom: nom || domen(url), url, src: url };
  const og = await ogOl(url);
  return {
    ...asos,
    key: `u:${url}`,
    tur: "havola",
    manba: "internet",
    nom: nom || og.title || domen(url),
    url,
    thumb: og.img ?? (asos.sayt ? skrinshot(url) : null),
  };
}

// ---------- Telegram arxivi ----------
// id=0 — fayl arxivda emas (kichik fayl Notion'da saqlangan), u Notion blokidan olinadi
export function telegram(f: ArxivFayl, asos: Omit<MediaItem, "key" | "tur" | "manba">): MediaItem | null {
  if (!f.id) return null;
  const katta = (f.s ?? 0) > MAKS_TG;
  const tgLink = arxivHavola(f.id, f.bolim);
  const src = f.f && !katta ? proksi(f.f) : null;
  const thumb = f.t ? proksi(f.t) : null;
  const umumiy = { ...asos, key: `tg:${f.id}`, manba: "telegram" as const, src, tgLink, hajm: f.s, katta };
  if (f.bolim === "rasm") return { ...umumiy, tur: "rasm", thumb: thumb ?? src };
  if (f.bolim === "video") return { ...umumiy, tur: "video", thumb };
  if (f.bolim === "ovoz") return { ...umumiy, tur: "ovoz", thumb: null };
  return { ...umumiy, tur: "fayl", thumb };
}

// Notion'dagi Telegram havola bloki: https://t.me/c/<chat>/<topic>/<msg>#pos=<bolim>.<file_id>.<hajm>.<thumb>
const TG_LINK = /^https:\/\/t\.me\/c\/\d+\/(?:\d+\/)?(\d+)(?:#pos=([a-z]+)\.([\w-]+)\.(\d+)(?:\.([\w-]+))?)?/;
export const tgHavolaYoz = (f: ArxivFayl) => `${arxivHavola(f.id, f.bolim)}#pos=${f.bolim}.${f.f ?? ""}.${f.s ?? 0}${f.t ? "." + f.t : ""}`;

// ---------- Notion bloklari ----------
export async function bloklardanMedia(bloklar: any[], pageId: string, asos: Omit<MediaItem, "key" | "tur" | "manba">): Promise<MediaItem[]> {
  const r: Array<MediaItem | Promise<MediaItem> | null> = [];
  for (const b of bloklar) {
    const x = b[b.type];
    if (b.type === "paragraph") {
      const link = (x?.rich_text ?? []).map((t: any) => t.text?.link?.url ?? t.href).find((u: string) => u && TG_LINK.test(u));
      if (!link) continue;
      const m = link.match(TG_LINK)!;
      if (!m[2]) continue; // eski havola — "TG fayl" maydonidan olinadi
      const nom = (x.rich_text ?? []).map((t: any) => t.plain_text).join("").replace(/^📁\s*/, "").replace(/\s*—\s*Telegram arxivida$/, "") || asos.nom;
      const it = telegram({ bolim: m[2] as any, id: Number(m[1]), f: m[3], s: Number(m[4]), ...(m[5] ? { t: m[5] } : {}) }, { ...asos, nom });
      if (it) r.push({ ...it, blockId: b.id, sahifa: pageId });
      continue;
    }
    const url: string | undefined = x?.type === "external" ? x.external?.url : x?.type === "file" ? x.file?.url : x?.url;
    if (!url) continue;
    const izoh = (x.caption ?? []).map((t: any) => t.plain_text).join("") || x?.name || asos.nom;
    const base = { ...asos, nom: izoh, key: `n:${b.id}`, manba: "notion" as const, src: url, sahifa: pageId, blockId: b.id };
    if (b.type === "image") r.push({ ...base, tur: "rasm", thumb: url });
    else if (b.type === "video") r.push(YT.test(url) ? internet(url, asos, izoh).then((i) => ({ ...i, blockId: b.id })) : { ...base, tur: "video" });
    else if (b.type === "audio") r.push({ ...base, tur: "ovoz" });
    else if (b.type === "file" || b.type === "pdf") r.push({ ...base, tur: "fayl", nom: x?.name || izoh });
    else if (b.type === "embed" || b.type === "bookmark" || b.type === "link_preview") r.push(internet(url, asos).then((i) => ({ ...i, blockId: b.id })));
  }
  return (await Promise.all(r)).filter(Boolean) as MediaItem[];
}

async function notionBloklar(pageId: string, asos: Omit<MediaItem, "key" | "tur" | "manba">): Promise<MediaItem[]> {
  const bloklar = await bloklarOl(pageId).catch(() => []);
  return bloklardanMedia(bloklar, pageId, asos);
}

// Bir vaqtda ko'p Notion so'rovi yubormaslik uchun navbat
async function navbat<T>(ishlar: Array<() => Promise<T>>, n = 5): Promise<T[]> {
  const natija: T[] = new Array(ishlar.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, ishlar.length) }, async () => {
    while (i < ishlar.length) {
      const k = i++;
      natija[k] = await ishlar[k]();
    }
  }));
  return natija;
}

// ---------- yig'ish ----------
const rel = (p: any, nom: string): string[] => (p?.properties?.[nom]?.relation ?? []).map((x: any) => x.id);
const norm = (id: string) => id.replace(/-/g, "");

export async function mediaRoyxati() {
  const [yozuvlar, kontent, loyihalar] = await Promise.all([
    sorovHammasi(
      YOZUVLAR(),
      {
        filter: {
          or: [
            { property: "TG fayl", rich_text: { is_not_empty: true } },
            { property: "Havola", url: { is_not_empty: true } },
            { property: "Loyiha", relation: { is_not_empty: true } },
            { property: "Media soni", number: { greater_than: 0 } },
          ],
        },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
      },
      300,
    ),
    sorovHammasi(KONTENT(), { filter: { property: "Post havolasi", url: { is_not_empty: true } } }, 200).catch(() => []),
    sorovHammasi(LOYIHALAR(), {}, 50),
  ]);

  const ishlar: Array<Promise<MediaItem | MediaItem[] | null> | MediaItem | null> = [];
  const skanlar: Array<() => Promise<MediaItem[]>> = [];
  let skan = 0;
  for (const p of yozuvlar) {
    const asos = { nom: sarlavha(p), sana: p.created_time, loyihalar: rel(p, "Loyiha"), sahifa: p.id };
    const fayllar = tgFaylOqi(tgFaylMatn(p));
    fayllar.forEach((f) => ishlar.push(telegram(f, asos)));
    const havola: string | null = p.properties?.Havola?.url ?? null;
    if (havola) ishlar.push(internet(havola, asos, asos.nom.startsWith("http") ? undefined : asos.nom));
    // Biriktirilgan media bor yoki loyihaga bog'langan sahifa — ichidagi bloklarni o'qiymiz
    const soni = p.properties?.["Media soni"]?.number ?? 0;
    if (soni > 0 || fayllar.some((f) => !f.id)) skanlar.push(() => notionBloklar(p.id, asos));
    else if (!fayllar.length && asos.loyihalar.length && skan < 10) {
      skan++;
      skanlar.push(() => notionBloklar(p.id, asos));
    }
  }
  for (const k of kontent) {
    const url = k.properties?.["Post havolasi"]?.url;
    if (url) ishlar.push(internet(url, { sana: k.properties?.["Chiqish sanasi"]?.date?.start ?? k.created_time, loyihalar: rel(k, "Loyiha"), sahifa: k.id }, sarlavha(k)));
  }
  for (const l of loyihalar) {
    const asos = { nom: sarlavha(l), sana: l.created_time, loyihalar: [l.id], sahifa: l.id };
    const sayt = l.properties?.Sayt?.url;
    if (sayt) ishlar.push(internet(sayt, { ...asos, sayt: true }, `${asos.nom} — sayt`));
    skanlar.push(() => notionBloklar(l.id, asos));
  }
  // Boshqa bo'limlar (O'rganish, TATU, O'qitish, qarz/jamg'arma): media biriktirilgan sahifalar
  for (const [bolim, ds] of BOSHQA()) {
    const sahifalar = await sorovHammasi(ds, { filter: { property: "Media soni", number: { greater_than: 0 } } }, 100).catch(() => []);
    for (const p of sahifalar) {
      const asos = { nom: sarlavha(p), sana: p.created_time, loyihalar: rel(p, "Loyiha"), sahifa: p.id, bolim };
      skanlar.push(() => notionBloklar(p.id, asos));
    }
  }
  ishlar.push(navbat(skanlar).then((x) => x.flat()));

  const hammasi = (await Promise.all(ishlar)).flat().filter(Boolean) as MediaItem[];
  const korilgan = new Set<string>();
  const items = hammasi
    .filter((x) => (korilgan.has(x.key) ? false : (korilgan.add(x.key), true)))
    .map((x) => ({ ...x, loyihalar: x.loyihalar.map(norm) }))
    .sort((a, b) => Number(Boolean(b.sayt)) - Number(Boolean(a.sayt)) || b.sana.localeCompare(a.sana));
  return {
    items,
    loyihalar: loyihalar.map((l) => ({ id: norm(l.id), nom: sarlavha(l), holat: l.properties?.Holat?.select?.name ?? null })),
  };
}
