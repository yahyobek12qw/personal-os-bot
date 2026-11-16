import type { VercelRequest, VercelResponse } from "@vercel/node";
import { yubor, esc, tg } from "../lib/telegram";
import { arxivChat } from "../lib/arxiv";
import { xabarKeldi, tugmaBosildi } from "../lib/bot2";
import { kanalUlash } from "../lib/agent2";
import { guruhXabari, guruh } from "../lib/guruh";
import { javob } from "../lib/telegram";
import { birMartaYashir } from "../lib/maxfiy";

// Personal OS 2.0 bot: ma'lumotlar Neon bazasida (lib/bot2.ts). Eski Notion versiyasi: git tarixida.
// Bot faqat egasi uchun: boshqalarning shaxsiy xabarlari va tugmalariga javob yo'q, begona guruhlardan chiqib ketadi,
// xatolik xabari ham faqat egasiga boradi. Yagona istisno — product CRM muhokama guruhidagi FAQ (lib/guruh.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).send("ok");
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_SECRET) {
    return res.status(401).send("unauthorized");
  }
  const egasi = String(process.env.ALLOWED_CHAT_ID);
  const update = req.body ?? {};

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      if (String(cq.from?.id) === egasi) await tugmaBosildi(cq);
      else await javob(cq.id);
    } else if (update.channel_post) {
      if (/^\/ulash_kanal(@\w+)?\s*$/i.test(String(update.channel_post.text ?? ""))) await kanalUlash(update.channel_post);
    } else if (update.message) {
      const m = update.message;
      if (m.chat?.type === "private") {
        if (String(m.chat.id) === egasi) await Promise.all([xabarKeldi(m), birMartaYashir()]);
      } else if (await begonaGuruhgaQoshildi(m, egasi)) {
        // begona odam botni o'z guruhiga qo'shdi — bot chiqib ketdi
      } else if (String(m.from?.id) === egasi && /^\/ulash(@\w+)?(\s|$)/i.test(m.text ?? "")) {
        await guruhniUlash(m);
      } else {
        await guruhXabari(m).catch((e) => console.error("guruh", e));
      }
    }
  } catch (e) {
    console.error(e);
    // Xatolik haqida faqat egasiga yoziladi — boshqa chat yoki guruhga hech narsa ketmaydi
    await yubor(egasi, `⚠️ Xatolik: ${esc(String((e as Error).message).slice(0, 200))}\nXabarni qayta yuboring.`).catch(() => {});
  }
  return res.status(200).send("ok");
}

// Botni guruhga egasidan boshqa odam qo'shsa — jimgina chiqib ketadi (ulangan guruhlar bundan mustasno)
async function begonaGuruhgaQoshildi(m: any, egasi: string): Promise<boolean> {
  const botId = String(process.env.TELEGRAM_BOT_TOKEN).split(":")[0];
  const qoshildi = (m.new_chat_members ?? []).some((u: any) => String(u.id) === botId);
  if (!qoshildi || String(m.from?.id) === egasi) return false;
  const g = await guruh().catch(() => null);
  if (String(m.chat.id) === String(g?.id) || String(m.chat.id) === arxivChat()) return false;
  await tg("leaveChat", { chat_id: m.chat.id }).catch(() => {});
  const kim = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") + (m.from?.username ? ` @${m.from.username}` : "");
  await yubor(egasi, `🚪 <b>${esc(kim || "Kimdir")}</b> botni «${esc(m.chat.title ?? "guruh")}» guruhiga qo'shdi — bot chiqib ketdi.`).catch(() => {});
  return true;
}

// ======================= Fayllar guruhini ulash =======================

async function guruhniUlash(m: any) {
  const chatId = m.chat.id;
  const thread = m.message_thread_id;
  const botId = String(process.env.TELEGRAM_BOT_TOKEN).split(":")[0];
  const a = await tg("getChatMember", { chat_id: chatId, user_id: Number(botId) }).catch(() => null);
  const admin = a?.status === "administrator";
  const mavzu = Boolean(a?.can_manage_topics);
  console.log("ULASH", JSON.stringify({ chatId, isForum: m.chat.is_forum, admin, mavzu }));

  const ulangan = arxivChat() === String(chatId);
  const qatorlar = ulangan
    ? ["✅ <b>Bu guruh fayllar arxivi sifatida ulangan.</b>"]
    : [
        "📁 <b>Guruh topildi</b>",
        `ID: <code>${chatId}</code>`,
        `Mavzular (Topics): ${m.chat.is_forum ? "✅ yoqilgan" : "❌ yoqilmagan"}`,
        `Bot admin: ${admin ? "✅" : "❌"} · Mavzularni boshqarish: ${mavzu ? "✅" : "❌"}`,
        "",
        m.chat.is_forum && admin && mavzu
          ? "Hammasi tayyor. Ulashni Claude yakunlaydi."
          : "Yuqoridagi ❌ larni to'g'rilang va /ulash ni qayta yozing.",
      ];
  await tg("sendMessage", {
    chat_id: chatId,
    text: qatorlar.join("\n"),
    parse_mode: "HTML",
    ...(thread ? { message_thread_id: thread } : {}),
  });
}
