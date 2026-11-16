// Personal OS 2.0 API (Neon). Telegram initData bilan himoyalangan.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { foydalanuvchi } from "../lib/auth";
import * as v2 from "../lib/v2";
import { arxivgaMedia } from "../lib/arxiv";
import { sttBor, transkripsiya } from "../lib/stt";
import { yubor } from "../lib/telegram";
import { qisqa } from "../lib/ids";
import { q } from "../lib/db";
import { ilovaMalumoti, ilovadanQosh, qaror, kunlikYoq, faollik, navbatgaQosh, panelYangila, postKunlariniYoz } from "../lib/agent";
import { akkaunt, postOchir, zernioBor } from "../lib/zernio";
import { kanal } from "../lib/agent2";

type Amal = (b: any) => Promise<unknown>;
const ID = (b: any) => { const id = String(b.id || ""); if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Noto'g'ri ID"); return id; };

const AMALLAR: Record<string, Amal> = {
  bugun: () => v2.bugunKorinish(),
  kalendar: (b) => v2.kalendar(/^\d{4}-\d{2}$/.test(b.oy) ? b.oy : v2.hozirToshkent().sana.slice(0, 7)),
  sohalar: () => v2.sohalar(),
  soha: (b) => v2.soha(String(b.id)),
  element: (b) => v2.element(ID(b)),
  saqla: (b) => v2.saqla(b.id ? ID(b) : null, b.x ?? {}),
  holat: (b) => v2.saqla(ID(b), { holat: b.holat }),
  ochir: (b) => v2.ochir(ID(b)),
  odat: (b) => v2.odatBelgila(ID(b), b.sana || v2.hozirToshkent().sana, Boolean(b.done)),
  kundalik: (b) => v2.kundalikSaqla(b.sana || v2.hozirToshkent().sana, { kayfiyat: b.kayfiyat ?? null, matn: b.matn ?? null }),
  inbox: () => v2.inbox(),
  konteynerlar: () => v2.konteynerlar(),
  qidiruv: (b) => v2.qidiruv(String(b.q || "")),
  tahlil: (b) => v2.tahlilQil(String(b.matn || "")),
  tez: (b) => v2.tezQosh(String(b.matn || ""), b.x ?? {}),
  tolandi: (b) => v2.tolandi(ID(b)),
  jamgar: (b) => v2.jamgar(ID(b), Number(String(b.summa).replace(/[^\d.\-]/g, "")) || 0),
  sohaSaqla: (b) => v2.sohaSaqla(b.id ? String(b.id) : null, b.x ?? {}),
  faylOchir: (b) => v2.faylOchir(ID(b)),
  agent: () => ilovaMalumoti(),
  agentQosh: (b) => ilovadanQosh(String(b.matn || "")),
  agentKunlik: (b) => kunlikYoq(Boolean(b.yoqilgan)),
  agentPostKunlari: (b) => postKunlariniYoz(Array.isArray(b.kunlar) ? b.kunlar : []),
  agentAkkaunt: (b) => akkaunt(Boolean(b.yangila)),
  agentRejaBekor: (b) => postOchir(String(b.postId || "")),
  async agentHolat() { return { ...(await faollik()), zernio: zernioBor(), kanal: await kanal() }; },
  async agentResearch(b) {
    const PRESET: Record<string, string> = {
      trend: "Tahlil: Instagram Reels trendlari — tikuvxona, ishlab chiqarish va kichik biznes nishasida shu hafta nima ishlayapti: formatlar, hooklar, musiqa, davomiylik",
      raqobat: "Tahlil: raqobatchilar — O‘zbekiston va MDHda tikuvxona va ishlab chiqarish uchun hisob dasturlari: kontenti, takliflari, narxlari, kuchli va zaif tomonlari",
      videolar: "Tahlil: bizning videolarimiz natijasi (Zernio analytics) — ko‘rishlar, o‘rtacha tomosha, skip rate, saves/sends; qaysi biri nega yaxshi yoki yomon; keyingi 3 video uchun xulosa",
      ilova: "Tahlil: product CRM ilovasini yaxshilash — tikuvxona egalarining og‘riqlari, raqobatchilardagi funksiyalar, foydalanuvchi sharhlari; ustuvor 5 ta yaxshilash va ularni kontentda ko‘rsatish g‘oyalari",
      auditoriya: "Tahlil: auditoriya — tikuvxona egalari va buxgalterlar Instagram va Telegramda qayerda, nimani o‘qiydi, qanday savollar beradi; 10 ta kontent mavzusi",
      goya: "Kontent: 10 ta Reels g‘oyasi — kontent-strategiya ustunlari bo‘yicha, har biriga hook va nega ishlashi",
    };
    const matn = b.preset ? PRESET[String(b.preset)] : String(b.matn || "").trim();
    if (!matn) throw new Error("Research mavzusini yozing");
    const v = await navbatgaQosh(matn, /^Kontent:/.test(matn) ? "kontent" : "tahlil");
    await panelYangila();
    return v;
  },
  agentQaror: (b) => {
    const amal = String(b.amal);
    if (!["ha", "hv", "vq", "yoq", "oz"].includes(amal)) throw new Error("Noto'g'ri amal");
    return qaror(Number(b.id), amal as any, b.izoh ? String(b.izoh) : undefined, b.vaqt ? String(b.vaqt) : undefined);
  },
  async biriktir(b) {
    const id = ID(b);
    const buf = Buffer.from(String(b.fayl || ""), "base64");
    if (!buf.length) throw new Error("Fayl tanlanmadi");
    if (buf.length > 3.2 * 1024 * 1024) throw new Error("Fayl katta — «Katta fayl» orqali botga yuboring");
    const mime = String(b.mime || "application/octet-stream").split(";")[0];
    const tur = mime.startsWith("image/") ? "rasm" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "ovoz" : "fayl";
    const bolim = tur === "fayl" ? "hujjat" : tur;
    const nomi = String(b.nomi || "fayl").slice(0, 80);
    const el = (await q(`select nom from elementlar where id = $1`, [id]))[0];
    if (!el) throw new Error("Topilmadi");
    const a = await arxivgaMedia(new Blob([buf], { type: mime }), nomi, bolim as any, `${el.nom.replace(/[<>&]/g, "")}\n<i>ilovadan</i>`);
    if (!a) throw new Error("Fayllar guruhi ulanmagan");
    await v2.faylQosh(id, { tur, nom: nomi, hajm: a.s ?? buf.length, file_id: a.f, thumb_id: a.t ?? null, tg_msg: a.id, tg_bolim: bolim });
    return { ok: true };
  },
  async katta(b) {
    const id = ID(b);
    const el = (await q(`select nom from elementlar where id = $1`, [id]))[0];
    if (!el) throw new Error("Topilmadi");
    await yubor(String(process.env.ALLOWED_CHAT_ID), `📎 <b>${el.nom.replace(/[<>&]/g, "")}</b>\n\nShu xabarga <b>javob (Reply)</b> qilib rasm, video, ovoz yoki fayl yuboring — shu yozuvga qo'shiladi.`, [[{ text: "📎 Fayl kutilmoqda", callback_data: `ib:${qisqa(id)}` }]]);
    return { ok: true };
  },
  async ovoz(b) {
    const buf = Buffer.from(String(b.audio || ""), "base64");
    if (!buf.length) throw new Error("Ovoz yozilmadi");
    if (buf.length > 3.5 * 1024 * 1024) throw new Error("Ovoz juda uzun");
    if (!sttBor()) throw new Error("Ovozni matnga aylantirish sozlanmagan");
    const mime = String(b.mime || "audio/webm").split(";")[0];
    const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    return { matn: await transkripsiya(new Blob([buf], { type: mime }), `ovoz.${ext}`, Number(b.soniya) || undefined) };
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST kerak" });
  const user = foydalanuvchi(String(req.headers["x-init-data"] || ""));
  if (!user || user !== String(process.env.ALLOWED_CHAT_ID)) return res.status(401).json({ error: "Ilovani Telegram'dagi bot orqali oching" });
  const body = req.body ?? {};
  const amal = AMALLAR[String(body.action)];
  if (!amal) return res.status(400).json({ error: "Noma'lum amal" });
  try {
    return res.status(200).json(await amal(body));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String((e as Error).message).slice(0, 200) });
  }
}
