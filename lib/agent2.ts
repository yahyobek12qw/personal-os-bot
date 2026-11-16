import { igHavola, tgHavola } from "./havolalar";
// Agent: o'z postingizni joylash, Telegram kanal, izohlarga javob, Telegram fayllarini agentga uzatish.

import { q } from "./db";
import { tg, yubor, esc, type Klaviatura } from "./telegram";
import { jadvalTayyorla, panelYangila, keyingiMatnOchiq } from "./agent";
import { zernioBor, mediaYukla, postYarat as zPost, engYaxshiVaqt, postHavolasi } from "./zernio";

const egasi = () => String(process.env.ALLOWED_CHAT_ID);

// ======================= Telegram kanal =======================
export async function kanal(): Promise<{ id: number; nom: string; username?: string } | null> {
  const s = (await q(`select qiymat from agent_sozlama where kalit = 'tg_kanal'`))[0];
  return s?.qiymat ?? null;
}

// Kanalda "/ulash_kanal" yozilganda (bot kanalda admin bo'lishi shart)
export async function kanalUlash(cp: any) {
  await jadvalTayyorla();
  const ch = cp.chat;
  // Faqat egasi admin bo'lgan kanal ulanadi — begona kanal botni o'ziga "ulab" ololmaydi
  const e = await tg("getChatMember", { chat_id: ch.id, user_id: Number(egasi()) }).catch(() => null);
  if (!["creator", "administrator"].includes(e?.status)) return;
  const botId = Number(String(process.env.TELEGRAM_BOT_TOKEN).split(":")[0]);
  const a = await tg("getChatMember", { chat_id: ch.id, user_id: botId }).catch(() => null);
  const mumkin = a?.status === "administrator" && a?.can_post_messages !== false;
  if (!mumkin) {
    await yubor(egasi(), `📢 <b>${esc(ch.title ?? "Kanal")}</b> topildi, lekin bot u yerda post joylay olmaydi. Botni kanalga <b>admin</b> qiling ("Post joylash" huquqi bilan) va <code>/ulash_kanal</code> ni qayta yozing.`);
    return;
  }
  const qiymat = { id: ch.id, nom: ch.title ?? "Kanal", username: ch.username ?? null };
  await q(`insert into agent_sozlama (kalit, qiymat) values ('tg_kanal', $1::jsonb) on conflict (kalit) do update set qiymat = excluded.qiymat`, [JSON.stringify(qiymat)]);
  await tg("deleteMessage", { chat_id: ch.id, message_id: cp.message_id }).catch(() => {});
  await yubor(egasi(), `✅ <b>Telegram kanal ulandi:</b> ${esc(qiymat.nom)}${qiymat.username ? ` (@${esc(qiymat.username)})` : ""}\nEndi tasdiqlangan postlar Instagram bilan birga shu kanalga ham joylanadi.`);
  await panelYangila();
}

export async function kanalBuyrugi(chatId: number | string) {
  await jadvalTayyorla();
  const k = await kanal();
  return yubor(chatId, k
    ? `📢 <b>Ulangan kanal:</b> ${esc(k.nom)}${k.username ? ` (@${esc(k.username)})` : ""}\nTasdiqlangan postlar shu kanalga ham joylanadi.`
    : ["📢 <b>Telegram kanal ulanmagan</b>", "", "1. Botni kanalga <b>admin</b> qiling (Post joylash huquqi bilan)", "2. Kanalga <code>/ulash_kanal</code> deb yozing — bot xabarni o'chirib, kanalni ulaydi"].join("\n"));
}

