// Personal OS 2.0 — Telegram bot (Neon bazasi ustida).
// Matn → tez qo'shish; media → Telegram arxiv + fayllar jadvali; kartochkalar va buyruqlar.

import { q } from "./db";
import * as v2 from "./v2";
import { kunQosh } from "./parse";
import { tg, yubor, tahrirla, javob, yozmoqda, faylOl, esc, ILOVA_URL, SHAXSIY_URL, type Klaviatura, type Tugma } from "./telegram";
import { arxivga, arxivChat, arxivdanYubor, type Bolim, type ArxivFayl } from "./arxiv";
import { qisqa, toliq } from "./ids";
import { sttBor, transkripsiya } from "./stt";
import { guruhJavobi, guruhTugmasi, guruhBuyrugi, faqBuyrugi } from "./guruh";
import { kontentBuyrugi, agentJavobi, agentTugmasi, panelYangila, tahlilBuyrugi, kunlikBuyrugi, rasmpostBuyrugi } from "./agent";
import { postYarat, kanalBuyrugi } from "./agent2";
import { studioHavola, STUDIO_URL } from "./auth";

const MAKS_YUKLAB_OLISH = 20 * 1024 * 1024;

const TUR_NOM: Record<string, string> = {
  vazifa: "Vazifa", voqea: "Voqea", qayd: "Qayd", goya: "G'oya", havola: "Havola", xarajat: "Xarajat", daromad: "Daromad", odat: "Odat",
  loyiha: "Loyiha", kurs: "Kurs", dars: "Dars", kitob: "Kitob", qadam: "Qadam", qarz: "Qarz", maqsad: "Jamg'arma", tolov: "Doimiy to'lov",
};
const TUR_BELGI: Record<string, string> = {
  vazifa: "☑️", voqea: "📅", qayd: "📝", goya: "💡", havola: "🔗", xarajat: "💸", daromad: "💰", odat: "🔁",
  loyiha: "📁", kurs: "🎓", dars: "▶️", kitob: "📖", qadam: "▫️", qarz: "🤝", maqsad: "🎯", tolov: "🔄",
};
const TEZ_TURLAR = ["vazifa", "voqea", "qayd", "goya", "havola", "odat"];
const KAT = ["Maosh", "Loyiha daromadi", "Oziq-ovqat", "Transport", "Kommunal", "Internet va servislar", "O'qish", "Boshqa"];
const BAJARILADI = ["vazifa", "qadam", "dars", "voqea", "kurs", "kitob", "loyiha", "qarz"];
const OYLAR = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const HAFTA = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("ru-RU").replace(/ /g, " ");
const bugun = () => v2.hozirToshkent().sana;
const sanaUz = (s: string) => { const d = new Date(s + "T00:00:00Z"); return `${HAFTA[d.getUTCDay()]}, ${d.getUTCDate()}-${OYLAR[d.getUTCMonth()]}`; };
function sanaQ(s?: string | null) {
  if (!s) return "";
  const b = bugun();
  if (s === b) return "Bugun";
  if (s === kunQosh(b, 1)) return "Ertaga";
  if (s === kunQosh(b, -1)) return "Kecha";
  const d = new Date(s + "T00:00:00Z");
  return `${d.getUTCDate()}-${OYLAR[d.getUTCMonth()]}`;
}
const ilova = (matn = "📱 Ilovani ochish", hash?: string): Tugma => ({ text: matn, web_app: { url: hash ? `${SHAXSIY_URL}#${hash}` : ILOVA_URL } });

let _sohalar: Map<string, any> | null = null;
async function sohalar() {
  if (!_sohalar) _sohalar = new Map((await q(`select id, nom from sohalar where not arxiv order by tartib, created_at`)).map((s) => [s.id, s]));
  return _sohalar;
}

// ======================= Kartochka =======================

