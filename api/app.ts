// Mini App API: Telegram initData bilan himoyalangan, Notion'dan o'qiydi va yozadi.

import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bugunToshkent, kunQosh, parse, KATEGORIYALAR } from "../lib/parse";
import {
  bugungiVazifalar,
  haftaVazifalari,
  oxirgiYozuvlar,
  havolaBlok,
  inboxYozuvlari,
  oyMoliyasi,
  barchaLoyihalar,
  yozuvQosh,
  moliyaQosh,
  yangila,
  sarlavha,
  tgFaylMatn,
} from "../lib/notion";
import { sttBor, transkripsiya } from "../lib/stt";
import { bittaOl, BOLIMLAR, saqla, olibTashla, moliyaMarkazi, tolandi, jamgarmaQosh, oqishBolimi, organishBolimi, oqitishBolimi, eslatmalar } from "../lib/bolimlar";
import { arxivgaYukla, arxivgaMedia, arxivHavola, tgFaylYoz } from "../lib/arxiv";
import { mediaRoyxati } from "../lib/media";
import { kutubxona, kurslar, kurs, dars, darsHolat, qaydQosh, sahifa, loyihaSahifa, loyihalarRoyxati, qidiruv } from "../lib/korish";
import { ilovalar, notionGaBiriktir, ilovaOchir, sahifaTekshir } from "../lib/ilova";
import { yubor } from "../lib/telegram";
import { qisqa } from "../lib/ids";
import { faylYukla, faylBlok } from "../lib/notion";