// Vazifa natijasini kanalga joylash (agent chaqiradi)
export async function kanalgaJoyla(id: number, matnUstidan?: string) {
  const k = await kanal();
  if (!k) throw new Error("Telegram kanal ulanmagan");
  const v = (await q(`select natija from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) throw new Error("vazifa topilmadi");
  const n = v.natija ?? {};
  // Telegram uchun alohida matn bo'lsa — o'sha (heshtegsiz, havola bilan), bo'lmasa Instagram caption
  const toliq = tgHavola(String(n.tg_matn ?? matnUstidan ?? n.caption ?? n.matn ?? "")).slice(0, 4000);
  const sigadi = toliq.length <= 1000;
  const caption = sigadi ? toliq : undefined;
  const manba = n.tg_file_id || n.media_url;
  const rasmlar: string[] = Array.isArray(n.media_urls) ? n.media_urls.slice(0, 10) : [];
  let m: any;
  if (rasmlar.length > 1) {
    const g = await tg("sendMediaGroup", { chat_id: k.id, media: rasmlar.map((u, i) => ({ type: "photo", media: u, ...(i === 0 && caption ? { caption } : {}) })) });
    m = g[0];
    await q(`update agent_vazifalar set natija = coalesce(natija,'{}'::jsonb) || jsonb_build_object('tg_xabarlar', $2::jsonb) where id = $1`, [id, JSON.stringify(g.map((x: any) => x.message_id))]);
  } else if (manba && n.media_tur === "video") m = await tg("sendVideo", { chat_id: k.id, video: manba, caption, supports_streaming: true });
  else if ((manba || rasmlar[0]) && n.media_tur === "rasm") m = await tg("sendPhoto", { chat_id: k.id, photo: manba || rasmlar[0], caption });
  else m = await tg("sendMessage", { chat_id: k.id, text: toliq });
  if (!sigadi && (rasmlar.length || manba) && toliq) await tg("sendMessage", { chat_id: k.id, text: toliq, reply_to_message_id: m.message_id }).catch(() => null);
  const havola = k.username ? `https://t.me/${k.username}/${m.message_id}` : null;
  await q(`update agent_vazifalar set natija = coalesce(natija,'{}'::jsonb) || jsonb_build_object('tg_havola', $2::text) where id = $1`, [id, havola ?? `kanal:${m.message_id}`]);
  return { ok: true, havola };
}

// ======================= O'z postingiz: /post =======================
// Rasm yoki videoni "/post caption" izohi bilan yuborasiz → ko'rib chiqish → ✅ → agent joylaydi
export async function postYarat(m: any, media: { fileId: string; tur: string; size?: number }, caption: string) {
  await jadvalTayyorla();
  if (!["rasm", "video"].includes(media.tur)) return yubor(m.chat.id, "Instagram uchun rasm yoki video kerak.", undefined, m.message_id);
  if ((media.size ?? 0) > 20 * 1024 * 1024) return yubor(m.chat.id, "Fayl 20 MB dan katta — bot uni yuklab ololmaydi. Siqib qayta yuboring.", undefined, m.message_id);
  const natija = { matn: caption, caption: igHavola(caption), tg_matn: tgHavola(caption), tg_file_id: media.fileId, media_tur: media.tur, hajm: media.size ?? null, manba: "egasi" };
  const r = (await q(
    `insert into agent_vazifalar (loyiha, tur, buyruq, holat, natija, taxmin_daq) values ('studiya', 'post', $1, 'tasdiq', $2::jsonb, 5) returning id`,
    [`Post: ${caption.split("\n")[0].slice(0, 60) || (media.tur === "video" ? "video" : "rasm")}`, JSON.stringify(natija)],
  ))[0];
  const k = await kanal();
  const kb: Klaviatura = [
    [{ text: "✅ Hozir joylash", callback_data: `ag:ha:${r.id}` }, { text: "🕐 Eng yaxshi vaqtda", callback_data: `ag:hv:${r.id}` }],
    [{ text: "✏️ Caption'ni o'zgartir", callback_data: `ag:oz:${r.id}` }, { text: "❌", callback_data: `ag:yoq:${r.id}` }],
  ];
  const msg = await yubor(m.chat.id, [
    `📤 <b>Post #${r.id} tayyor</b> — ${media.tur === "video" ? "video" : "rasm"}`,
    `Qayerga: Instagram @productcrm${k ? ` + Telegram ${esc(k.nom)}` : ""}`,
    "",
    caption ? `<i>${esc(caption.slice(0, 900))}</i>` : "<i>(caption yo'q)</i>",
    "",
    `Tasdiqlasangiz, agent keyingi tekshiruvda joylaydi (${keyingiMatnOchiq()}).`,
  ].join("\n"), kb, m.message_id);
  await q(`update agent_vazifalar set tg_msg = $2 where id = $1`, [r.id, msg.message_id]);
  await panelYangila();
}

// ======================= Izohlarga javob (agent taklif qiladi) =======================
export async function apiTaklif(b: any) {
  await jadvalTayyorla();
  const tur = String(b.tur || "izoh");
  const n = b.natija ?? {};
  if (tur === "izoh") {
    if (!n.comment_id || !n.javob) throw new Error("natija.comment_id va natija.javob kerak");
    const bor = (await q(`select id from agent_vazifalar where tur = 'izoh' and natija->>'comment_id' = $1`, [String(n.comment_id)]))[0];
    if (bor) return { id: bor.id, takror: true };
  }
  const natija = { ...n, matn: n.javob ?? n.matn ?? "" };
  const r = (await q(
    `insert into agent_vazifalar (loyiha, tur, buyruq, holat, natija, taxmin_daq) values ('productcrm', $1, $2, 'tasdiq', $3::jsonb, 2) returning id`,
    [tur, String(b.buyruq || "Izohga javob").slice(0, 200), JSON.stringify(natija)],
  ))[0];
  const kb: Klaviatura = [
    [{ text: "✅ Javobni yuborish", callback_data: `ag:ha:${r.id}` }, { text: "✏️ O'zgartir", callback_data: `ag:oz:${r.id}` }],
    [{ text: "❌ Javob bermaslik", callback_data: `ag:yoq:${r.id}` }],
  ];
  const msg = await yubor(egasi(), [
    `💬 <b>Yangi izoh</b>${n.muallif ? ` · @${esc(String(n.muallif))}` : ""}`,
    n.post ? `<i>Post: ${esc(String(n.post).slice(0, 80))}</i>` : "",
    "",
    `«${esc(String(n.izoh_matni ?? "").slice(0, 600))}»`,
    "",
    `🤖 <b>Javob taklifi:</b>\n${esc(String(n.javob).slice(0, 900))}`,
  ].filter((x) => x !== "").join("\n"), kb);
  await q(`update agent_vazifalar set tg_msg = $2 where id = $1`, [r.id, msg.message_id]);
  await panelYangila();
  return { id: r.id };
}

// ======================= Telegram faylini agentga uzatish =======================
// Vercel javob hajmi cheklangani uchun bo'laklab: ?fayl=ID&bo=0&gacha=3999999
export async function faylBolak(id: number, bo: number, gacha: number) {
  const v = (await q(`select natija from agent_vazifalar where id = $1`, [id]))[0];
  const fid = v?.natija?.tg_file_id;
  if (!fid) throw new Error("Bu vazifada Telegram fayli yo'q");
  const f = await tg("getFile", { file_id: fid });
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Faylni olib bo'lmadi: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const oxir = Math.min(buf.length - 1, gacha, bo + 3_999_999);
  return { jami: buf.length, bo, oxir, data: buf.subarray(bo, oxir + 1), nom: String(f.file_path).split("/").pop() };
}

// ======================= Server orqali joylash (Zernio API kaliti bo'lsa) =======================

// Instagram caption: natija.caption bo'lmasa, matndan "caption" bo'limini ajratamiz
export function captionAjrat(n: any): string {
  if (n?.caption) return String(n.caption).slice(0, 2200);
  const m = String(n?.matn ?? "");
  const i = m.search(/caption[^\n]*\n/i);
  if (i >= 0) {
    const qism = m.slice(i).replace(/^[^\n]*\n/, "");
    const tugash = qism.search(/\n\s*(📢|telegram|⚠️|✅ tekshiruv|bilib qo)/i);
    return (tugash > 0 ? qism.slice(0, tugash) : qism).trim().slice(0, 2200);
  }
  return m.trim().slice(0, 2200);
}

const toliqUrl = (n: any) => n?.toliq_url || (String(n?.izoh ?? "").match(/https?:\/\/\S+\.(mp4|mov|jpg|jpeg|png)\S*/i) ?? [])[0] || n?.media_url || null;
export const mediaBor = (n: any) => Boolean(n?.tg_file_id || n?.media_urls?.length || toliqUrl(n));

// vaqt: "hozir" | "eng_yaxshi" | "YYYY-MM-DDTHH:mm" (Toshkent)
export async function serverdaJoyla(id: number, vaqt: string) {
  const v = (await q(`select id, tur, buyruq, natija from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) throw new Error("Vazifa topilmadi");
  const n = v.natija ?? {};
  let url = toliqUrl(n);
  const tur: "video" | "image" = n.media_tur === "rasm" ? "image" : "video";
  if (n.tg_file_id && !n.zernio_media) {
    const f = await tg("getFile", { file_id: n.tg_file_id });
    const r = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
    if (!r.ok) throw new Error("Telegram faylini olib bo'lmadi");
    const buf = Buffer.from(await r.arrayBuffer());
    url = await mediaYukla(buf, String(f.file_path).split("/").pop() || "media", tur === "video" ? "video/mp4" : "image/jpeg");
  }
  const rasmlar: string[] = Array.isArray(n.media_urls) ? n.media_urls.slice(0, 10) : [];
  if (!url && rasmlar.length) url = rasmlar[0];
  if (!url) throw new Error("Joylash uchun media topilmadi");
  let sana: Date | null = null;
  if (vaqt === "eng_yaxshi") sana = await engYaxshiVaqt();
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(vaqt)) {
    sana = new Date(Date.parse(`${vaqt}:00+05:00`));
    if (sana.getTime() < Date.now() + 5 * 60_000) throw new Error("Vaqt kamida 5 daqiqa keyin bo'lsin");
  }
  const caption = igHavola(captionAjrat(n));
  const p = await zPost({ matn: caption, mediaUrl: url, mediaUrls: rasmlar.length > 1 ? rasmlar : undefined, mediaTur: rasmlar.length ? "image" : tur, vaqt: sana });
  const k = await kanal();
  const qoshimcha: Record<string, unknown> = { zernio_post_id: p.id, zernio_media: url, joylash_vaqt: sana ? sana.toISOString() : new Date().toISOString(), caption };
  if (k) qoshimcha.kanal_kutilmoqda = true;
  if (p.havola) qoshimcha.havola = p.havola;
  await q(`update agent_vazifalar set holat = $2, natija = coalesce(natija,'{}'::jsonb) || $3::jsonb, updated_at = now() where id = $1`,
    [id, sana ? "rejalandi" : "joylandi", JSON.stringify(qoshimcha)]);
  let kanalHavola: string | null = null;
  if (k && !sana) { kanalHavola = (await kanalgaJoyla(id).catch(() => ({ havola: null }))).havola; await q(`update agent_vazifalar set natija = natija - 'kanal_kutilmoqda' where id = $1`, [id]); }
  const vaqtMatn = sana ? new Date(sana.getTime() + 5 * 3600e3).toISOString().replace("T", " ").slice(0, 16) : null;
  await yubor(egasi(), [
    sana ? `🗓 <b>#${id} rejalandi</b> — ${vaqtMatn} (Toshkent)` : `🚀 <b>#${id} Instagram'ga joylanmoqda</b>`,
    `<i>${esc(String(v.buyruq).slice(0, 80))}</i>`,
    p.havola ? `🔗 ${p.havola}` : sana ? "Vaqti kelganda o‘zi chiqadi. Ilovada bekor qilish mumkin." : "Instagram videoni 1–2 daqiqada qayta ishlaydi, havola ilovada paydo bo‘ladi.",
    k ? (kanalHavola ? `📢 Kanal: ${kanalHavola}` : sana ? `📢 ${esc(k.nom)} kanaliga ham shu vaqtda (keyingi tekshiruvda) chiqadi` : "") : "",
  ].filter(Boolean).join("\n"));
  await panelYangila();
  return { ok: true, rejalandi: Boolean(sana), vaqt: sana?.toISOString() ?? null, havola: p.havola };
}

// Har soatlik GET: vaqti kelgan rejalangan postlarni yakunlash (havola + Telegram kanal)
export async function rejalanganlarniYakunla() {
  if (!zernioBor()) return;
  const rows = await q(`select id, natija from agent_vazifalar
    where holat in ('rejalandi','joylandi') and natija ? 'zernio_post_id'
      and (natija->>'joylash_vaqt')::timestamptz < now() - interval '2 minutes'
      and (natija->>'havola' is null or natija ? 'kanal_kutilmoqda') limit 5`);
  for (const r of rows) {
    const havola = r.natija.havola ?? await postHavolasi(r.natija.zernio_post_id);
    if (r.natija.kanal_kutilmoqda) {
      await kanalgaJoyla(r.id).catch(() => null);
      await q(`update agent_vazifalar set natija = natija - 'kanal_kutilmoqda' where id = $1`, [r.id]);
    }
    if (havola) await q(`update agent_vazifalar set holat = 'joylandi', natija = natija || jsonb_build_object('havola', $2::text), updated_at = now() where id = $1`, [r.id, havola]);
  }
}
