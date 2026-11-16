// Istalgan sahifaga (g'oya, vazifa, loyiha, qiziqish, TATU, dars...) media biriktirish.
// Qoida: 5 MB gacha — Notion sahifasining ichiga (fayl bloki);
//        kattasi — Telegram fayllar guruhiga, Notion'da esa havola bloki qoladi.

import { sahifaOl, bloklarOl, bloklarQosh, blokOl, blokOchir, faylYukla, faylBlok, yangila, sarlavha, dsId, tgFaylMatn, type FaylTuri } from "./notion";
import { tgFaylOqi, type ArxivFayl, type Bolim } from "./arxiv";
import { BOLIMLAR } from "./bolimlar";
import { bloklardanMedia, telegram, tgHavolaYoz, type MediaItem } from "./media";

export const NOTION_CHEGARA = 5 * 1024 * 1024; // Notion bepul tarifi
const norm = (s: string) => s.replace(/-/g, "");

// Media biriktirish mumkin bo'lgan bazalar
const RUXSAT = () =>
  new Set(
    [
      process.env.YOZUVLAR_DS_ID,
      process.env.MOLIYA_DS_ID,
      process.env.LOYIHALAR_DS_ID,
      ...Object.entries(BOLIMLAR).filter(([k]) => k !== "byudjet").map(([, b]) => b.ds),
    ]
      .filter(Boolean)
      .map((x) => norm(String(x))),
  );

export async function sahifaTekshir(pageId: string) {
  const page = await sahifaOl(pageId);
  if (!RUXSAT().has(dsId(page))) throw new Error("Bu sahifaga media biriktirib bo'lmaydi");
  return page;
}

async function soniniOzgartir(page: any, d: number) {
  const joriy = page?.properties?.["Media soni"]?.number ?? 0;
  await yangila(page.id, { "Media soni": { number: Math.max(0, joriy + d) } }).catch((e) => console.error(e));
}

export function blokTuri(mime: string): FaylTuri {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "file";
}
export function arxivBolim(mime: string): Bolim {
  if (mime.startsWith("image/")) return "rasm";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "ovoz";
  return "hujjat";
}

// Kichik fayl -> Notion sahifasiga
export async function notionGaBiriktir(pageId: string, fayl: Blob, nomi: string, mime: string, izoh?: string, page?: any) {
  const p = page ?? (await sahifaTekshir(pageId));
  if (fayl.size > NOTION_CHEGARA) throw new Error("Fayl 5 MB dan katta — uni bot orqali yuboring");
  const up = await faylYukla(fayl, nomi, mime);
  await bloklarQosh(p.id, [faylBlok(blokTuri(mime), up, izoh)]);
  await soniniOzgartir(p, 1);
}

// Katta fayl (Telegram guruhida) -> Notion'da havola bloki
export async function telegramGaBiriktir(pageId: string, f: ArxivFayl, nomi: string, page?: any) {
  const p = page ?? (await sahifaTekshir(pageId));
  const url = tgHavolaYoz(f);
  await bloklarQosh(p.id, [
    {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: `📁 ${nomi} — Telegram arxivida`, link: { url } } }] },
    },
  ]);
  await soniniOzgartir(p, 1);
}

// Sahifadagi barcha media (Notion bloklari + Telegram havolalari + "TG fayl" maydoni)
export async function ilovalar(pageId: string): Promise<MediaItem[]> {
  const page = await sahifaTekshir(pageId);
  const asos = { nom: sarlavha(page), sana: page.created_time, loyihalar: [] as string[], sahifa: page.id };
  const [bloklar] = await Promise.all([bloklarOl(page.id)]);
  const r = await bloklardanMedia(bloklar, page.id, asos);
  const bor = new Set(r.map((x) => x.key));
  for (const f of tgFaylOqi(tgFaylMatn(page))) {
    const it = telegram(f, asos);
    if (it && !bor.has(it.key)) r.push(it);
  }
  return r;
}

// Biriktirilgan blokni o'chirish (Telegram guruhidagi asl fayl joyida qoladi)
export async function ilovaOchir(blockId: string) {
  const b = await blokOl(blockId);
  const pageId = b?.parent?.page_id;
  if (!pageId) throw new Error("Blok topilmadi");
  const page = await sahifaTekshir(pageId);
  if (!["image", "video", "audio", "file", "pdf", "paragraph", "embed", "bookmark"].includes(b.type)) throw new Error("Bu media emas");
  await blokOchir(blockId);
  await soniniOzgartir(page, -1);
}
