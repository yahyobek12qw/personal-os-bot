// Telegram Bot API yordamchilari.

export type Tugma = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

export const ILOVA_URL = "https://personal-os-bot-gold.vercel.app/app/";
// /app/ — Studiya (asosiy); /app/shaxsiy/ — Personal OS (kichik bo'lim)
export const SHAXSIY_URL = `${ILOVA_URL}shaxsiy/`;
export const ilovaTugma = (matn = "📱 Ilovani ochish", ekran?: string): Tugma => ({ text: matn, web_app: { url: ekran ? `${SHAXSIY_URL}#${ekran}` : SHAXSIY_URL } });
export type Klaviatura = Tugma[][];

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN o'rnatilmagan");
  return t;
}

export async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  // Matn o'zgarmagan bo'lsa Telegram xato qaytaradi — bu zararsiz
  if (!data.ok && !String(data.description).includes("message is not modified")) {
    throw new Error(`Telegram ${method}: ${data.description}`);
  }
  return data.result;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function yubor(chatId: number | string, text: string, klaviatura?: Klaviatura, replyTo?: number) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(klaviatura ? { reply_markup: { inline_keyboard: klaviatura } } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
}

export function tahrirla(chatId: number | string, messageId: number, text: string, klaviatura?: Klaviatura) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: klaviatura ?? [] },
  });
}

export function javob(callbackId: string, text?: string, ogohlantirish = false) {
  return tg("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}), ...(ogohlantirish ? { show_alert: true } : {}) }).catch(() => {});
}

export const yozmoqda = (chatId: number | string) =>
  tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

// Telegram'dan fayl yuklab olish (bot API orqali 20 MB gacha)
export async function faylOl(fileId: string): Promise<Blob> {
  const f = await tg("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${f.file_path}`);
  if (!res.ok) throw new Error(`Faylni yuklab bo'lmadi: ${res.status}`);
  return res.blob();
}
