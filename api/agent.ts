import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kanalgaJoyla, apiTaklif, faylBolak } from "../lib/agent2";
import { tg } from "../lib/telegram";
import { q } from "../lib/db";
import { rasmYasa, rasmTekshir } from "../lib/rasm";

// Bot "/" menyusiga agent buyruqlari (mavjudlari saqlanadi)
const AGENT_BUYRUQLAR = [
  { command: "agent", description: "🤖 Agent paneli: nima qilyapti, navbat" },
  { command: "kontent", description: "✍️ Agentga kontent/ssenariy vazifasi" },
  { command: "rasmpost", description: "🖼 Rasmli post (karusel) tayyorlash" },
  { command: "tahlil", description: "🔎 Research va tahlil" },
  { command: "kunlik", description: "📅 Kunlik rejim: hisobot + 1 video" },
  { command: "post", description: "📤 O‘z rasm/videoingizni joylash" },
  { command: "kanal", description: "📢 Telegram kanal holati" },
];
import { jadvalTayyorla, apiKontekst, apiNavbat, apiOl, apiJarayon, apiNatija, apiHolat, apiXabar, apiYangi } from "../lib/agent";

// Rejali Claude shu API orqali navbatni o'qiydi va natija yuboradi.
// Kirish: Authorization: Bearer <AGENT_SECRET>
function ruxsat(req: VercelRequest) {
  const s = process.env.AGENT_SECRET || "";
  const h = String(req.headers.authorization || "");
  const k = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!s || k.length !== s.length) return false;
  return crypto.timingSafeEqual(Buffer.from(k), Buffer.from(s));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ruxsat(req)) return res.status(401).json({ xato: "unauthorized" });
  try {
    await jadvalTayyorla();
    if (req.method === "GET" && req.query.fayl) {
      const f = await faylBolak(Number(req.query.fayl), Number(req.query.bo ?? 0), Number(req.query.gacha ?? 3_999_999));
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Jami", String(f.jami)); res.setHeader("X-Bo", String(f.bo)); res.setHeader("X-Oxir", String(f.oxir)); res.setHeader("X-Nom", f.nom ?? "fayl");
      return res.status(200).send(f.data);
    }
    if (req.method === "GET" && req.query.rasm) return res.status(200).json(await rasmTekshir());
    if (req.method === "GET" && req.query.buyruqlar) {
      // Bot menyusi: mavjud buyruqlarni o'qiydi; "yangila" bo'lsa agent buyruqlarini qo'shadi
      const bor: { command: string; description: string }[] = await tg("getMyCommands", {});
      if (req.query.buyruqlar !== "yangila") return res.status(200).json({ buyruqlar: bor });
      const nomlar = new Set(bor.map((b) => b.command));
      const yangi = [...bor.map((b) => AGENT_BUYRUQLAR.find((a) => a.command === b.command) ?? b), ...AGENT_BUYRUQLAR.filter((a) => !nomlar.has(a.command))];
      await tg("setMyCommands", { commands: yangi.slice(0, 100) });
      return res.status(200).json({ buyruqlar: yangi });
    }
    if (req.method === "GET" && req.query.webhook) {
      // Diagnostika: webhook kanal postlarini (channel_post) qabul qiladimi; kerak bo'lsa tuzatadi
      const w = await tg("getWebhookInfo", {});
      const au: string[] = w?.allowed_updates ?? [];
      let tuzatildi = false;
      if (req.query.webhook === "tuzat" && w?.url && au.length && !au.includes("channel_post")) {
        await tg("setWebhook", { url: w.url, allowed_updates: [...au, "channel_post"], ...(process.env.TELEGRAM_SECRET ? { secret_token: process.env.TELEGRAM_SECRET } : {}) });
        tuzatildi = true;
      }
      return res.status(200).json({ allowed_updates: au, pending: w?.pending_update_count, oxirgi_xato: w?.last_error_message ?? null, tuzatildi });
    }
    if (req.method === "GET") { const vazifalar = await apiNavbat(); return res.status(200).json({ vazifalar, ...(vazifalar.length || req.query.kontekst ? await apiKontekst() : {}) }); }
    if (req.method !== "POST") return res.status(405).json({ xato: "method" });
    const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    const id = Number(b.id);
    switch (b.amal) {
      case "ol":
        return res.status(200).json({ olindi: await apiOl(id, b.taxmin_daq ? Number(b.taxmin_daq) : undefined, Array.isArray(b.reja) ? b.reja : undefined, b.model ? String(b.model) : undefined) });
      case "jarayon":
        return res.status(200).json(await apiJarayon(id, String(b.bosqich ?? ""), b.taxmin_daq ? Number(b.taxmin_daq) : undefined));
      case "natija":
        if (!b.matn) return res.status(400).json({ xato: "matn kerak" });
        return res.status(200).json(await apiNatija(id, { matn: b.matn, media_url: b.media_url, media_tur: b.media_tur, izoh: b.izoh, caption: b.caption, toliq_url: b.toliq_url, tg_matn: b.tg_matn, media_urls: Array.isArray(b.media_urls) ? b.media_urls.map(String) : undefined }));
      case "natija_qosh": {
        // Natijaga jim qo'shimcha (xabar yubormaydi): masalan, tuzatilgan media_urls/tg_matn
        const ruxsat = ["tg_matn", "caption", "media_urls", "media_url", "media_tur", "toliq_url"];
        const qism = Object.fromEntries(Object.entries(b.natija ?? {}).filter(([k]) => ruxsat.includes(k)));
        await q(`update agent_vazifalar set natija = coalesce(natija,'{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify(qism)]);
        return res.status(200).json({ ok: true, qoshildi: Object.keys(qism) });
      }
      case "kanal_ochir": {
        // Ulangan kanaldagi bot postini o'chirish (xato joylangan post uchun)
        const k = (await q(`select qiymat from agent_sozlama where kalit = 'tg_kanal'`))[0]?.qiymat;
        if (!k) return res.status(400).json({ xato: "kanal ulanmagan" });
        const ids: number[] = (Array.isArray(b.message_ids) ? b.message_ids : [b.message_id]).map(Number).filter(Boolean);
        for (const m of ids) await tg("deleteMessage", { chat_id: k.id, message_id: m });
        return res.status(200).json({ ok: true, ochirildi: ids });
      }
      case "holat":
        return res.status(200).json(await apiHolat(id, String(b.holat), b.izoh, b.havola, Boolean(b.jim)));
      case "yangi":
        if (!b.buyruq) return res.status(400).json({ xato: "buyruq kerak" });
        return res.status(200).json(await apiYangi(b));
      case "rasm": {
        // Cloudflare FLUX: fon/illyustratsiya rasmi (JPEG base64). Matn rasmga yozilmaydi — HTML'da qo'yiladi
        const r = await rasmYasa(String(b.prompt ?? ""), b.qadam ? Number(b.qadam) : undefined);
        return res.status(200).json(r);
      }
      case "kanal":
        return res.status(200).json(await kanalgaJoyla(id, b.matn ? String(b.matn) : undefined));
      case "taklif":
        return res.status(200).json(await apiTaklif(b));
      case "xabar":
        return res.status(200).json(await apiXabar(String(b.matn ?? "")));
      default:
        return res.status(400).json({ xato: "amal: ol | jarayon | natija | holat | yangi | kanal | taklif | xabar" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ xato: String((e as Error).message).slice(0, 300) });
  }
}
