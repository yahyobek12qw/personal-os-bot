import { faqatEgasiga } from "../lib/maxfiy";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kanalgaJoyla, apiTaklif, faylBolak } from "../lib/agent2";
import { tg } from "../lib/telegram";
import { tgHavola } from "../lib/havolalar";
import { q } from "../lib/db";
import { rasmYasa, rasmTekshir } from "../lib/rasm";
import { savolEslatma, guruh, faqBirlashtir, testYoq } from "../lib/guruh";
import { agentIshlari, agentTugun, agentTugunYangi, agentBuyruqOqildi } from "../lib/studio";

// Bot "/" menyusiga agent buyruqlari (mavjudlari saqlanadi)
const AGENT_BUYRUQLAR = [
  { command: "agent", description: "🤖 Agent paneli: nima qilyapti, navbat" },
  { command: "kontent", description: "✍️ Agentga kontent/ssenariy vazifasi" },
  { command: "rasmpost", description: "🖼 Rasmli post (karusel) tayyorlash" },
  { command: "tahlil", description: "🔎 Research va tahlil" },
  { command: "kunlik", description: "📅 Kunlik rejim: hisobot + 1 video" },
  { command: "post", description: "📤 O‘z rasm/videoingizni joylash" },
  { command: "kanal", description: "📢 Telegram kanal holati" },
  { command: "guruh", description: "👥 Muhokama guruhi holati" },
  { command: "faq", description: "📚 Guruhdagi bot javoblari (FAQ)" },
  { command: "studio", description: "🎛 Kontent Studio — cheksiz doska" },
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
    if (req.method === "GET" && req.query.guruh) {
      const g = await guruh();
      const a = g ? await tg("getChatMember", { chat_id: g.id, user_id: Number(String(process.env.TELEGRAM_BOT_TOKEN).split(":")[0]) }).catch((e) => ({ xato: String(e) })) : null;
      return res.status(200).json({ guruh: g, bot: a ? { status: (a as any).status, xato: (a as any).xato ?? null, ochira_oladi: (a as any).can_delete_messages ?? null } : null });
    }
    if (req.method === "GET" && req.query.rasm) return res.status(200).json(await rasmTekshir());
    // Kontent Studio: ishi bor loyihalar (tugunlar, izohlar, buyruqlar)
    if (req.method === "GET" && req.query.studio) return res.status(200).json(await agentIshlari(req.query.loyiha ? Number(req.query.loyiha) : undefined));
    if (req.method === "GET" && req.query.buyruqlar) {
      // Bot menyusi: mavjud buyruqlarni o'qiydi; "yangila" bo'lsa agent buyruqlarini qo'shadi
      // Buyruqlar faqat egasining chatida ko'rinadi (scope: chat)
      const scope = { type: "chat", chat_id: Number(process.env.ALLOWED_CHAT_ID) };
      let bor: { command: string; description: string }[] = await tg("getMyCommands", { scope });
      if (!bor.length) bor = await tg("getMyCommands", {});
      if (req.query.buyruqlar !== "yangila") return res.status(200).json({ buyruqlar: bor });
      const nomlar = new Set(bor.map((b) => b.command));
      const yangi = [...bor.map((b) => AGENT_BUYRUQLAR.find((a) => a.command === b.command) ?? b), ...AGENT_BUYRUQLAR.filter((a) => !nomlar.has(a.command))];
      await tg("setMyCommands", { commands: yangi.slice(0, 100), scope });
      return res.status(200).json({ buyruqlar: yangi });
    }
    if (req.method === "GET" && req.query.maxfiy) return res.status(200).json(await faqatEgasiga());
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
    if (req.method === "GET") { await savolEslatma().catch((e) => console.error("eslatma", e)); const vazifalar = await apiNavbat(); return res.status(200).json({ vazifalar, ...(vazifalar.length || req.query.kontekst ? await apiKontekst() : {}) }); }
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
        return res.status(200).json(await apiNatija(id, { matn: b.matn, media_url: b.media_url, media_tur: b.media_tur, izoh: b.izoh, caption: b.caption, toliq_url: b.toliq_url, tg_matn: b.tg_matn, media_urls: Array.isArray(b.media_urls) ? b.media_urls.map(String) : undefined, qisqa: b.qisqa ? String(b.qisqa) : undefined, takliflar: Array.isArray(b.takliflar) ? b.takliflar.filter((t: any) => t?.matn && t?.buyruq).slice(0, 3).map((t: any) => ({ matn: String(t.matn), buyruq: String(t.buyruq) })) : undefined }));
      case "natija_qosh": {
        // Natijaga jim qo'shimcha (xabar yubormaydi): masalan, tuzatilgan media_urls/tg_matn
        const ruxsat = ["tg_matn", "caption", "media_urls", "media_url", "media_tur", "toliq_url"];
        const qism = Object.fromEntries(Object.entries(b.natija ?? {}).filter(([k]) => ruxsat.includes(k)));
        await q(`update agent_vazifalar set natija = coalesce(natija,'{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify(qism)]);
        return res.status(200).json({ ok: true, qoshildi: Object.keys(qism) });
      }
      case "faq":
        return res.status(200).json({ faq: await faqBirlashtir(b.faq ?? {}) });
      case "guruh_test":
        return res.status(200).json(await testYoq(Number(b.daqiqa ?? 60)));
      case "kanal_tahrir": {
        // Kanaldagi bot postining matnini/caption'ini almashtirish (havolalar bilan)
        const k = (await q(`select qiymat from agent_sozlama where kalit = 'tg_kanal'`))[0]?.qiymat;
        if (!k) return res.status(400).json({ xato: "kanal ulanmagan" });
        const matn = tgHavola(String(b.matn ?? ""));
        const usul = b.media ? "editMessageCaption" : "editMessageText";
        await tg(usul, { chat_id: k.id, message_id: Number(b.message_id), ...(b.media ? { caption: matn.slice(0, 1024) } : { text: matn.slice(0, 4096) }), link_preview_options: { is_disabled: true } });
        return res.status(200).json({ ok: true, uzunlik: matn.length });
      }
      case "kanal_ochir": {
        // Ulangan kanaldagi bot postini o'chirish (xato joylangan post uchun)
        const k = (await q(`select qiymat from agent_sozlama where kalit = 'tg_kanal'`))[0]?.qiymat;
        if (!k) return res.status(400).json({ xato: "kanal ulanmagan" });
        const ids: number[] = (Array.isArray(b.message_ids) ? b.message_ids : [b.message_id]).map(Number).filter(Boolean);
        for (const m of ids) await tg("deleteMessage", { chat_id: k.id, message_id: m });
        return res.status(200).json({ ok: true, ochirildi: ids });
      }
      case "tugun":
        return res.status(200).json(await agentTugun(b));
      case "tugun_yangi":
        return res.status(200).json(await agentTugunYangi(b));
      case "studio_buyruq":
        return res.status(200).json(await agentBuyruqOqildi(Number(b.loyiha_id)));
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
        return res.status(400).json({ xato: "amal: ol | jarayon | natija | holat | yangi | kanal | taklif | xabar | tugun | tugun_yangi | studio_buyruq" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ xato: String((e as Error).message).slice(0, 300) });
  }
}