export async function kartochka(id: string, qoshimcha?: string): Promise<{ text: string; kb: Klaviatura }> {
  const e = (await q(
    `select e.id, e.tur, e.nom, e.matn, e.soha_id, e.holat, e.inbox, to_char(e.sana,'YYYY-MM-DD') sana, to_char(e.vaqt,'HH24:MI') vaqt,
            e.summa::float summa, e.kategoriya, e.havola, o.nom ota_nom,
            (select count(*)::int from fayllar f where f.element_id = e.id) fayllar
     from elementlar e left join elementlar o on o.id = e.ota_id where e.id = $1`, [id]))[0];
  if (!e) return { text: "🗑 <i>Bu yozuv o'chirilgan.</i>", kb: [] };
  const s = (await sohalar()).get(e.soha_id);
  const bajarildi = e.holat === "bajarildi";
  const qator1 = `${bajarildi ? "✅" : TUR_BELGI[e.tur] ?? "•"} <b>${bajarildi ? `<s>${esc(e.nom)}</s>` : esc(e.nom)}</b>`;
  const tafsil = [
    TUR_NOM[e.tur] ?? e.tur,
    e.summa != null && ["xarajat", "daromad", "qarz", "maqsad", "tolov"].includes(e.tur) ? `${e.tur === "daromad" ? "+" : e.tur === "xarajat" ? "−" : ""}${fmt(e.summa)} so'm` : "",
    e.kategoriya ?? "",
    e.sana && !["xarajat", "daromad"].includes(e.tur) ? `🗓 ${sanaQ(e.sana)}${e.vaqt ? " " + e.vaqt : ""}` : "",
    s ? `◆ ${esc(s.nom)}` : "",
    e.ota_nom ? `📁 ${esc(e.ota_nom)}` : "",
  ].filter(Boolean).join(" · ");
  const qatorlar = [qator1, tafsil];
  if (e.havola) qatorlar.push(`🔗 ${esc(e.havola)}`);
  if (e.fayllar) qatorlar.push(`📎 ${e.fayllar} ta fayl`);
  if (e.inbox) qatorlar.push("<i>📥 Inbox'da — sohasini yoki sanasini tanlang</i>");
  if (qoshimcha) qatorlar.push("", qoshimcha);

  const k = qisqa(e.id);
  const kb: Klaviatura = [];
  if (BAJARILADI.includes(e.tur)) {
    kb.push([
      bajarildi ? { text: "↩️ Qayta ochish", callback_data: `u:${k}` } : { text: "✅ Bajarildi", callback_data: `d:${k}` },
      ...(!bajarildi && ["vazifa", "qadam", "voqea"].includes(e.tur)
        ? [{ text: "Bugun", callback_data: `m:${k}:0` }, { text: "Ertaga", callback_data: `m:${k}:1` }]
        : []),
    ]);
  } else if (["qayd", "goya", "havola"].includes(e.tur) && !e.sana) {
    kb.push([{ text: "☑️ Vazifa qilish", callback_data: `t:${k}:vazifa` }, { text: "Bugun", callback_data: `m:${k}:0` }, { text: "Ertaga", callback_data: `m:${k}:1` }]);
  }
  const r2: Tugma[] = [{ text: s ? "◆ Soha" : "◆ Sohani tanlash", callback_data: `sl:${k}` }];
  if (e.tur === "xarajat" || e.tur === "tolov") r2.push({ text: "🏷 Kategoriya", callback_data: `kl:${k}` });
  else r2.push({ text: "🔀 Turi", callback_data: `tl:${k}` });
  if (e.fayllar) r2.push({ text: "📤 Fayllar", callback_data: `f:${k}` });
  kb.push(r2);
  kb.push([ilova("📱 Ochish", `e=${e.id}`), { text: "🗑", callback_data: `x:${k}` }]);
  return { text: qatorlar.join("\n"), kb };
}

// ======================= Doimiy klaviatura =======================