// ---------- Telegram WebApp initData tekshiruvi ----------
function foydalanuvchi(initData: string): string | null {
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

// ---------- Notion qiymatlarini o'qish ----------
const p = (page: any, nom: string) => page?.properties?.[nom];
const tanlov = (page: any, nom: string): string | null => p(page, nom)?.select?.name ?? null;
const son = (page: any, nom: string): number => {
  const x = p(page, nom);
  if (!x) return 0;
  if (x.type === "number") return x.number ?? 0;
  if (x.type === "rollup") return x.rollup?.number ?? 0;
  if (x.type === "formula") return x.formula?.number ?? 0;
  return 0;
};
const matn = (page: any, nom: string): string => (p(page, nom)?.rich_text ?? []).map((t: any) => t.plain_text).join("");
const sana = (page: any, nom: string): string | null => p(page, nom)?.date?.start?.slice(0, 10) ?? null;
const relId = (page: any, nom: string): string | null => p(page, nom)?.relation?.[0]?.id ?? null;

function vazifa(page: any, loyihaNomi: Map<string, string>, bugun: string) {
  const muddat = sana(page, "Muddat");
  const lid = relId(page, "Loyiha");
  return {
    id: page.id,
    nom: sarlavha(page),
    muddat,
    kechikkan: Boolean(muddat && muddat < bugun),
    tez: Boolean(p(page, "Tez ish")?.checkbox),
    loyiha: lid ? loyihaNomi.get(lid) ?? null : null,
  };
}

async function loyihaXaritasi() {
  const l = await barchaLoyihalar();
  return { royxat: l, nomlar: new Map(l.map((x: any) => [x.id, sarlavha(x)])) };
}

// ---------- Amallar ----------
type Amal = (b: any, bugun: string) => Promise<unknown>;

const AMALLAR: Record<string, Amal> = {
  // Bosh sahifa = Bugun: umumiy ko'rsatkichlar + bugungi vazifalar, eslatmalar va keyingi kunlar
  async home(b, bugun) {
    const [h, g] = await Promise.all([AMALLAR.homeAsos(b, bugun) as Promise<any>, AMALLAR.bugun(b, bugun) as Promise<any>]);
    return { ...h, ...g };
  },
  async homeAsos(_b, bugun) {
    const [vaz, inbox, { royxat, nomlar }, oxirgi, esl] = await Promise.all([
      bugungiVazifalar(bugun),
      inboxYozuvlari(),
      loyihaXaritasi(),
      oxirgiYozuvlar(5),
      Promise.resolve([]),
    ]);
    const kechikkan = vaz.filter((v) => (sana(v, "Muddat") ?? bugun) < bugun).length;
    return {
      oxirgi: oxirgi.map((x) => ({ ...vazifa(x, nomlar, bugun), turi: tanlov(x, "Turi"), holat: tanlov(x, "Holat"), yaratildi: x.created_time })),
      bugun: vaz.length - kechikkan,
      kechikkan,
      eslatmalar: esl,
      inbox: inbox.length,
      maqsad: royxat
        .filter((l: any) => p(l, "Maqsadda")?.checkbox)
        .map((l: any) => ({
          id: l.id,
          nom: sarlavha(l),
          obunachi: son(l, "Telegram obunachi") + son(l, "Instagram obunachi"),
          mijoz: son(l, "Real mijozlar"),
        })),
    };
  },

  async bugun(_b, bugun) {
    const [vaz, inbox, { nomlar }, kelgusi, esl] = await Promise.all([
      bugungiVazifalar(bugun),
      inboxYozuvlari(),
      loyihaXaritasi(),
      haftaVazifalari(bugun, kunQosh(bugun, 14)),
      eslatmalar(bugun).catch((e) => (console.error(e), [])),
    ]);
    return {
      eslatmalar: esl,
      vazifalar: vaz.map((v) => vazifa(v, nomlar, bugun)),
      kelgusi: kelgusi.map((v) => vazifa(v, nomlar, bugun)),
      muddatsiz: inbox.filter((x) => tanlov(x, "Turi") === "Vazifa").map((v) => vazifa(v, nomlar, bugun)),
    };
  },

  async inbox(_b, bugun) {
    const [inbox, { nomlar }] = await Promise.all([inboxYozuvlari(), loyihaXaritasi()]);
    return {
      yozuvlar: inbox.map((x) => ({
        ...vazifa(x, nomlar, bugun),
        turi: tanlov(x, "Turi"),
        yaratildi: x.created_time,
        fayl: tgFaylMatn(x).length > 0,
      })),
    };
  },

  async loyihalar() {
    const { royxat } = await loyihaXaritasi();
    return {
      loyihalar: royxat.map((l: any) => ({
        id: l.id,
        nom: sarlavha(l),
        holat: tanlov(l, "Holat"),
        maqsadda: Boolean(p(l, "Maqsadda")?.checkbox),
        tg: son(l, "Telegram obunachi"),
        ig: son(l, "Instagram obunachi"),
        mijoz: son(l, "Real mijozlar"),
        ochiq: son(l, "Ochiq vazifalar"),
        keyingi: matn(l, "Keyingi qadam"),
      })),
    };
  },

  async pul(_b, bugun) {
    const m = await moliyaMarkazi(bugun);
    const { yozuvlar, daromad, xarajat, kat } = m.xulosa;
    return {
      oy: bugun.slice(0, 7),
      daromad,
      xarajat,
      kategoriyalar: [...kat.entries()].sort((a, b) => b[1] - a[1]).map(([nom, summa]) => ({ nom, summa })),
      oxirgi: yozuvlar
        .sort((a, b) => ((sana(a, "Sana") ?? "") < (sana(b, "Sana") ?? "") ? 1 : a.created_time < b.created_time ? 1 : -1))
        .slice(0, 10)
        .map((x) => ({ id: x.id, nom: sarlavha(x), summa: son(x, "Summa"), turi: tanlov(x, "Turi"), kategoriya: tanlov(x, "Kategoriya"), sana: sana(x, "Sana") })),
      barchaKategoriyalar: KATEGORIYALAR,
      byudjet: m.byudjet,
      doimiy: m.doimiy,
      doimiyNofaol: m.doimiyNofaol,
      qarzlar: m.qarzlar,
      menga: m.menga,
      mendan: m.mendan,
      jamgarma: m.jamgarma,
    };
  },

  async oqish(_b, bugun) {
    return oqishBolimi(bugun);
  },
  async organish() {
    return organishBolimi();
  },
  async oqitish(_b, bugun) {
    return oqitishBolimi(bugun);
  },
  async bolimlar(_b, bugun) {
    const [o, r, t, { royxat }] = await Promise.all([oqishBolimi(bugun), organishBolimi(), oqitishBolimi(bugun), loyihaXaritasi()]);
    const ochiqT = o.topshiriqlar.filter((x: any) => x.holat !== "Topshirildi");
    const jami = t.modullar.reduce((s: number, m: any) => s + (m.soat ?? 0), 0);
    const otilgan = t.modullar.reduce((s: number, m: any) => s + m.otilgan, 0);
    return {
      loyihalar: royxat.filter((l: any) => ["Faol", "Relizda", "Ikkinchi darajali"].includes(tanlov(l, "Holat") ?? "")).length,
      oqish: { ochiq: ochiqT.length, kechikkan: ochiqT.filter((x: any) => x.kechikkan).length, fanlar: o.fanlar.length },
      organish: { jarayonda: r.royxat.filter((x: any) => x.holat === "Jarayonda").length, jami: r.royxat.length },
      oqitish: { otilgan, jami, keyingi: t.keyingi[0] ?? null },
    };
  },

  // --- Biriktirilgan media (istalgan kartochka) ---
  async ol(b) {
    if (!BOLIMLAR[b.bolim]) throw new Error("Noma'lum bo'lim");
    return { yozuv: await bittaOl(b.bolim, String(b.id)) };
  },
  async ilovalar(b) {
    return { items: await ilovalar(String(b.id)) };
  },
  async biriktir(b) {
    const buf = Buffer.from(String(b.fayl || ""), "base64");
    if (!buf.length) throw new Error("Fayl tanlanmadi");
    if (buf.length > 3.2 * 1024 * 1024) throw new Error("Fayl katta — «Katta fayl» tugmasi bilan bot orqali yuboring");
    const mime = String(b.mime || "application/octet-stream").split(";")[0];
    const nomi = String(b.nomi || "fayl").slice(0, 80);
    await notionGaBiriktir(String(b.id), new Blob([buf], { type: mime }), nomi, mime, b.izoh ? String(b.izoh).slice(0, 200) : undefined);
    return { ok: true };
  },
  async ilovaOchir(b) {
    await ilovaOchir(String(b.blockId));
    return { ok: true };
  },
  // Katta fayl: bot foydalanuvchiga xabar yuboradi, unga javob qilib fayl yuboriladi
  async katta(b) {
    const page = await sahifaTekshir(String(b.id));
    await yubor(
      String(process.env.ALLOWED_CHAT_ID),
      `📎 <b>${sarlavha(page).replace(/[<>&]/g, "")}</b>\n\nShu xabarga <b>javob (Reply)</b> qilib rasm, video, ovozli xabar yoki fayl yuboring — u shu yozuvga biriktiriladi.\n<i>5 MB gacha — Notion'ga, kattasi — fayllar guruhiga.</i>`,
      [[{ text: "📎 Fayl kutilmoqda", callback_data: `ib:${qisqa(page.id)}` }]],
    );
    return { ok: true };
  },

  // --- Ko'rish va o'rganish rejimi ---
  async kutubxona() {
    return kutubxona();
  },
  async kurslar() {
    return { kurslar: await kurslar() };
  },
  async kurs(b) {
    return kurs(String(b.key));
  },
  async dars(b) {
    return dars(String(b.key), String(b.darsId));
  },
  async darsHolat(b) {
    return darsHolat(String(b.key), String(b.darsId), Boolean(b.done));
  },
  async qayd(b) {
    return qaydQosh(String(b.id), String(b.matn || ""), b.vaqt == null ? null : Number(b.vaqt));
  },
  async sahifa(b) {
    return sahifa(String(b.id));
  },
  async kloyiha(b) {
    return loyihaSahifa(String(b.id));
  },
  async kloyihalar() {
    return { loyihalar: await loyihalarRoyxati() };
  },
  async kmedia() {
    return mediaRoyxati();
  },
  async qidiruv(b) {
    return qidiruv(String(b.q || ""));
  },

  // --- Media galereya ---
  async media() {
    return mediaRoyxati();
  },
  // Loyihaga havola yoki rasm/video qo'shish (ilovadan)
  async mediaQosh(b, bugun) {
    const loyiha = b.loyiha ? String(b.loyiha) : undefined;
    const izoh = String(b.izoh || "").trim();
    if (b.havola) {
      const url = String(b.havola).trim();
      if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("Havola http:// yoki https:// bilan boshlansin");
      await yozuvQosh({ turi: "Havola", nomi: izoh || url, havola: url, manba: "Ilova", loyiha });
      return { ok: true };
    }
    const buf = Buffer.from(String(b.fayl || ""), "base64");
    if (!buf.length) throw new Error("Fayl tanlanmadi");
    if (buf.length > 3.2 * 1024 * 1024) throw new Error("Fayl juda katta. Katta video/rasmni botga yuboring");
    const mime = String(b.mime || "application/octet-stream");
    const rasm = mime.startsWith("image/");
    if (!rasm && !mime.startsWith("video/")) throw new Error("Faqat rasm yoki video");
    const bolim = rasm ? "rasm" : "video";
    const nomi = izoh || (rasm ? "📷 Rasm" : "🎬 Video");
    const fayl = new Blob([buf], { type: mime });
    const fNomi = String(b.nomi || (rasm ? "rasm.jpg" : "video.mp4")).slice(0, 80);
    const arx = await arxivgaMedia(fayl, fNomi, bolim, `${nomi}\n<i>${bugun} · ilovadan</i>`);
    const bloklar: any[] = [];
    if (rasm) {
      const up = await faylYukla(fayl, fNomi, mime).catch((e) => (console.error(e), null));
      if (up) bloklar.push(faylBlok("image", up));
    }
    if (arx) bloklar.push(havolaBlok("📁 Telegram arxivida ochish", arxivHavola(arx.id, bolim)));
    await yozuvQosh({ turi: "Qayd", nomi, manba: "Ilova", loyiha, tgFayl: arx ? tgFaylYoz([arx]) : undefined, bloklar });
    return { ok: true };
  },

  // Umumiy: istalgan bo'limga yozish / tahrirlash / o'chirish
  async saqla(b) {
    if (!BOLIMLAR[b.bolim]) throw new Error("Noma'lum bo'lim");
    return { ok: true, yozuv: await saqla(b.bolim, b.id || undefined, b.q ?? {}) };
  },
  async ochirish(b) {
    if (!BOLIMLAR[b.bolim]) throw new Error("Noma'lum bo'lim");
    await olibTashla(b.bolim, String(b.id));
    return { ok: true };
  },
  async tolandi(b, bugun) {
    return tolandi(String(b.id), bugun, Number(b.summa) || undefined);
  },
  async jamgarma(b) {
    return jamgarmaQosh(String(b.id), Number(String(b.summa).replace(/[^\d.\-]/g, "")) || 0);
  },

  // --- yozish ---
  async holat(b) {
    await yangila(b.id, { Holat: { select: { name: b.holat === "Bajarildi" ? "Bajarildi" : "Kutilmoqda" } } });
    return { ok: true };
  },

  async muddat(b, bugun) {
    const kun = b.kun === null ? null : kunQosh(bugun, Number(b.kun) || 0);
    await yangila(b.id, { Muddat: { date: kun ? { start: kun } : null } });
    return { ok: true, muddat: kun };
  },

  async turi(b) {
    const ruxsat = ["Saralanmagan", "Vazifa", "G'oya", "Qayd", "Havola", "Qaror"];
    if (!ruxsat.includes(b.turi)) throw new Error("Noto'g'ri tur");
    const props: Record<string, unknown> = { Turi: { select: { name: b.turi } } };
    if (b.turi === "Vazifa") props.Holat = { select: { name: "Kutilmoqda" } };
    await yangila(b.id, props);
    return { ok: true };
  },

  async loyiha(b) {
    const props: Record<string, unknown> = {};
    if (b.tg !== undefined) props["Telegram obunachi"] = { number: Math.max(0, Number(b.tg) || 0) };
    if (b.ig !== undefined) props["Instagram obunachi"] = { number: Math.max(0, Number(b.ig) || 0) };
    if (b.keyingi !== undefined) props["Keyingi qadam"] = { rich_text: [{ type: "text", text: { content: String(b.keyingi).slice(0, 500) } }] };
    await yangila(b.id, props);
    return { ok: true };
  },

  // Tezkor yozish: bot bilan bir xil qoidalar (+/- pul, sana so'zlari, prefikslar)
  async yozuv(b, bugun) {
    const text = String(b.matn || "").trim();
    if (!text) throw new Error("Matn bo'sh");
    const x = parse(text, bugun);
    if (x.kind === "moliya") {
      const page = await moliyaQosh({ ...x, sana: bugun });
      return { ok: true, id: page.id, joy: "Moliya", muddat: null };
    }
    if (x.kind !== "yozuv") throw new Error("Bu buyruqni botga yuboring");
    const turi = b.turi && b.turi !== "auto" ? b.turi : x.turi;
    const muddat = b.kun !== undefined && b.kun !== null ? kunQosh(bugun, Number(b.kun) || 0) : x.muddat;
    const page = await yozuvQosh({ turi, nomi: x.nomi, havola: x.havola, muddat, manba: "Ilova" });
    return { ok: true, id: page.id, joy: turi === "Saralanmagan" ? "Inbox" : turi, muddat: muddat ?? null };
  },

  // Ovoz: kalit bo'lsa matnga aylantiradi (foydalanuvchi tahrirlab saqlaydi),
  // bo'lmasa audio sifatida Inbox'ga saqlaydi (arxiv guruhi + Notion havolasi).
  async ovoz(b, bugun) {
    const buf = Buffer.from(String(b.audio || ""), "base64");
    if (!buf.length) throw new Error("Ovoz yozilmadi");
    if (buf.length > 3.5 * 1024 * 1024) throw new Error("Ovoz juda uzun (2 daqiqagacha yozing)");
    const mime = String(b.mime || "audio/webm").split(";")[0];
    const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const fayl = new Blob([buf], { type: mime });
    if (sttBor()) {
      const matn = await transkripsiya(fayl, `ovoz.${ext}`, Number(b.soniya) || undefined);
      return { matn };
    }
    const daq = Math.max(1, Math.round(Number(b.soniya) || 0));
    const nomi = `🎙 Ovozli yozuv (${Math.floor(daq / 60)}:${String(daq % 60).padStart(2, "0")})`;
    const msgId = await arxivgaYukla(fayl, `ovoz-${Date.now()}.${ext}`, "ovoz", `${nomi}\n<i>${bugun} · ilovadan</i>`).catch((e) => {
      console.error(e);
      return null;
    });
    await yozuvQosh({
      turi: "Saralanmagan",
      nomi,
      manba: "Ilova",
      tgFayl: msgId ? tgFaylYoz([{ bolim: "ovoz", id: msgId }]) : undefined,
      bloklar: msgId ? [havolaBlok("🎙 Telegram arxivida tinglash", arxivHavola(msgId, "ovoz"))] : [],
    });
    return { saqlandi: true };
  },

  async moliya(b, bugun) {
    const summa = Math.round(Number(String(b.summa).replace(/[^\d.]/g, "")));
    if (!summa || summa <= 0) throw new Error("Summani kiriting");
    const turi = b.turi === "Daromad" ? "Daromad" : "Xarajat";
    const kategoriya = (KATEGORIYALAR as readonly string[]).includes(b.kategoriya) ? b.kategoriya : undefined;
    await moliyaQosh({ turi, summa, nomi: String(b.nomi || "").trim() || kategoriya || turi, kategoriya, sana: bugun });
    return { ok: true };
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST kerak" });
  const user = foydalanuvchi(String(req.headers["x-init-data"] || ""));
  if (!user || user !== String(process.env.ALLOWED_CHAT_ID)) {
    return res.status(401).json({ error: "Ilovani Telegram'dagi bot orqali oching" });
  }
  const body = req.body ?? {};
  const amal = AMALLAR[String(body.action)];
  if (!amal) return res.status(400).json({ error: "Noma'lum amal" });
  try {
    return res.status(200).json(await amal(body, bugunToshkent()));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String((e as Error).message).slice(0, 200) });
  }
}
