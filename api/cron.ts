import type { VercelRequest, VercelResponse } from "@vercel/node";
import { yubor } from "../lib/telegram";
import { kechkiXabar, pulXabari } from "../lib/bot2";
import { hozirToshkent } from "../lib/v2";

// Vercel Cron har kuni 19:00 (Toshkent) da chaqiradi (vercel.json). CRON_SECRET Authorization sarlavhasida keladi.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send("unauthorized");
  }
  const chatId = process.env.ALLOWED_CHAT_ID;
  if (!chatId) return res.status(500).send("ALLOWED_CHAT_ID yo'q");
  const x = await kechkiXabar();
  await yubor(chatId, x.text, x.kb);
  // Oyning oxirgi kuni — oylik moliya xulosasi
  const { sana } = hozirToshkent();
  const [y, m] = sana.split("-").map(Number);
  if (sana === new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)) {
    const p = await pulXabari();
    await yubor(chatId, p.text, p.kb).catch((e) => console.error(e));
  }
  return res.status(200).send("ok");
}