export const MENYU = {
  keyboard: [
    [{ text: "☀️ Bugun" }, { text: "🗓 Hafta" }, { text: "📥 Inbox" }],
    [{ text: "💰 Pul" }, { text: "🔁 Odatlar" }, { text: "🔍 Qidirish" }],
    [{ text: "🤖 Agent" }, { text: "🎛 Studiya", web_app: { url: ILOVA_URL } }, { text: "❓ Yordam" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Yozing: ertaga 9:00 ... / -25k tushlik",
};
// Tugma matni → buyruq
const TUGMA_BUYRUQ: Record<string, string> = {
  "☀️ Bugun": "bugun", "🗓 Hafta": "hafta", "📥 Inbox": "inbox", "💰 Pul": "pul", "🔁 Odatlar": "odatlar", "🔍 Qidirish": "qidir", "❓ Yordam": "yordam", "📱 Ilova": "ilova", "🤖 Agent": "agent",
};

// ======================= Buyruqlar =======================

export const YORDAM = [
  "🧭 <b>Personal OS — qanday ishlatish</b>",
  "",
  "Shunchaki yozing — men o'zim ajrataman:",
  "• <code>ertaga 9:00 TATU mustaqil ish topshirish</code> → vazifa, sana, soha",
  "• <code>-25k tushlik</code> → xarajat · <code>+3mln maosh</code> → daromad",
  "• <code>g: yangi kurs g'oyasi</code> → g'oya · <code>q: ...</code> → qayd",
  "• <code>odat: Sport</code> → kundalik odat",
  "• havola yuborsangiz → havola sifatida saqlanadi",
  "",
  "📷 Rasm, video, ovoz yoki fayl → yozuv bo'ladi, fayl Telegram arxiv guruhida saqlanadi.",
  "🎙 Izohsiz ovozli xabar → matnga aylantiriladi.",
  "↩️ Kartochkaga <b>javob (Reply)</b> qilib fayl yuborsangiz — o'sha yozuvga qo'shiladi; matn yuborsangiz — qaydiga yoziladi.",
  "",
  "Pastdagi tugmalar: ☀️ Bugun · 🗓 Hafta · 📥 Inbox · 💰 Pul · 🔁 Odatlar · 🔍 Qidirish",
  "Qidiruvni tez qilish: <code>/qidir TATU</code>",
  "",
  "🤖 <b>Kontent agenti</b>: <code>/kontent Reels: mavzu</code> (EduFlow uchun <code>/kontent eduflow: ...</code>) · panel: /agent",
  "🔎 <code>/tahlil savol</code> — research va tahlil · 📅 /kunlik — har kuni hisobot + 1 video",
  "🖼 <code>/rasmpost mavzu</code> — agent karusel/rasm post tayyorlaydi (Instagram + Telegram)",
  "📤 /post — o'z rasm/videongizni joylash · 📢 /kanal — Telegram kanalni ulash",
  "🎛 /studio — Studiya: telefonda agent va tasdiq, planshet/kompyuterda to‘liq studiya",
].join("\n");

const qatorEl = (x: any) => `${x.holat === "bajarildi" ? "✅" : x.tur === "vazifa" || x.tur === "qadam" ? "▫️" : TUR_BELGI[x.tur] ?? "•"} ${x.vaqt ? `<b>${x.vaqt}</b> ` : ""}${x.holat === "bajarildi" ? `<s>${esc(x.nom)}</s>` : esc(x.nom)}`;

export async function bugunXabari(sarlavha?: string): Promise<{ text: string; kb: Klaviatura }> {
  const d = await v2.bugunKorinish();
  const t: string[] = [sarlavha ?? `☀️ <b>${sanaUz(d.sana)}</b>`];
  if (sarlavha) t.push(`<i>${sanaUz(d.sana)}</i>`);
  t.push("");
  if (d.reja.length) {
    t.push(`<b>Kun rejasi</b> · ${d.progress.bajarildi}/${d.progress.jami}`);
    t.push(...d.reja.map(qatorEl));
  } else t.push("Bugunga reja yo'q.");
  if (d.kechikkan.length) t.push("", `<b>⏰ Kechikkan</b> (${d.kechikkan.length})`, ...d.kechikkan.slice(0, 8).map((x: any) => `▫️ ${esc(x.nom)} <i>· ${sanaQ(x.sana)}</i>`));
  if (d.odatlar.length) t.push("", `<b>🔁 Odatlar</b> · ${d.odatlar.filter((o) => o.done).length}/${d.odatlar.length}`, d.odatlar.map((o) => `${o.done ? "✅" : "⬜️"} ${esc(o.nom)}${o.streak ? ` 🔥${o.streak}` : ""}`).join("\n"));
  if (d.pul.length) t.push("", "<b>💳 Pul eslatmalari</b>", ...d.pul.map((x: any) => `${x.kechikkan ? "❗️" : "•"} ${esc(x.nom)}${x.summa ? ` — ${fmt(x.summa)} so'm` : ""} <i>· ${x.kechikkan ? "kechikdi" : sanaQ(x.sana)}</i>`));
  if (d.inbox) t.push("", `📥 Inbox'da ${d.inbox} ta saralanmagan yozuv.`);

  const kb: Klaviatura = [];
  const ochiq = [...d.reja, ...d.kechikkan].filter((x: any) => x.holat !== "bajarildi" && ["vazifa", "qadam", "dars"].includes(x.tur)).slice(0, 6);
  for (let i = 0; i < ochiq.length; i += 2) kb.push(ochiq.slice(i, i + 2).map((x: any) => ({ text: `✅ ${x.nom.slice(0, 22)}`, callback_data: `bd:${qisqa(x.id)}` })));
  const od = d.odatlar.filter((o) => !o.done).slice(0, 4);
  if (od.length) kb.push(od.map((o) => ({ text: `🔁 ${o.nom.slice(0, 14)}`, callback_data: `ob:${qisqa(o.id)}` })));
  kb.push([{ text: "🔄 Yangilash", callback_data: "bugun" }, ilova("📱 Shaxsiy", "bugun")]);
  return { text: t.join("\n"), kb };
}

export async function inboxXabari(): Promise<{ text: string; kb: Klaviatura }> {
  const { items } = await v2.inbox();
  if (!items.length) return { text: "📥 <b>Inbox bo'sh</b>\nHammasi saralangan.", kb: [[ilova("📱 Shaxsiy", "inbox")]] };
  const t = [`📥 <b>Inbox</b> · ${items.length} ta`, "", ...items.slice(0, 15).map((x: any) => `${TUR_BELGI[x.tur] ?? "•"} ${esc(x.nom)}`)];
  if (items.length > 15) t.push(`<i>…yana ${items.length - 15} ta</i>`);
  t.push("", "<i>Bittasini saralash uchun bosing:</i>");
  const kb: Klaviatura = items.slice(0, 6).map((x: any) => [{ text: `${TUR_BELGI[x.tur] ?? "•"} ${x.nom.slice(0, 34)}`, callback_data: `cn:${qisqa(x.id)}` }]);
  kb.push([ilova("📱 Ilovada saralash", "inbox")]);
  return { text: t.join("\n"), kb };
}

export async function haftaXabari(): Promise<{ text: string; kb: Klaviatura }> {
  const b = bugun();
  const items = await q(
    `select id, tur, nom, holat, to_char(sana,'YYYY-MM-DD') sana, to_char(vaqt,'HH24:MI') vaqt from elementlar
     where sana between $1 and $1::date + 6 and holat <> 'bekor' and tur not in ('xarajat','daromad','odat','tolov') order by sana, vaqt nulls last`, [b]);
  const t = ["🗓 <b>Keyingi 7 kun</b>"];
  for (let i = 0; i < 7; i++) {
    const s = kunQosh(b, i);
    const kun = items.filter((x) => x.sana === s);
    if (!kun.length) continue;
    t.push("", `<b>${i === 0 ? "Bugun" : i === 1 ? "Ertaga" : sanaUz(s)}</b>`, ...kun.map(qatorEl));
  }
  if (t.length === 1) t.push("", "Hafta bo'sh — hech narsa rejalashtirilmagan.");
  return { text: t.join("\n"), kb: [[ilova("📱 Kalendar", "kalendar")]] };
}

export async function pulXabari(): Promise<{ text: string; kb: Klaviatura }> {
  const m = await v2.moliya(bugun());
  const bal = m.daromad - m.xarajat;
  const oy = OYLAR[Number(m.oy.slice(5)) - 1];
  const t = [`💰 <b>${oy[0].toUpperCase() + oy.slice(1)} moliyasi</b>`, "", `Daromad: <b>+${fmt(m.daromad)}</b>`, `Xarajat: <b>−${fmt(m.xarajat)}</b>`, `Balans: <b>${bal >= 0 ? "+" : ""}${fmt(bal)}</b> so'm`];
  const by = (m.byudjet ?? {}) as Record<string, number>;
  if (m.kategoriyalar.length) t.push("", "<b>Xarajatlar</b>", ...m.kategoriyalar.map((k: any) => `• ${esc(k.nom)}: ${fmt(k.summa)}${by[k.nom] ? ` / ${fmt(by[k.nom])}${k.summa > by[k.nom] ? " ❗️" : ""}` : ""}`));
  const qarz = m.qarzlar.filter((x: any) => x.holat === "ochiq");
  if (qarz.length) t.push("", "<b>Qarzlar</b>", ...qarz.map((x: any) => `• ${esc(x.nom)}${x.summa ? ` — ${fmt(x.summa)}` : ""}${x.sana ? ` <i>· ${sanaQ(x.sana)}</i>` : ""}`));
  const maq = m.maqsadlar.filter((x: any) => x.holat === "ochiq");
  if (maq.length) t.push("", "<b>Jamg'arma</b>", ...maq.map((x: any) => `• ${esc(x.nom)}: ${fmt(x.meta?.yigilgan ?? 0)} / ${fmt(x.summa ?? 0)}`));
  return { text: t.join("\n"), kb: [[ilova("📱 Moliya", "pul")]] };
}

export async function odatlarXabari(): Promise<{ text: string; kb: Klaviatura }> {
  const d = await v2.bugunKorinish();
  const hamma = await q(`select id, nom from elementlar where tur = 'odat' and holat <> 'bekor' order by tartib nulls last, created_at`);
  if (!hamma.length) return { text: "🔁 <b>Odatlar</b>\n\nHali odat yo'q. Qo'shish uchun yozing:\n<code>odat: Sport</code>\n<code>odat: 20 bet kitob</code>", kb: [] };
  const t = [`🔁 <b>Bugungi odatlar</b> · ${d.odatlar.filter((o) => o.done).length}/${d.odatlar.length}`, ""];
  t.push(...d.odatlar.map((o) => `${o.done ? "✅" : "⬜️"} ${esc(o.nom)}${o.streak ? ` 🔥${o.streak} kun` : ""}\n<code>${o.hafta.map((x: boolean) => (x ? "■" : "□")).join("")}</code>`));
  if (!d.odatlar.length) t.push("Bugun rejadagi odat yo'q.");
  const kb: Klaviatura = d.odatlar.map((o) => [{ text: `${o.done ? "↩️" : "✅"} ${o.nom.slice(0, 28)}`, callback_data: `${o.done ? "ou" : "oo"}:${qisqa(o.id)}` }]);
  return { text: t.join("\n"), kb };
}

export async function qidiruvXabari(soz: string): Promise<{ text: string; kb: Klaviatura }> {
  const { items } = await v2.qidiruv(soz);
  if (!items.length) return { text: `🔍 «${esc(soz)}» bo'yicha hech narsa topilmadi.`, kb: [] };
  const t = [`🔍 <b>${esc(soz)}</b> · ${items.length} ta`, ""];
  const kb: Klaviatura = items.slice(0, 8).map((x: any) => [{ text: `${TUR_BELGI[x.tur] ?? "•"} ${x.nom.slice(0, 36)}${x.sana ? " · " + sanaQ(x.sana) : ""}`, callback_data: `cn:${qisqa(x.id)}` }]);
  t.push("<i>Ochish uchun bosing:</i>");
  return { text: t.join("\n"), kb };
}

// ======================= Xabarlar =======================

type Media = { fileId: string; size?: number; thumb?: string; nomi: string; tur: "rasm" | "video" | "ovoz" | "fayl"; bolim: Bolim; sarlavha: string; izohMumkin: boolean };

function mediaTop(m: any): Media | null {
  const id = m.message_id;
  if (m.photo?.length) {
    const p = m.photo[m.photo.length - 1];
    return { fileId: p.file_id, size: p.file_size, nomi: `rasm-${id}.jpg`, tur: "rasm", bolim: "rasm", sarlavha: "📷 Rasm", izohMumkin: true };
  }
  const video = m.video ?? m.animation ?? m.video_note;
  if (video) return { fileId: video.file_id, size: video.file_size, thumb: (video.thumbnail ?? video.thumb)?.file_id, nomi: video.file_name ?? `video-${id}.mp4`, tur: "video", bolim: "video", sarlavha: "🎬 Video", izohMumkin: !m.video_note };
  if (m.voice) return { fileId: m.voice.file_id, size: m.voice.file_size, nomi: `ovoz-${id}.ogg`, tur: "ovoz", bolim: "ovoz", sarlavha: "🎙 Ovozli xabar", izohMumkin: true };
  if (m.audio) return { fileId: m.audio.file_id, size: m.audio.file_size, nomi: m.audio.file_name ?? `audio-${id}.mp3`, tur: "ovoz", bolim: "ovoz", sarlavha: `🎵 ${m.audio.title ?? "Audio"}`, izohMumkin: true };
  if (m.document) {
    const d = m.document;
    const mime: string = d.mime_type ?? "";
    const tur = mime.startsWith("image/") ? "rasm" : mime.startsWith("video/") ? "video" : "fayl";
    return { fileId: d.file_id, size: d.file_size, thumb: (d.thumbnail ?? d.thumb)?.file_id, nomi: d.file_name ?? `fayl-${id}`, tur, bolim: tur === "fayl" ? "hujjat" : tur, sarlavha: `📎 ${d.file_name ?? "Fayl"}`, izohMumkin: true };
  }
  return null;
}

// Bot kartochkasidagi tugmalardan element ID'sini topadi
function kartaElementi(r: any): string | null {
  if (!r?.from?.is_bot || !r.reply_markup?.inline_keyboard) return null;
  for (const qator of r.reply_markup.inline_keyboard) {
    for (const t of qator) {
      const w = String(t.web_app?.url ?? "").match(/#e=([0-9a-f-]{36})/);
      if (w) return w[1];
      const x = String(t.callback_data ?? "").match(/^[a-z]+:([A-Za-z0-9_-]{22})(?::|$)/);
      if (x) return toliq(x[1]);
    }
  }
  return null;
}

// Faylni arxiv guruhiga nusxalaydi va elementga biriktiradi
async function faylSaqla(m: any, media: Media, elementId: string, nom: string) {
  let tgMsg: number | null = null;
  if (arxivChat()) {
    tgMsg = await arxivga(m.chat.id, m.message_id, media.bolim, `${esc(nom)}\n<i>${bugun()}</i>`, media.izohMumkin).catch((e) => {
      console.error(e);
      return null;
    });
  }
  await v2.faylQosh(elementId, { tur: media.tur, nom: media.nomi, hajm: media.size ?? null, file_id: media.fileId, thumb_id: media.thumb ?? null, tg_msg: tgMsg, tg_bolim: media.bolim });
  return tgMsg;
}

async function elementBormi(id: string) {
  return (await q(`select id, nom, matn from elementlar where id = $1`, [id]))[0] ?? null;
}

export async function xabarKeldi(m: any) {
  const chatId = m.chat.id;
  const media = mediaTop(m);
  let matn: string = String(m.text ?? m.caption ?? "").trim();

  // ----- /post: rasm yoki video "/post caption" izohi bilan -----
  if (media && /^\/post(@\w+)?(\s|$)/i.test(matn)) return postYarat(m, { fileId: media.fileId, tur: media.tur, size: media.size }, matn.replace(/^\/post(@\w+)?\s*/i, "").trim());

  // ----- Kontent agenti: force-reply javoblari -----
  if (!media && (await guruhJavobi(m))) return;
  if (!media && (await agentJavobi(m))) return;

  // ----- Kartochkaga javob: fayl biriktirish yoki qaydga yozish -----
  const nishon = kartaElementi(m.reply_to_message);
  if (nishon && (media || (matn && !matn.startsWith("/")))) {
    const el = await elementBormi(nishon);
    if (!el) return yubor(chatId, "Bu yozuv topilmadi — u eski tizimdan yoki o'chirilgan.", undefined, m.message_id);
    await yozmoqda(chatId);
    if (media) {
      await faylSaqla(m, media, el.id, el.nom);
      const k = await kartochka(el.id, `📎 <i>${esc(media.sarlavha)} qo'shildi.</i>`);
      return yubor(chatId, k.text, k.kb, m.message_id);
    }
    const yangi = el.matn ? `${el.matn}\n\n${matn}` : matn;
    await v2.saqla(el.id, { matn: yangi });
    const k = await kartochka(el.id, "📝 <i>Qaydiga yozildi.</i>");
    return yubor(chatId, k.text, k.kb, m.message_id);
  }

  // ----- Qidiruv so'ziga javob -----
  if (!media && matn && m.reply_to_message?.from?.is_bot && String(m.reply_to_message.text ?? "").startsWith("🔍 Nimani qidiramiz")) {
    await yozmoqda(chatId);
    const x = await qidiruvXabari(matn);
    return yubor(chatId, x.text, x.kb);
  }

  // ----- Buyruqlar va pastki tugmalar -----
  const tugma = TUGMA_BUYRUQ[matn];
  if (!media && (tugma || matn.startsWith("/"))) {
    const [bosh, ...qolgan] = matn.slice(1).split(/\s+/);
    const cmd = tugma ?? bosh.split("@")[0].toLowerCase();
    const arg = tugma ? "" : qolgan.join(" ").trim();
    if (cmd === "start" || cmd === "yordam" || cmd === "help") return tg("sendMessage", { chat_id: chatId, text: YORDAM, parse_mode: "HTML", reply_markup: MENYU });
    if (cmd === "kontent" || cmd === "k") return kontentBuyrugi(chatId, arg, m.message_id);
    if (cmd === "tahlil" || cmd === "research") return tahlilBuyrugi(chatId, arg, m.message_id);
    if (cmd === "rasmpost" || cmd === "karusel") return rasmpostBuyrugi(chatId, arg, m.message_id);
    if (cmd === "kunlik") return kunlikBuyrugi(chatId);
    if (cmd === "kanal") return kanalBuyrugi(chatId);
    if (cmd === "guruh") return guruhBuyrugi(chatId, arg);
    if (cmd === "faq") return faqBuyrugi(chatId, arg);
    if (cmd === "post") return yubor(chatId, "📤 <b>Post joylash</b>\nRasm yoki videoni yuboring va izohiga (caption) <code>/post</code> dan keyin matnni yozing:\n<code>/post Tikuvxonangiz uchun yangi imkoniyat…</code>\nMen ko'rsataman, siz ✅ bosasiz — agent Instagram'ga (va ulangan bo'lsa kanalga) joylaydi.");
    if (cmd === "agent") return panelYangila(true);
    if (cmd === "studio") return yubor(chatId, "🎛 <b>Studiya</b>\nTelefonda — agent: kelgan kontentni ko‘rib, tasdiqlaysiz. Planshet yoki kompyuterda — to‘liq studiya: loyihalar doskasi, variantlar, qahramonlar, ovozlar (havola 30 kun amal qiladi).", [[{ text: "📱 Agent (Telegram ichida)", web_app: { url: STUDIO_URL } }], [{ text: "🖥 To‘liq studiya (brauzer)", url: studioHavola() }]]);
    if (cmd === "ilova") return yubor(chatId, "📱 <b>Ilova</b>\n🎛 Studiya — asosiy ish (kontent, agent).\n🏠 Shaxsiy — Bugun, Kalendar, Sohalar, Inbox.", [[ilova("🎛 Studiya"), ilova("🏠 Shaxsiy", "bugun")]]);
    if (cmd === "qidir" && !arg) return tg("sendMessage", { chat_id: chatId, text: "🔍 Nimani qidiramiz? Shu xabarga javob qilib so'z yozing.", reply_markup: { force_reply: true, input_field_placeholder: "Qidiruv so'zi" } });
    await yozmoqda(chatId);
    const x =
      cmd === "bugun" ? await bugunXabari()
      : cmd === "inbox" ? await inboxXabari()
      : cmd === "hafta" ? await haftaXabari()
      : cmd === "pul" || cmd === "hisobot" ? await pulXabari()
      : cmd === "odatlar" ? await odatlarXabari()
      : cmd === "qidir" ? await qidiruvXabari(arg)
      : null;
    if (!x) return yubor(chatId, "Bunday buyruq yo'q. /yordam ni ko'ring.");
    return yubor(chatId, x.text, x.kb);
  }

  if (!media && !matn) return yubor(chatId, "Bu turdagi xabarni saqlay olmayman. Matn, rasm, video, fayl yoki ovozli xabar yuboring.");
  await yozmoqda(chatId);

  // ----- Izohsiz ovozli xabar: matnga aylantiramiz -----
  let transkript = false;
  if (media?.tur === "ovoz" && !matn && sttBor() && (media.size ?? 0) < MAKS_YUKLAB_OLISH) {
    const t = await transkripsiya(await faylOl(media.fileId), media.nomi, m.voice?.duration).catch((e) => {
      console.error(e);
      return "";
    });
    if (t?.trim()) { matn = t.trim(); transkript = true; }
  }

  // ----- Albom: keyingi fayllar birinchi yozuvga qo'shiladi -----
  if (media && m.media_group_id) {
    const g = String(m.media_group_id);
    const mavjud = (await q(`select id, nom from elementlar where meta->>'tg_guruh' = $1 and created_at > now() - interval '10 minutes' order by created_at limit 1`, [g]))[0];
    if (mavjud) {
      await faylSaqla(m, media, mavjud.id, mavjud.nom);
      return;
    }
  }

  const ustidan: Record<string, any> = {};
  if (!matn && media) ustidan.nom = media.sarlavha;
  const { id } = await v2.tezQosh(matn || media!.sarlavha, ustidan, "Telegram");
  if (media) {
    if (m.media_group_id || transkript) await v2.saqla(id, { meta: { ...(m.media_group_id ? { tg_guruh: String(m.media_group_id) } : {}), ...(transkript ? { transkript: true } : {}) } });
    await faylSaqla(m, media, id, matn || media.sarlavha);
  }
  const k = await kartochka(id, transkript ? "🎙 <i>Ovozdan matnga aylantirildi, ovoz ham saqlandi.</i>" : undefined);
  return yubor(chatId, k.text, k.kb, m.message_id);
}

// ======================= Tugmalar =======================

export async function tugmaBosildi(cq: any) {
  if (await guruhTugmasi(cq)) return;
  if (await agentTugmasi(cq)) return;
  const chatId = cq.message?.chat?.id;
  const msgId = cq.message?.message_id;
  const [cmd, a, b] = String(cq.data ?? "").split(":");
  let id = "";
  try { id = a ? toliq(a) : ""; } catch { id = ""; }

  const yangila = async (qoshimcha?: string, kb?: Klaviatura) => {
    const k = await kartochka(id, qoshimcha);
    await tahrirla(chatId, msgId, k.text, kb ?? k.kb);
  };
  const bor = async () => {
    if (!id || !(await elementBormi(id))) {
      await javob(cq.id, "Bu yozuv yangi tizimda topilmadi (eski kartochka bo'lishi mumkin)", true);
      return false;
    }
    return true;
  };

  switch (cmd) {
    case "bugun": {
      const x = await bugunXabari();
      await tahrirla(chatId, msgId, x.text, x.kb);
      return javob(cq.id, "Yangilandi");
    }
    case "ib":
      return javob(cq.id, "Shu xabarga javob (Reply) qilib rasm, video, ovoz yoki fayl yuboring", true);
  }
  if (!(await bor())) return;

  switch (cmd) {
    case "bd":
    case "ob": {
      if (cmd === "bd") await v2.saqla(id, { holat: "bajarildi" });
      else await v2.odatBelgila(id, bugun(), true);
      const x = await bugunXabari();
      await tahrirla(chatId, msgId, x.text, x.kb);
      return javob(cq.id, "✅ Belgilandi");
    }
    case "me": {
      await v2.saqla(id, { sana: kunQosh(bugun(), 1) });
      const x = await kechkiXabar();
      await tahrirla(chatId, msgId, x.text, x.kb);
      return javob(cq.id, "➡️ Ertaga ko'chirildi");
    }
    case "oo":
    case "ou": {
      await v2.odatBelgila(id, bugun(), cmd === "oo");
      const x = await odatlarXabari();
      await tahrirla(chatId, msgId, x.text, x.kb);
      return javob(cq.id, cmd === "oo" ? "✅ Belgilandi" : "Bekor qilindi");
    }
    case "c":
      await yangila();
      return javob(cq.id);
    case "cn": {
      const k = await kartochka(id);
      await yubor(chatId, k.text, k.kb);
      return javob(cq.id);
    }
    case "d":
      await v2.saqla(id, { holat: "bajarildi" });
      await yangila();
      return javob(cq.id, "✅ Bajarildi");
    case "u":
      await v2.saqla(id, { holat: "ochiq" });
      await yangila();
      return javob(cq.id, "Qayta ochildi");
    case "m": {
      const n = Number(b) || 0;
      const el = (await q(`select tur from elementlar where id = $1`, [id]))[0];
      await v2.saqla(id, { sana: kunQosh(bugun(), n), ...(["qayd", "goya", "havola"].includes(el.tur) ? { tur: "vazifa" } : {}) });
      await yangila();
      return javob(cq.id, n ? "🗓 Ertaga" : "🗓 Bugun");
    }
    case "tl": {
      const k = qisqa(id);
      const kb: Klaviatura = [];
      for (let i = 0; i < TEZ_TURLAR.length; i += 3) kb.push(TEZ_TURLAR.slice(i, i + 3).map((t) => ({ text: `${TUR_BELGI[t]} ${TUR_NOM[t]}`, callback_data: `t:${k}:${t}` })));
      kb.push([{ text: "‹ Orqaga", callback_data: `c:${k}` }]);
      await yangila("<i>Turini tanlang:</i>", kb);
      return javob(cq.id);
    }
    case "t": {
      if (!TEZ_TURLAR.includes(b)) return javob(cq.id);
      await v2.saqla(id, { tur: b });
      await yangila();
      return javob(cq.id, `${TUR_NOM[b]} ✓`);
    }
    case "sl": {
      const k = qisqa(id);
      const s = [...(await sohalar()).values()];
      const kb: Klaviatura = [];
      for (let i = 0; i < s.length; i += 2) kb.push(s.slice(i, i + 2).map((x) => ({ text: x.nom, callback_data: `s:${k}:${x.id}` })));
      kb.push([{ text: "Sohasiz", callback_data: `s:${k}:-` }, { text: "‹ Orqaga", callback_data: `c:${k}` }]);
      await yangila("<i>Sohani tanlang:</i>", kb);
      return javob(cq.id);
    }
    case "s": {
      const soha = b === "-" ? null : b;
      if (soha && !(await sohalar()).has(soha)) return javob(cq.id, "Soha topilmadi");
      await v2.saqla(id, soha ? { soha_id: soha, inbox: false } : { soha_id: null });
      await yangila();
      return javob(cq.id, soha ? `◆ ${(await sohalar()).get(soha).nom}` : "Sohasiz");
    }
    case "kl": {
      const k = qisqa(id);
      const kb: Klaviatura = [];
      for (let i = 0; i < KAT.length; i += 2) kb.push(KAT.slice(i, i + 2).map((x, j) => ({ text: x, callback_data: `kc:${k}:${i + j}` })));
      kb.push([{ text: "‹ Orqaga", callback_data: `c:${k}` }]);
      await yangila("<i>Kategoriyani tanlang:</i>", kb);
      return javob(cq.id);
    }
    case "kc": {
      const kat = KAT[Number(b)] ?? "Boshqa";
      await v2.saqla(id, { kategoriya: kat });
      await yangila();
      return javob(cq.id, `🏷 ${kat}`);
    }
    case "f": {
      const f = await q(`select tur, file_id, tg_msg, tg_bolim, hajm from fayllar where element_id = $1 order by created_at`, [id]);
      if (!f.length) return javob(cq.id, "Bu yozuvda fayl yo'q");
      await javob(cq.id, "📤 Yuborilmoqda…");
      const r: ArxivFayl[] = f.map((x) => ({ bolim: (x.tg_bolim || (x.tur === "fayl" ? "hujjat" : x.tur)) as Bolim, id: x.tg_msg ?? 0, ...(x.file_id ? { f: x.file_id } : {}), s: Number(x.hajm) || 0 }));
      await arxivdanYubor(chatId, r);
      return;
    }
    case "x": {
      const k = qisqa(id);
      await yangila("<b>Bu yozuv o'chirilsinmi?</b> Ichidagi qadamlar va fayl yozuvlari ham o'chadi.", [[{ text: "🗑 Ha, o'chirish", callback_data: `xy:${k}` }, { text: "Bekor", callback_data: `c:${k}` }]]);
      return javob(cq.id);
    }
    case "xy": {
      const el = await elementBormi(id);
      await v2.ochir(id);
      await tahrirla(chatId, msgId, `🗑 <s>${esc(el?.nom ?? "")}</s>\n<i>O'chirildi.</i>`);
      return javob(cq.id, "O'chirildi");
    }
    default:
      return javob(cq.id);
  }
}

// ======================= Kechki xabar =======================

export async function kechkiXabar(): Promise<{ text: string; kb: Klaviatura }> {
  const b = bugun();
  const d = await v2.bugunKorinish();
  const ertaga = await q(
    `select id, tur, nom, holat, to_char(vaqt,'HH24:MI') vaqt from elementlar where sana = $1 and holat <> 'bekor' and tur not in ('xarajat','daromad','odat','tolov') order by vaqt nulls last`,
    [kunQosh(b, 1)],
  );
  const qolgan = d.reja.filter((x: any) => x.holat !== "bajarildi" && ["vazifa", "qadam", "dars"].includes(x.tur));
  const t = ["🌙 <b>Kun yakuni</b>", `<i>${sanaUz(b)}</i>`, ""];
  t.push(d.progress.jami ? `Bugun: <b>${d.progress.bajarildi}/${d.progress.jami}</b> bajarildi.` : "Bugun rejada ish yo'q edi.");
  if (d.odatlar.length) t.push(`Odatlar: <b>${d.odatlar.filter((o) => o.done).length}/${d.odatlar.length}</b>`);
  if (qolgan.length) t.push("", "<b>Bajarilmay qolgan</b>", ...qolgan.map((x: any) => `▫️ ${esc(x.nom)}`));
  t.push("", ertaga.length ? "<b>Ertangi reja</b>" : "Ertaga hali reja yo'q — 1–3 ta asosiy ishni yozib qo'ying.", ...ertaga.map(qatorEl));
  if (d.inbox) t.push("", `📥 Inbox'da ${d.inbox} ta yozuv saralanishini kutyapti.`);
  if (!d.kundalik) t.push("", "📓 Kun qanday o'tdi? Ilovada bir-ikki qator yozib qo'ying.");
  const kb: Klaviatura = [];
  for (const x of qolgan.slice(0, 4)) kb.push([{ text: `➡️ Ertaga: ${x.nom.slice(0, 26)}`, callback_data: `me:${qisqa(x.id)}` }]);
  kb.push([ilova("📱 Shaxsiy", "bugun")]);
  return { text: t.join("\n"), kb };
}
