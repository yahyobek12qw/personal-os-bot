// Fayllar guruhi (Telegram arxiv): katta fayllarni saqlash va qaytarib olish.
// Bot faylni Telegram ichida nusxalaydi, shuning uchun hajm chegarasi yo'q (yuklab olish kerak emas).

import { tg } from "./telegram";
import { q } from "./db";

export type Bolim = "rasm" | "video" | "hujjat" | "ovoz";

export const BOLIM_NOMI: Record<Bolim, string> = {
  rasm: "📷 Rasmlar",
  video: "🎬 Video",
  hujjat: "📎 Hujjatlar",
  ovoz: "🎙 Ovozlar",
};

export const arxivChat = () => process.env.FILES_CHAT_ID || "";

function mavzular(): Partial<Record<Bolim, number>> {
  try {
    return JSON.parse(process.env.FILES_TOPICS || "{}");
  } catch {
    return {};
  }
}

// Foydalanuvchi xabarini arxiv guruhiga nusxalaydi, guruhdagi xabar ID'sini qaytaradi
export async function arxivga(
  fromChat: number | string,
  messageId: number,
  bolim: Bolim,
  izoh: string,
  izohMumkin: boolean,
  loyihaMavzu?: number | null,
): Promise<number | null> {
  const chat = arxivChat();
  if (!chat) return null;
  const thread = loyihaMavzu || mavzular()[bolim];
  const nusxa = (t?: number) => tg("copyMessage", {
    chat_id: chat,
    from_chat_id: fromChat,
    message_id: messageId,
    ...(t ? { message_thread_id: t } : {}),
    ...(izohMumkin ? { caption: (loyihaMavzu ? `${BOLIM_NOMI[bolim]} · ` : "") + izoh.slice(0, 950), parse_mode: "HTML" } : {}),
  });
  const r = await nusxa(thread).catch((e) => {
    if (loyihaMavzu && /thread|topic/i.test(String(e?.message))) return nusxa(mavzular()[bolim]);
    throw e;
  });
  return r?.message_id ?? null;
}

// ---------- Loyihalar bo'yicha ajratish ----------
// Har loyihaning guruhda o'z mavzusi bor (birinchi marta kerak bo'lganda yaratiladi).
export async function loyihaMavzusi(brendId: number): Promise<number | null> {
  const r = (await q(`select nom, sozlama->>'tg_mavzu' m from brendlar where id = $1`, [brendId]))[0];
  if (!r) return null;
  if (r.m) return Number(r.m);
  const chat = arxivChat();
  if (!chat) return null;
  const d = await tg("createForumTopic", { chat_id: chat, name: `📁 ${r.nom}`.slice(0, 128), icon_color: 7322096 });
  const id = d?.message_thread_id;
  if (!id) return null;
  await q(`update brendlar set sozlama = coalesce(sozlama,'{}'::jsonb) || jsonb_build_object('tg_mavzu', $2::int) where id = $1`, [brendId, id]);
  await tg("sendMessage", { chat_id: chat, message_thread_id: id, text: `📁 «${r.nom}» loyihasining fayllari shu yerga tushadi: videolar, ovozlar, rasmlar, hujjatlar.` }).catch(() => {});
  return id;
}

export const loyihalarRoyxati = (): Promise<{ id: number; nom: string }[]> =>
  q(`select id, nom from brendlar order by id`).catch(() => []);

// Faol loyiha: egasi oxirgi tanlagan loyiha 45 daqiqa davomida keyingi fayllarga ham qo'llanadi
const FAOL_MUDDAT = 45 * 60 * 1000;
export async function faolLoyihaOl(): Promise<number | null> {
  const r = (await q(`select qiymat from sozlamalar where kalit = 'tg_faol_loyiha'`).catch(() => []))[0]?.qiymat;
  return r?.id && Date.now() - Number(r.t || 0) < FAOL_MUDDAT ? Number(r.id) : null;
}
export async function faolLoyihaYoz(id: number | null) {
  await q(`insert into sozlamalar (kalit, qiymat) values ('tg_faol_loyiha', $1) on conflict (kalit) do update set qiymat = excluded.qiymat`, [JSON.stringify({ id, t: Date.now() })]);
}

// Izohdagi loyiha nomi (masalan «multik ovozi») yoki faol loyiha
export async function loyihaAniqla(matn: string): Promise<{ id: number; avto: boolean } | null> {
  const l = await loyihalarRoyxati();
  const t = ` ${matn.toLowerCase()} `;
  const top = l.find((x) => x.nom && t.includes(x.nom.toLowerCase()));
  if (top) return { id: top.id, avto: false };
  const f = await faolLoyihaOl();
  return f ? { id: f, avto: true } : null;
}

