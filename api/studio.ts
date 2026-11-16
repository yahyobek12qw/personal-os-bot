// Studiya API (doska, kutubxona, telefon lentasi). Kirish: Telegram initData (Mini App ichida) yoki bot bergan studio kaliti (brauzer, planshet).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { foydalanuvchi, studioKalitTogri } from "../lib/auth";
import * as s from "../lib/studio";
import { qaror } from "../lib/agent";

type Amal = (b: any) => Promise<unknown>;
const N = (v: unknown, nom = "id") => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error(`Noto'g'ri ${nom}`); return n; };

const AMALLAR: Record<string, Amal> = {
  royxat: () => s.royxat(),
  loyiha: (b) => s.loyihaOl(N(b.id)),
  belgi: (b) => s.belgi(N(b.id)),
  yangi: (b) => s.yangiLoyiha(String(b.mavzu || ""), b.nom ? String(b.nom) : undefined, {
    reklama: b.reklama ? String(b.reklama) : undefined, format: b.format ? String(b.format) : undefined,
    qahramon: b.qahramon ? Number(b.qahramon) : null, variantlar: b.variantlar ? Number(b.variantlar) : undefined }),
  kutish: () => s.kutish(),
  variant: (b) => s.variantTanla(N(b.tugun), Number(b.i), Boolean(b.tasdiq)),
  variantlar: (b) => s.variantSora(N(b.tugun), Number(b.soni), String(b.izoh || "")),
  versiya: (b) => s.versiyaQaytar(N(b.tugun), Number(b.i)),
  kutubxona: (b) => s.kutubxona(b.tur ? String(b.tur) : undefined),
  kutubxonaSaqla: (b) => s.kutubxonaSaqla(b, "siz"),
  kutubxonaOchir: (b) => s.kutubxonaOchir(N(b.id)),
  yukla: (b) => s.yukla(b),
  kutubxonaIshi: (b) => s.kutubxonaIshi(N(b.id), String(b.matn || "")),
  // Eski agent vazifalari (bot oqimi): ha | yoq | oz (izoh bilan qayta)
  vazifa: (b) => {
    const a = String(b.amal || "");
    if (!["ha", "hv", "yoq", "oz"].includes(a)) throw new Error("amal: ha | hv | yoq | oz");
    return qaror(N(b.id), a as "ha" | "hv" | "yoq" | "oz", b.izoh ? String(b.izoh) : undefined);
  },
  tasdiq: (b) => s.tasdiqla(N(b.tugun)),
  qayta: (b) => s.qaytaQil(N(b.tugun), String(b.izoh || ""), false),
  rad: (b) => s.qaytaQil(N(b.tugun), String(b.izoh || ""), true),
  eskirgan: (b) => s.eskirganQaror(N(b.tugun), Boolean(b.qayta)),
  urin: (b) => s.qaytaUrin(N(b.tugun)),
  joy: (b) => s.joyla(N(b.tugun), b.x, b.y, b.w),
  qayd: (b) => s.qaydQosh(N(b.loyiha), Number(b.x) || 0, Number(b.y) || 0, String(b.matn || "")),
  qaydTahrir: (b) => s.qaydTahrir(N(b.tugun), String(b.matn || "")),
  qaydOchir: (b) => s.qaydOchir(N(b.tugun)),
  buyruq: (b) => s.buyruqBer(N(b.loyiha), String(b.matn || "")),
  reliz: (b) => s.relizQil(N(b.tugun), b.vaqt === "eng_yaxshi" ? "eng_yaxshi" : "hozir", b.caption != null ? String(b.caption) : undefined, b.tg_matn != null ? String(b.tg_matn) : undefined),
  arxiv: (b) => s.arxivla(N(b.loyiha), b.arxiv !== false),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST kerak" });
  const kalit = String(req.headers["x-studio-key"] || "");
  const user = kalit ? null : foydalanuvchi(String(req.headers["x-init-data"] || ""));
  const ruxsat = kalit ? studioKalitTogri(kalit) : Boolean(user && user === String(process.env.ALLOWED_CHAT_ID));
  if (!ruxsat) return res.status(401).json({ error: "Kirish muddati tugagan. Botga /studio yozing — yangi havola keladi." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const amal = AMALLAR[String(body.action)];
  if (!amal) return res.status(400).json({ error: "Noma'lum amal" });
  try {
    await s.studioTayyorla();
    return res.status(200).json(await amal(body));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String((e as Error).message).slice(0, 200) });
  }
}
