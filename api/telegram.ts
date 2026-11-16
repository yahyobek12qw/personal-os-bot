import type { VercelRequest, VercelResponse } from "@vercel/node";
import { yubor, esc, tg } from "../lib/telegram";
import { arxivChat } from "../lib/arxiv";
import { xabarKeldi, tugmaBosildi } from "../lib/bot2";
import { kanalUlash } from "../lib/agent2";
import { javob } from "../lib/telegram";

// Personal OS 2.0 bot: ma'lumotlar Neon bazasida (lib/bot2.ts). Eski Notion versiyasi: git tarixida.
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
        if (String(m.chat.id) === egasi) await xabarKeldi(m);
      } else if (String(m.from?.id) === egasi && /^\/ulash(@\w+)?(\s|$)/i.test(m.text ?? "")) {
        await guruhniUlash(m);
      }
    }
  } catch (e) {
    console.error(e);
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (chatId) await yubor(chatId, `⚠️ Xatolik: ${esc(String((e as Error).message).slice(0, 200))}\nXabarni qayta yuboring.`).catch(() => {});
  }
  return res.status(200).send("ok");
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