// Arxivdagi xabarni loyiha mavzusiga ko'chiradi (nusxa + eskisini o'chirish)
export async function loyihagaKochir(msgId: number, brendId: number): Promise<{ id: number; mavzu: number } | null> {
  const chat = arxivChat();
  const mavzu = await loyihaMavzusi(brendId);
  if (!chat || !mavzu) return null;
  const r = await tg("copyMessage", { chat_id: chat, from_chat_id: chat, message_id: msgId, message_thread_id: mavzu });
  if (!r?.message_id) return null;
  await tg("deleteMessage", { chat_id: chat, message_id: msgId }).catch(() => {});
  return { id: r.message_id, mavzu };
}

export function arxivHavola(msgId: number, bolim: Bolim, mavzu?: number | null): string {
  const c = arxivChat().replace(/^-100/, "");
  const t = mavzu || mavzular()[bolim];
  return t ? `https://t.me/c/${c}/${t}/${msgId}` : `https://t.me/c/${c}/${msgId}`;
}

// "TG fayl" maydoni: "rasm:15,video:16" (eski) yoki "rasm:15:<file_id>:<hajm>:<thumb_id>" (yangi).
// file_id ilovada rasm/videoni ko'rsatish uchun kerak.
export type ArxivFayl = { bolim: Bolim; id: number; f?: string; s?: number; t?: string };

export function tgFaylOqi(s: string | undefined): ArxivFayl[] {
  return (s || "")
    .split(",")
    .map((x) => x.trim().split(":"))
    .filter(([b, id]) => b && Number(id))
    .map(([b, id, f, sz, t]) => ({ bolim: b as Bolim, id: Number(id), ...(f ? { f } : {}), ...(sz ? { s: Number(sz) } : {}), ...(t ? { t } : {}) }));
}

export const tgFaylYoz = (l: ArxivFayl[]) =>
  l.map((x) => [x.bolim, x.id, ...(x.f ? [x.f, x.s ?? 0, ...(x.t ? [x.t] : [])] : [])].join(":")).join(",");

export async function arxivdanYubor(toChat: number | string, fayllar: ArxivFayl[]) {
  const chat = arxivChat();
  for (const f of fayllar) {
    if (f.id && chat) {
      await tg("copyMessage", { chat_id: toChat, from_chat_id: chat, message_id: f.id });
      continue;
    }
    if (!f.f) continue;
    // Arxivda yo'q kichik fayl — file_id orqali qayta yuboramiz
    const usullar: Array<[string, string]> =
      f.bolim === "rasm" ? [["sendPhoto", "photo"], ["sendDocument", "document"]]
      : f.bolim === "video" ? [["sendVideo", "video"], ["sendDocument", "document"]]
      : f.bolim === "ovoz" ? [["sendVoice", "voice"], ["sendAudio", "audio"], ["sendDocument", "document"]]
      : [["sendDocument", "document"]];
    for (const [m, k] of usullar) {
      const ok = await tg(m, { chat_id: toChat, [k]: f.f }).then(() => true, () => false);
      if (ok) break;
    }
  }
}

// Serverdagi faylni (masalan, ilovada yozilgan ovozni) arxiv guruhiga yuklaydi
export async function arxivgaYukla(fayl: Blob, nomi: string, bolim: Bolim, izoh: string): Promise<number | null> {
  const chat = arxivChat();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!chat || !token) return null;
  const form = new FormData();
  form.append("chat_id", chat);
  const thread = mavzular()[bolim];
  if (thread) form.append("message_thread_id", String(thread));
  form.append("caption", izoh.slice(0, 1000));
  form.append("parse_mode", "HTML");
  form.append("document", fayl, nomi);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram sendDocument: ${data.description}`);
  return data.result?.message_id ?? null;
}

// Ilovadan yuklangan rasm/videoni arxivga yuboradi va file_id'ni qaytaradi
export async function arxivgaMedia(fayl: Blob, nomi: string, bolim: Bolim, izoh: string): Promise<ArxivFayl | null> {
  const chat = arxivChat();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!chat || !token) return null;
  const usul = bolim === "rasm" ? "photo" : bolim === "video" ? "video" : "document";
  const form = new FormData();
  form.append("chat_id", chat);
  const thread = mavzular()[bolim];
  if (thread) form.append("message_thread_id", String(thread));
  form.append("caption", izoh.slice(0, 1000));
  form.append("parse_mode", "HTML");
  if (usul === "video") form.append("supports_streaming", "true");
  form.append(usul, fayl, nomi);
  const method = usul === "photo" ? "sendPhoto" : usul === "video" ? "sendVideo" : "sendDocument";
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return xabardanFayl(data.result, bolim);
}

// Telegram xabaridan arxiv yozuvini oladi (file_id, hajm, kichik rasm)
export function xabardanFayl(m: any, bolim: Bolim): ArxivFayl | null {
  if (!m?.message_id) return null;
  const photo = m.photo?.length ? m.photo[m.photo.length - 1] : null;
  const x = photo ?? m.video ?? m.animation ?? m.video_note ?? m.document ?? m.voice ?? m.audio;
  if (!x) return { bolim, id: m.message_id };
  const thumb = (x.thumbnail ?? x.thumb)?.file_id;
  return { bolim, id: m.message_id, f: x.file_id, s: x.file_size ?? 0, ...(thumb ? { t: thumb } : {}) };
}
