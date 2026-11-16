import { igHavola, tgHavola } from "./havolalar";
// Kontent agenti: Telegram navbati + rejali Claude.
// Oqim: /kontent → navbatda → (Claude oladi) ishlanmoqda → natija → tasdiq
//   ✅ Ha → tasdiqlandi → (Claude joylaydi) joylandi
//   ✏️ O'zgartir → izoh qo'shiladi → navbatda (qayta ishlanadi)
//   ❌ Yo'q → rad

import { q } from "./db";
import { serverdaJoyla, mediaBor, rejalanganlarniYakunla } from "./agent2";
import { zernioBor } from "./zernio";
import { tg, yubor, javob, esc, ILOVA_URL, type Klaviatura } from "./telegram";

export const HOLAT_BELGI: Record<string, string> = {
  navbatda: "⏳ Navbatda",
  ishlanmoqda: "⚙️ Ishlanmoqda",
  tasdiq: "👀 Tasdiq kutmoqda",
  tasdiqlandi: "✅ Tasdiqlandi, joylanadi",
  rejalandi: "🗓 Rejalandi",
  bajarildi: "✔️ Bajarildi",
  joylandi: "🚀 Joylandi",
  rad: "❌ Rad etildi",
  xato: "⚠️ Xato",
};

const LOYIHALAR: Record<string, string> = { productcrm: "product CRM", eduflow: "EduFlow" };

// Rejali Claude ishga tushadigan vaqtlar (Toshkent). Rejali vazifa jadvali bilan bir xil bo'lishi shart.
export const JADVAL = Array.from({ length: 17 }, (_, i) => `${String(6 + i).padStart(2, "0")}:45`); // 06:45 … 22:45
const TASHKENT_MS = 5 * 3600 * 1000;
const hhmm = (ms: number) => new Date(ms + TASHKENT_MS).toISOString().slice(11, 16);

// Keyingi tekshiruv vaqti va unga qancha qolgani
export function keyingiTekshiruv(hozir = Date.now()) {
  const t = new Date(hozir + TASHKENT_MS);
  const kun = t.toISOString().slice(0, 10);
  for (let k = 0; k < 2; k++) {
    for (const v of JADVAL) {
      const ms = Date.parse(`${kun}T${v}:00Z`) - TASHKENT_MS + k * 86400000;
      if (ms > hozir) return { vaqt: v, ertaga: k === 1, qoldi: Math.round((ms - hozir) / 60000) };
    }
  }
  return { vaqt: JADVAL[0], ertaga: true, qoldi: 0 };
}
export const davomiylik = (daq: number) => (daq < 60 ? `${daq} daq` : `${Math.floor(daq / 60)} soat${daq % 60 ? ` ${daq % 60} daq` : ""}`);
export const keyingiMatnOchiq = () => keyingiMatn();
const keyingiMatn = () => {
  const k = keyingiTekshiruv();
  return `${k.ertaga ? "ertaga" : "bugun"} ${k.vaqt} (${davomiylik(k.qoldi)}dan keyin)`;
};
// Buyruqqa qarab taxminiy ish vaqti (daqiqa)
export function taxminiyVaqt(buyruq: string) {
  const b = buyruq.toLowerCase();
  if (/video|mp4|animatsiya|montaj/.test(b)) return 45;
  if (/reels|ssenariy|karusel|carousel/.test(b)) return 15;
  if (/g'oya|goya|idea/.test(b)) return 10;
  return 10;
}

let tayyor = false;
export async function jadvalTayyorla() {
  if (tayyor) return;
  await q(`create table if not exists agent_vazifalar (
    id serial primary key,
    loyiha text not null default 'productcrm',
    tur text not null default 'kontent',
    buyruq text not null,
    holat text not null default 'navbatda',
    natija jsonb,
    izohlar jsonb not null default '[]'::jsonb,
    tg_msg int,
    urinish int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await q(`create index if not exists av_holat on agent_vazifalar (holat)`);
  await q(`alter table agent_vazifalar
    add column if not exists qadamlar jsonb not null default '[]'::jsonb,
    add column if not exists taxmin_daq int,
    add column if not exists boshlangan timestamptz,
    add column if not exists holat_msg int,
    add column if not exists ota_id int,
    add column if not exists reja jsonb not null default '[]'::jsonb,
    add column if not exists joriy int not null default 0,
    add column if not exists kun date,
    add column if not exists model text`);
  await q(`create table if not exists agent_sozlama (kalit text primary key, qiymat jsonb)`);
  tayyor = true;
}

// "/kontent eduflow: ..." yoki "/kontent ..." (standart: product CRM)
export function buyruqniAjrat(arg: string): { loyiha: string; buyruq: string } {
  const m = arg.match(/^(productcrm|crm|eduflow|edu)\s*[:\-]\s*(.+)$/is);
  if (!m) return { loyiha: "productcrm", buyruq: arg.trim() };
  const l = m[1].toLowerCase();
  return { loyiha: l.startsWith("edu") ? "eduflow" : "productcrm", buyruq: m[2].trim() };
}

export const TUR_NOM: Record<string, string> = { kontent: "Kontent", video: "Video", kunlik: "Kunlik video", rasmpost: "Rasmli post", hisobot: "Akkaunt hisoboti", tahlil: "Tahlil", post: "Post", izoh: "Izohga javob" };
export async function navbatgaQosh(arg: string, turMajburiy?: string) {
  await jadvalTayyorla();
  const { loyiha, buyruq } = buyruqniAjrat(arg);
  const tur = turMajburiy ?? (/^(tahlil|research|analiz)\s*:/i.test(buyruq) ? "tahlil" : /^(rasmli\s*)?post\s*:/i.test(buyruq) ? "rasmpost" : "kontent");
  const r = (await q(`insert into agent_vazifalar (loyiha, tur, buyruq, taxmin_daq) values ($1, $2, $3, $4) returning id`,
    [loyiha, tur, buyruq, tur === "tahlil" ? 15 : tur === "rasmpost" ? 20 : taxminiyVaqt(buyruq)]))[0];
  return { id: r.id as number, loyiha, buyruq, tur };
}

// ======================= Kunlik rejim =======================
export async function kunlikHolati(): Promise<boolean> {
  const s = (await q(`select qiymat from agent_sozlama where kalit = 'kunlik'`))[0];
  return s ? Boolean(s.qiymat?.yoqilgan) : true; // standart: yoqilgan
}
export async function kunlikYoq(yoqilgan: boolean) {
  await jadvalTayyorla();
  await q(`insert into agent_sozlama (kalit, qiymat) values ('kunlik', $1::jsonb)
           on conflict (kalit) do update set qiymat = excluded.qiymat`, [JSON.stringify({ yoqilgan })]);
  await panelYangila();
  return { yoqilgan };
}
// Har kuni 06:00 dan keyin birinchi tekshiruvda: akkaunt hisoboti + 1 ta video (boshidan oxirigacha)
// ---------- Kuniga faqat 1 ta video: video/kunlik vazifa uchun birinchi bo'sh kun ----------
export const bugunTosh = () => new Date(Date.now() + TASHKENT_MS).toISOString().slice(0, 10);
async function videoKuni(): Promise<string> {
  const band = new Set((await q(`select to_char(kun,'YYYY-MM-DD') k from agent_vazifalar
    where tur in ('video','kunlik') and kun >= $1::date and holat not in ('rad','xato')`, [bugunTosh()])).map((r: any) => r.k));
  const d = new Date(bugunTosh() + "T00:00:00Z");
  while (band.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export const sanaMatni = (k: string) => { const [, m, d] = k.split("-"); return `${+d}.${m}`; };
// Rasmli post kunlari (Toshkent, 1=Du ... 7=Ya). Standart: Se, Pa, Sh
export async function postKunlari(): Promise<number[]> {
  const s = (await q(`select qiymat from agent_sozlama where kalit = 'post_kunlari'`))[0];
  return Array.isArray(s?.qiymat) ? s.qiymat.map(Number) : [2, 4, 6];
}
export async function postKunlariniYoz(kunlar: number[]) {
  await jadvalTayyorla();
  const t = [...new Set(kunlar.map(Number).filter((x) => x >= 1 && x <= 7))].sort();
  await q(`insert into agent_sozlama (kalit, qiymat) values ('post_kunlari', $1::jsonb) on conflict (kalit) do update set qiymat = excluded.qiymat`, [JSON.stringify(t)]);
  return { post_kunlari: t };
}
async function kunlikYarat() {
  if (!(await kunlikHolati())) return;
  const t = new Date(Date.now() + TASHKENT_MS);
  if (t.getUTCHours() < 6) return;
  const kun = t.toISOString().slice(0, 10);
  const bor = await q(`select tur, holat from agent_vazifalar where kun = $1`, [kun]);
  const turlar = new Set(bor.map((r: any) => r.tur));
  // Bugunga boshqa video allaqachon rejalangan bo'lsa — kunlik video yaratilmaydi (kuniga 1 ta)
  if (bor.some((r: any) => r.tur === "video" && !["rad", "xato"].includes(r.holat))) turlar.add("kunlik");
  if (!turlar.has("hisobot"))
    await q(`insert into agent_vazifalar (loyiha, tur, buyruq, kun, taxmin_daq) values ('productcrm', 'hisobot', $1, $2, 10)`,
      [`Kunlik akkaunt hisoboti — ${kun}`, kun]);
  if (!turlar.has("kunlik"))
    await q(`insert into agent_vazifalar (loyiha, tur, buyruq, kun, taxmin_daq) values ('productcrm', 'kunlik', $1, $2, 60)`,
      [`Kunlik video — ${kun}: research → g‘oya → ssenariy → video`, kun]);
  const hk = t.getUTCDay() || 7;
  if (!turlar.has("rasmpost") && (await postKunlari()).includes(hk))
    await q(`insert into agent_vazifalar (loyiha, tur, buyruq, kun, taxmin_daq) values ('productcrm', 'rasmpost', $1, $2, 20)`,
      [`Rasmli post — ${kun}: karusel yoki bitta rasm (Instagram + Telegram)`, kun]);
}

const mediaBorMi = (n: any) => Boolean(n?.media_url || n?.media_urls?.length || n?.tg_file_id);
async function vazifaYarat(loyiha: string, tur: string, buyruq: string, otaId?: number, taxmin?: number) {
  await jadvalTayyorla();
  const kun = tur === "video" || tur === "kunlik" ? await videoKuni() : null;
  const r = (await q(
    `insert into agent_vazifalar (loyiha, tur, buyruq, ota_id, taxmin_daq, kun) values ($1, $2, $3, $4, $5, $6) returning id`,
    [loyiha, tur, buyruq, otaId ?? null, taxmin ?? taxminiyVaqt(buyruq), kun],
  ))[0];
  return r.id as number;
}

// "Ha" dan keyingi qadamlar matni
function keyingiQadamlar(qadamlar: string[]) {
  return ["", "<b>Keyingi qadamlar:</b>", ...qadamlar.map((x, i) => `${i + 1}. ${x}`), "", `⏰ Keyingi tekshiruv: ${keyingiMatn()}`].join("\n");
}

export const SOROV_MATNI = "🤖 Qanday kontent kerak?";
export const IZOH_MATNI = (id: number) => `✏️ #${id} — nimani o'zgartiray?`;

export async function kontentBuyrugi(chatId: number | string, arg: string, replyTo?: number) {
  if (!arg) {
    return tg("sendMessage", {
      chat_id: chatId,
      text: `${SOROV_MATNI}\nShu xabarga javob qilib yozing. Masalan: <code>Reels: tikuvxonada brak qanday kamayadi</code>\nEduFlow uchun boshiga <code>eduflow:</code> qo'shing.`,
      parse_mode: "HTML",
      reply_markup: { force_reply: true, input_field_placeholder: "Reels: ..." },
    });
  }
  const v = await navbatgaQosh(arg);
  await panelYangila();
  return yubor(
    chatId,
    [
      `🤖 <b>#${v.id} navbatga qo'shildi</b> · ${LOYIHALAR[v.loyiha]}`,
      `<i>${esc(v.buyruq)}</i>`,
      "",
      `⏰ Keyingi tekshiruv: <b>${keyingiMatn()}</b>`,
      `⏱ Ishning o'zi taxminan <b>${davomiylik(taxminiyVaqt(v.buyruq))}</b>`,
      "Claude ishni boshlaganda har bir qadamni shu yerda ko'rasiz.",
    ].join("\n"),
    [[{ text: "📋 Navbat", callback_data: "ag:ls" }]],
    replyTo,
  );
}

export async function tahlilBuyrugi(chatId: number | string, arg: string, replyTo?: number) {
  if (!arg) return yubor(chatId, "🔎 Nimani tahlil qilay? Masalan: <code>/tahlil raqobatchilar qanday Reels qilyapti</code>");
  const v = await navbatgaQosh(arg, "tahlil");
  await panelYangila();
  return yubor(chatId, `🔎 <b>#${v.id} tahlil navbatga qo'shildi</b>\n<i>${esc(v.buyruq)}</i>\n⏰ Keyingi tekshiruv: <b>${keyingiMatn()}</b> · ~15 daq\nNatija tasdiqsiz keladi va ilovadagi "Hisobotlar"da saqlanadi.`, undefined, replyTo);
}
export async function rasmpostBuyrugi(chatId: number | string, arg: string, replyTo?: number) {
  if (!arg) return yubor(chatId, "🖼 Qanday post? Masalan: <code>/rasmpost tannarxni to‘g‘ri hisoblashning 5 qadami (karusel)</code>\nMavzu bermasangiz ham bo‘ladi — <code>/rasmpost o‘zing tanla</code>");
  const v = await navbatgaQosh(arg, "rasmpost");
  await panelYangila();
  return yubor(chatId, `🖼 <b>#${v.id} rasmli post navbatga qo'shildi</b>\n<i>${esc(v.buyruq)}</i>\n⏰ Keyingi tekshiruv: <b>${keyingiMatn()}</b> · ~20 daq\nTayyor bo‘lganda rasmlar, Instagram caption va Telegram matnini yuboraman — siz tasdiqlaysiz.`, undefined, replyTo);
}
export async function kunlikBuyrugi(chatId: number | string) {
  await jadvalTayyorla();
  const on = await kunlikHolati();
  return yubor(chatId, [
    `📅 <b>Kunlik rejim: ${on ? "yoqilgan" : "o'chirilgan"}</b>`,
    "Har kuni 06:45 da agent:",
    "1. 📊 Instagram akkaunt hisobotini yuboradi (tasdiqsiz)",
    "2. 🎬 1 ta video tayyorlaydi: research → g‘oya → ssenariy → video (kuniga faqat 1 ta)",
    `3. 🖼 Post kunlari (${(await postKunlari()).map((k) => ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"][k - 1]).join(", ") || "yo‘q"}): rasmli post — karusel yoki rasm`,
    "4. Siz ✅ bossangiz — Instagram va Telegram kanalga (har biriga o‘z matni bilan) joylaydi",
  ].join("\n"), [[on ? { text: "⏸ O'chirish", callback_data: "ag:koff" } : { text: "▶️ Yoqish", callback_data: "ag:kon" }]]);
}

export async function navbatXabari(): Promise<{ text: string; kb: Klaviatura }> {
  await jadvalTayyorla();
  const rows = await q(
    `select id, loyiha, buyruq, holat, qadamlar, taxmin_daq,
            extract(epoch from (now() - boshlangan))::int / 60 otdi
     from agent_vazifalar
     order by (holat in ('joylandi','rad','bajarildi')), id desc limit 12`,
  );
  const kt = `⏰ Keyingi tekshiruv: ${keyingiMatn()}`;
  if (!rows.length) return { text: `🤖 <b>Agent navbati bo'sh.</b>\nYangi vazifa: <code>/kontent Reels: ...</code>\n\n${kt}`, kb: [] };
  const t = ["🤖 <b>Agent navbati</b>", ""];
  for (const r of rows) {
    t.push(`<b>#${r.id}</b> ${HOLAT_BELGI[r.holat] ?? r.holat} · ${esc(String(r.buyruq).slice(0, 60))}`);
    if (r.holat === "ishlanmoqda") {
      const q2 = (r.qadamlar ?? []) as any[];
      const oxirgi = q2.length ? q2[q2.length - 1].matn : "boshlandi";
      t.push(`   ↳ ${esc(oxirgi)} · ${davomiylik(r.otdi ?? 0)} o'tdi${r.taxmin_daq ? ` / ~${davomiylik(r.taxmin_daq)}` : ""}`);
    }
  }
  t.push("", kt);
  return { text: t.join("\n"), kb: [[{ text: "🔄 Yangilash", callback_data: "ag:ls" }]] };
}

const tasdiqTugmalari = (id: number, media = false): Klaviatura => media ? [
  [{ text: "🚀 Hozir joylash", callback_data: `ag:ha:${id}` }, { text: "🕐 Eng yaxshi vaqtda", callback_data: `ag:hv:${id}` }],
  [{ text: "⏰ Vaqt tanlash", web_app: { url: `${ILOVA_URL}#agent` } }, { text: "✏️ O'zgartir", callback_data: `ag:oz:${id}` }],
  [{ text: "❌ Yo'q", callback_data: `ag:yoq:${id}` }],
] : [
  [
    { text: "✅ Ha", callback_data: `ag:ha:${id}` },
    { text: "✏️ O'zgartir", callback_data: `ag:oz:${id}` },
  ],
  [{ text: "❌ Yo'q", callback_data: `ag:yoq:${id}` }],
];

// Agent javobidagi tugmani bossa
export async function agentTugmasi(cq: any): Promise<boolean> {
  const data = String(cq.data ?? "");
  if (!data.startsWith("ag:")) return false;
  const chatId = cq.message?.chat?.id;
  const msgId = cq.message?.message_id;
  const [, amal, idS] = data.split(":");
  await jadvalTayyorla();

  if (amal === "pn") {
    await javob(cq.id, "🔄 Yangilandi");
    const p = await panelMatni();
    await tg("editMessageText", { chat_id: chatId, message_id: msgId, text: p.text, parse_mode: "HTML", reply_markup: { inline_keyboard: p.kb } }).catch(() => {});
    return true;
  }
  if (amal === "kon" || amal === "koff") {
    await kunlikYoq(amal === "kon");
    await javob(cq.id, amal === "kon" ? "Kunlik rejim yoqildi" : "Kunlik rejim o'chirildi");
    await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [[amal === "kon" ? { text: "⏸ O'chirish", callback_data: "ag:koff" } : { text: "▶️ Yoqish", callback_data: "ag:kon" }]] } }).catch(() => {});
    return true;
  }
  if (amal === "new") {
    await javob(cq.id);
    await kontentBuyrugi(chatId, "");
    return true;
  }
  if (amal === "ls") {
    const x = await navbatXabari();
    await javob(cq.id);
    await yubor(chatId, x.text, x.kb);
    return true;
  }

  const id = Number(idS);
  if (amal === "tk") {
    const i = Number(data.split(":")[3] ?? 0);
    const v = (await q(`select natija from agent_vazifalar where id = $1`, [id]))[0];
    const t = v?.natija?.takliflar?.[i];
    if (!t) { await javob(cq.id, "Taklif topilmadi", true); return true; }
    if (t.qoshildi) { await javob(cq.id, `Allaqachon navbatda: #${t.qoshildi}`, true); return true; }
    const yangi = await navbatgaQosh(String(t.buyruq));
    await q(`update agent_vazifalar set natija = jsonb_set(natija, $2::text[], to_jsonb($3::int)) where id = $1`, [id, `{takliflar,${i},qoshildi}`, yangi.id]);
    await javob(cq.id, `✅ #${yangi.id} navbatga qo‘shildi`);
    await yubor(chatId, `✅ <b>#${yangi.id}</b> navbatga qo‘shildi: <i>${esc(String(t.matn))}</i>\n⏰ Keyingi tekshiruv: ${keyingiMatn()}`, undefined, msgId);
    await panelYangila();
    return true;
  }
  if (amal === "oz") {
    const v = (await q(`select holat from agent_vazifalar where id = $1`, [id]))[0];
    if (!v || v.holat !== "tasdiq") { await javob(cq.id, v ? `Holati: ${HOLAT_BELGI[v.holat] ?? v.holat}` : "Vazifa topilmadi", true); return true; }
    await javob(cq.id);
    await tg("sendMessage", {
      chat_id: chatId,
      text: IZOH_MATNI(id),
      parse_mode: "HTML",
      reply_markup: { force_reply: true, input_field_placeholder: "Masalan: hook qisqaroq, oxirida demo taklifi" },
    });
    return true;
  }
  try {
    await qaror(id, amal as "ha" | "hv" | "yoq");
    await javob(cq.id, amal === "yoq" ? "❌ Rad etildi" : "✅ Tasdiqlandi");
  } catch (e) {
    await javob(cq.id, String((e as Error).message), true);
  }
  void msgId;
  return true;
}

// Tasdiq qarori — bot tugmasi va Mini App bir xil funksiyani ishlatadi
export async function qaror(id: number, amal: "ha" | "hv" | "vq" | "yoq" | "oz", izoh?: string, vaqt?: string) {
  await jadvalTayyorla();
  const v = (await q(`select id, holat, buyruq, loyiha, tur, natija, tg_msg from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) throw new Error("Vazifa topilmadi");
  if (v.holat !== "tasdiq") throw new Error(`Holati: ${HOLAT_BELGI[v.holat] ?? v.holat}`);
  // Media tayyor va Zernio kaliti bor — server darhol joylaydi yoki rejalaydi
  if ((amal === "ha" || amal === "hv" || amal === "vq") && v.tur !== "izoh" && mediaBor(v.natija) && zernioBor()) {
    if (v.tg_msg) await tg("editMessageReplyMarkup", { chat_id: egasi(), message_id: v.tg_msg, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    return serverdaJoyla(id, amal === "hv" ? "eng_yaxshi" : amal === "vq" ? String(vaqt || "") : "hozir");
  }
  if (amal === "vq") throw new Error("Vaqt tanlash uchun Zernio API kaliti kerak");
  const bosh = `<b>#${id}</b> · <i>${esc(String(v.buyruq).slice(0, 80))}</i>`;
  let matn = "";
  let yangiId: number | null = null;
  const ozining = v.tur === "post" || v.tur === "izoh";
  if (ozining && (amal === "ha" || amal === "hv" || amal === "oz")) {
    // O'z postingiz yoki izoh javobi: "O'zgartir" — yangi matn bilan darhol tasdiq
    const qoshimcha: Record<string, unknown> = { vaqt: amal === "hv" ? "eng_yaxshi" : "hozir" };
    if (amal === "oz") {
      if (!izoh?.trim()) throw new Error("Yangi matnni yozing");
      Object.assign(qoshimcha, v.tur === "post" ? { caption: izoh.trim(), matn: izoh.trim() } : { javob: izoh.trim(), matn: izoh.trim() });
    }
    await q(`update agent_vazifalar set holat = 'tasdiqlandi', natija = coalesce(natija,'{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify(qoshimcha)]);
    matn = `${bosh}\n✅ ${amal === "oz" ? "Yangi matn bilan tasdiqlandi" : "Tasdiqlandi"}${v.tur === "post" ? (amal === "hv" ? " · eng yaxshi vaqtga rejalanadi" : " · hozir joylanadi") : " · javob yuboriladi"}.\n⏰ Agent: ${keyingiMatn()}`;
  } else if (amal === "ha" || amal === "hv") {
    if (v.natija?.media_url || v.natija?.media_urls?.length) {
      await q(`update agent_vazifalar set holat = 'tasdiqlandi', natija = coalesce(natija,'{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify({ vaqt: amal === "hv" ? "eng_yaxshi" : "hozir" })]);
      matn = `${bosh}\n✅ Tasdiqlandi.` + keyingiQadamlar(["🚀 Instagram (Zernio) va ulangan bo‘lsa Telegram kanalga joylash", "🔗 Joylangach havolani shu yerga yuboraman"]);
    } else {
      await q(`update agent_vazifalar set holat = 'bajarildi', updated_at = now() where id = $1`, [id]);
      yangiId = await vazifaYarat(v.loyiha, "video", `Video: #${id} ssenariysi bo‘yicha Reels (1080×1920)`, id, 45);
      const vk = String((await q(`select to_char(kun,'YYYY-MM-DD') k from agent_vazifalar where id = $1`, [yangiId]))[0]?.k ?? bugunTosh());
      matn = `${bosh}\n✅ Ssenariy tasdiqlandi.` + keyingiQadamlar([
        vk > bugunTosh()
          ? `🎬 Video — <b>#${yangiId}</b>. Bugungi video o‘rni band (kuniga 1 ta), shuning uchun <b>${sanaMatni(vk)}</b> kuni yasaladi`
          : `🎬 Video yasash — <b>#${yangiId}</b> navbatga qo‘shildi (~45 daq)`,
        "👀 Tayyor videoni shu yerga yuboraman — siz tasdiqlaysiz",
        "🚀 Tasdiqdan keyin Instagram va Telegram kanalga joylanadi",
      ]);
    }
  } else if (amal === "yoq") {
    await q(`update agent_vazifalar set holat = 'rad', updated_at = now() where id = $1`, [id]);
    matn = `${bosh}\n❌ Rad etildi.`;
  } else if (/^\s*(ig|insta|tg|telegram)\s*:/i.test(izoh ?? "")) {
    // Matnni to'g'ridan-to'g'ri almashtirish — agent qayta ishlamaydi
    const m = (izoh ?? "").match(/^\s*(ig|insta|tg|telegram)\s*:\s*([\s\S]+)$/i)!;
    const tgmi = /^t/i.test(m[1]);
    const yangi = m[2].trim();
    await q(`update agent_vazifalar set natija = coalesce(natija,'{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify(tgmi ? { tg_matn: yangi } : { caption: yangi })]);
    await yubor(egasi(), `✏️ <b>#${id}</b> — ${tgmi ? "Telegram matni" : "Instagram caption"} almashtirildi:\n\n${esc(yangi)}`, tasdiqTugmalari(id, mediaBorMi(v.natija)));
    await panelYangila();
    return { ok: true, yangi: null };
  } else {
    if (!izoh?.trim()) throw new Error("Nimani o‘zgartirish kerakligini yozing");
    await q(
      `update agent_vazifalar
         set izohlar = izohlar || jsonb_build_array(jsonb_build_object('matn', $2::text, 'vaqt', now())),
             holat = 'navbatda', updated_at = now()
       where id = $1`,
      [id, izoh.trim()],
    );
    matn = `✏️ ${bosh}\nIzoh bilan navbatga qaytdi: <i>${esc(izoh.trim())}</i>\n\n⏰ Keyingi tekshiruv: ${keyingiMatn()}`;
  }
  if (v.tg_msg) await tg("editMessageReplyMarkup", { chat_id: egasi(), message_id: v.tg_msg, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  await yubor(egasi(), matn, undefined, v.tg_msg ?? undefined);
  await panelYangila();
  return { ok: true, yangi: yangiId };
}

// Natija xabaridagi tugmalarni olib tashlab, ostiga holat yozadi
async function tugmalarniAlmashtir(chatId: number, msgId: number, holat: string) {
  await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  await yubor(chatId, holat, undefined, msgId);
}

// Force-reply javoblari: yangi vazifa yoki o'zgartirish izohi
export async function agentJavobi(m: any): Promise<boolean> {
  const r = m.reply_to_message;
  if (!r?.from?.is_bot) return false;
  const rt = String(r.text ?? "");
  const matn = String(m.text ?? "").trim();
  if (!matn) return false;
  if (rt.startsWith(SOROV_MATNI)) {
    await kontentBuyrugi(m.chat.id, matn, m.message_id);
    return true;
  }
  const iz = rt.match(/^✏️ #(\d+) — nimani o'zgartiray\?/);
  if (iz) {
    try { await qaror(Number(iz[1]), "oz", matn); }
    catch (e) { await yubor(m.chat.id, `#${iz[1]}: ${esc(String((e as Error).message))}`, undefined, m.message_id); }
    return true;
  }
  return false;
}

// ======================= API (Claude chaqiradi) =======================

const egasi = () => String(process.env.ALLOWED_CHAT_ID);

export async function apiNavbat() {
  await jadvalTayyorla();
  await kunlikYarat();
  await yurakUrdi();
  await rejalanganlarniYakunla().catch((e) => console.error("rejalangan", e));
  await tiqilganlarniOgohlantir().catch((e) => console.error("ogoh", e));
  // 2 soatdan ortiq "ishlanmoqda"da qolganlarini qayta navbatga qaytaramiz
  await q(`update agent_vazifalar set holat = 'navbatda', updated_at = now()
           where holat = 'ishlanmoqda' and updated_at < now() - interval '2 hours'`);
  return q(
    `select v.id, v.loyiha, v.tur, v.buyruq, v.holat, v.natija, v.izohlar, v.urinish, v.ota_id, o.natija ota_natija,
            to_char(v.created_at at time zone 'Asia/Tashkent','YYYY-MM-DD HH24:MI') yaratilgan
     from agent_vazifalar v left join agent_vazifalar o on o.id = v.ota_id
     where v.holat in ('navbatda','tasdiqlandi') and (v.kun is null or v.kun <= $1::date)
     order by case v.tur when 'hisobot' then 0 when 'tahlil' then 1 else 2 end, v.id`, [bugunTosh()],
  );
}
// ---------- Faollik: dispetcher har GET'da "yurak urishi"ni yozadi ----------
async function yurakUrdi() {
  const kun = new Date(Date.now() + TASHKENT_MS).toISOString().slice(0, 10);
  await q(`insert into agent_sozlama (kalit, qiymat) values ('yurak', jsonb_build_object('oxirgi', now(), 'kun', $1::text, 'soni', 1))
           on conflict (kalit) do update set qiymat = jsonb_build_object('oxirgi', now(), 'kun', $1::text,
             'soni', case when agent_sozlama.qiymat->>'kun' = $1 then coalesce((agent_sozlama.qiymat->>'soni')::int, 0) + 1 else 1 end)`, [kun]);
}
// 90 daqiqadan ortiq navbatda qolgan og'ir ish — ishchi ishga tushmagan (ko'pincha Claude limiti)
async function tiqilganlarniOgohlantir() {
  const rows = await q(`select id, tur, buyruq from agent_vazifalar
    where holat = 'navbatda' and tur in ('kunlik','video','kontent','tahlil','rasmpost')
      and greatest(created_at, coalesce((kun::timestamp + interval '6 hours 45 minutes') at time zone 'Asia/Tashkent', created_at)) < now() - interval '90 minutes' and not (coalesce(natija,'{}'::jsonb) ? 'ogohlantirildi') limit 3`);
  for (const r of rows) {
    await q(`update agent_vazifalar set natija = coalesce(natija,'{}'::jsonb) || '{"ogohlantirildi":true}'::jsonb where id = $1`, [r.id]);
    await yubor(egasi(), `⚠️ <b>#${r.id} 1.5 soatdan beri olinmadi</b>\n<i>${esc(String(r.buyruq).slice(0, 80))}</i>\n\n${r.tur === "kunlik" || r.tur === "video" ? "Opus" : "Sonnet"} ishchisi ishga tushmadi. Ko‘pincha sabab — Claude limiti tugagan. Limit tiklanganda agent o‘zi davom etadi. Aniq limit: Claude → Settings → Usage.`);
  }
}
export async function faollik() {
  await jadvalTayyorla();
  const yurak = (await q(`select qiymat from agent_sozlama where kalit = 'yurak'`))[0]?.qiymat ?? null;
  const bugun = await q(`select coalesce(model,'—') model, count(*)::int soni,
      coalesce(sum(extract(epoch from (updated_at - boshlangan)) / 60) filter (where boshlangan is not null and holat <> 'ishlanmoqda'), 0)::int daqiqa
    from agent_vazifalar where boshlangan > (now() at time zone 'Asia/Tashkent')::date at time zone 'Asia/Tashkent' group by 1 order by 2 desc`);
  const hafta = await q(`select coalesce(model,'—') model, count(*)::int soni from agent_vazifalar where boshlangan > now() - interval '7 days' group by 1`);
  const tiqilgan = (await q(`select count(*)::int n from agent_vazifalar where holat = 'navbatda' and greatest(created_at, coalesce((kun::timestamp + interval '6 hours 45 minutes') at time zone 'Asia/Tashkent', created_at)) < now() - interval '90 minutes' and tur in ('kunlik','video','kontent','tahlil','rasmpost')`))[0].n;
  const xato = (await q(`select count(*)::int n from agent_vazifalar where holat = 'xato' and updated_at > now() - interval '24 hours'`))[0].n;
  const t = new Date(Date.now() + TASHKENT_MS); const soat = t.getUTCHours() + t.getUTCMinutes() / 60;
  const faolVaqt = soat >= 6.75 && soat <= 23;
  const oxirgi = yurak?.oxirgi ? Date.parse(yurak.oxirgi) : 0;
  const daqOldin = oxirgi ? Math.round((Date.now() - oxirgi) / 60000) : null;
  const holat = tiqilgan ? "limit" : faolVaqt && (daqOldin == null || daqOldin > 75) ? "jim" : "yaxshi";
  return { yurak, daqOldin, bugun, hafta, tiqilgan, xato, holat };
}

// Agent uchun kontekst: oxirgi ishlar (takrorlamaslik) va oxirgi hisobot (solishtirish)
export async function apiKontekst() {
  const tarix = await q(
    `select id, tur, buyruq, holat, natija->>'havola' havola, to_char(updated_at at time zone 'Asia/Tashkent','YYYY-MM-DD') sana
     from agent_vazifalar where holat in ('bajarildi','joylandi','tasdiqlandi','tasdiq') and tur <> 'hisobot'
     order by id desc limit 20`);
  const hisobot = (await q(
    `select natija->>'matn' matn, to_char(updated_at at time zone 'Asia/Tashkent','YYYY-MM-DD') sana
     from agent_vazifalar where tur = 'hisobot' and natija is not null order by id desc limit 1`))[0] ?? null;
  const kanal = (await q(`select qiymat from agent_sozlama where kalit = 'tg_kanal'`))[0]?.qiymat ?? null;
  return { tarix, oxirgi_hisobot: hisobot, kunlik: await kunlikHolati(), tg_kanal: kanal };
}

// Tur bo'yicha standart reja (agent `ol` da o'z rejasini yuborishi ham mumkin)
export function standartReja(tur: string, buyruq: string): string[] {
  if (tur === "hisobot") return ["Instagram statistikasini yig'ish", "Kechagi kun bilan solishtirish", "Tavsiyalar", "Hisobotni yuborish"];
  if (tur === "tahlil") return ["Ma'lumot yig'ish (research)", "Tahlil", "Xulosa va tavsiyalar", "Natijani yuborish"];
  if (tur === "rasmpost") return ["Bilim, tarix va statistikani o'qish", "Mavzu va format tanlash", "Slaydlar matni", "Dizayn va render (1080×1350)", "Instagram caption va Telegram matni", "Tekshiruv", "Natijani yuborish"];
  if (tur === "kunlik") return ["Statistika va trend research", "G'oya tanlash", "Ssenariy", "Ovoz yozish", "Sahnalar va render", "Musiqa va MP4", "Tekshiruv", "Natijani yuborish"];
  if (tur === "video" || /video|mp4|montaj/i.test(buyruq))
    return ["Ssenariyni o'qish", "Ovoz yozish", "Sahnalar va animatsiya", "Kadrlarni render qilish", "Musiqa va SFX", "MP4 yig'ish", "Tekshiruv", "Natijani yuborish"];
  if (/g'oya|goya/i.test(buyruq)) return ["Bilim va trendlarni o'qish", "10 ta g'oya", "Saralash va tekshiruv", "Natijani yuborish"];
  return ["Bilim va brendni o'qish", "5 ta hook", "Ssenariy va storyboard", "Caption va Telegram post", "Tekshiruv", "Natijani yuborish"];
}

const norm = (x: string) => x.toLowerCase().replace(/[‘’ʻ`']/g, "'").replace(/\s+/g, " ").trim();
const chiziq = (f: number) => { const n = Math.round(f * 10); return "▰".repeat(n) + "▱".repeat(10 - n); };

function rejaQatorlari(v: any, yakun: boolean) {
  const reja = (v.reja ?? []) as string[];
  const log = (v.qadamlar ?? []) as { matn: string; vaqt: string }[];
  const vaqti = (nom: string) => { const x = [...log].reverse().find((l) => norm(l.matn) === norm(nom)); return x ? ` <i>${hhmm(Date.parse(x.vaqt))}</i>` : ""; };
  return reja.map((nom, i) => {
    if (yakun || i < v.joriy) return `✔️ ${esc(nom)}${vaqti(nom)}`;
    if (i === v.joriy) return `⏳ <b>${esc(nom)}</b> ← hozir`;
    return `▫️ ${esc(nom)}`;
  });
}

export const modelNomi = (m: string) => /haiku/i.test(m) ? "Haiku (tez)" : /sonnet/i.test(m) ? "Sonnet (o‘rta)" : /opus/i.test(m) ? "Opus (kuchli)" : m;
// Vazifaning jonli holat xabari: reja, hozirgi qadam, foiz, vaqt
function holatMatni(v: any, yakun?: string) {
  const reja = (v.reja ?? []) as string[];
  const otdi = v.boshlangan ? Math.max(0, Math.round((Date.now() - Date.parse(v.boshlangan)) / 60000)) : 0;
  const foiz = yakun ? 1 : reja.length ? v.joriy / reja.length : 0;
  const qoldi = v.taxmin_daq ? Math.max(1, v.taxmin_daq - otdi) : null;
  return [
    `${yakun ? "✅" : "⚙️"} <b>#${v.id} ${yakun ?? "ishlanmoqda"}</b> · <i>${esc(String(v.buyruq).slice(0, 70))}</i>`,
    `${chiziq(foiz)} ${Math.round(foiz * 100)}% · ${yakun ? reja.length : v.joriy}/${reja.length} qadam`,
    `🕐 ${v.boshlangan ? hhmm(Date.parse(v.boshlangan)) : ""} da boshlandi · ${davomiylik(otdi)} o'tdi${!yakun && qoldi ? ` · ~${davomiylik(qoldi)} qoldi` : ""}${v.model ? ` · 🧠 ${esc(modelNomi(v.model))}` : ""}`,
    "",
    ...rejaQatorlari(v, Boolean(yakun)),
    "",
    `<i>Yangilandi ${hhmm(Date.now())}</i>`,
  ].join("\n");
}

async function holatXabariniYangila(id: number, yakun?: string) {
  const v = (await q(`select id, buyruq, qadamlar, reja, joriy, taxmin_daq, boshlangan, holat_msg, model from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) return;
  const text = holatMatni(v, yakun);
  if (v.holat_msg) {
    await tg("editMessageText", { chat_id: egasi(), message_id: v.holat_msg, text, parse_mode: "HTML" }).catch(() => {});
  } else {
    const m = await yubor(egasi(), text);
    await q(`update agent_vazifalar set holat_msg = $2 where id = $1`, [id, m.message_id]);
  }
}

// ======================= Agent paneli (qadalgan xabar) =======================

export async function panelMatni(): Promise<{ text: string; kb: Klaviatura }> {
  await jadvalTayyorla();
  const rows = await q(
    `select id, buyruq, holat, reja, joriy, taxmin_daq, boshlangan, model,
            (updated_at at time zone 'Asia/Tashkent')::date = (now() at time zone 'Asia/Tashkent')::date bugun
     from agent_vazifalar order by id`,
  );
  const qisqa = (r: any) => `<b>#${r.id}</b> ${esc(String(r.buyruq).slice(0, 48))}`;
  const ish = rows.filter((r) => r.holat === "ishlanmoqda");
  const navbat = rows.filter((r) => r.holat === "navbatda");
  const tasdiq = rows.filter((r) => r.holat === "tasdiq");
  const joylash = rows.filter((r) => r.holat === "tasdiqlandi");
  const bajarildi = rows.filter((r) => ["bajarildi", "joylandi"].includes(r.holat) && r.bugun);
  const k = keyingiTekshiruv();
  const t = ["🤖 <b>Agent paneli</b>", ""];

  if (ish.length) {
    for (const r of ish) {
      const reja = (r.reja ?? []) as string[];
      const otdi = r.boshlangan ? Math.max(0, Math.round((Date.now() - Date.parse(r.boshlangan)) / 60000)) : 0;
      const qoldi = r.taxmin_daq ? Math.max(1, r.taxmin_daq - otdi) : null;
      t.push(`⚙️ <b>Hozir ishlayapti:</b> ${qisqa(r)}${r.model ? ` · 🧠 ${esc(modelNomi(r.model))}` : ""}`);
      t.push(`   ⏳ ${esc(reja[r.joriy] ?? "...")} (${r.joriy + 1}/${reja.length})`);
      t.push(`   ${chiziq(reja.length ? r.joriy / reja.length : 0)} · ${davomiylik(otdi)} o'tdi${qoldi ? ` · ~${davomiylik(qoldi)} qoldi` : ""}`);
      const keyingi = reja.slice(r.joriy + 1);
      if (keyingi.length) t.push(`   Keyin: ${keyingi.map(esc).join(" → ")}`);
    }
  } else {
    t.push(`💤 <b>Hozir ishlamayapti.</b> Keyingi tekshiruv: ${k.ertaga ? "ertaga " : ""}<b>${k.vaqt}</b>`);
  }

  const bolim = (sarlavha: string, arr: any[], qoshimcha?: (r: any) => string) => {
    if (!arr.length) return;
    t.push("", `${sarlavha} (${arr.length})`);
    for (const r of arr.slice(0, 6)) t.push(`• ${qisqa(r)}${qoshimcha ? qoshimcha(r) : ""}`);
  };
  bolim("⏳ <b>Navbatda</b>", navbat, (r) => ` · ~${davomiylik(r.taxmin_daq ?? taxminiyVaqt(r.buyruq))}`);
  bolim("👀 <b>Sizning tasdig'ingizni kutmoqda</b>", tasdiq);
  bolim("🚀 <b>Joylanishi kerak</b>", joylash);
  bolim("✔️ <b>Bugun bajarildi</b>", bajarildi);

  const jami = navbat.reduce((a, r) => a + (r.taxmin_daq ?? taxminiyVaqt(r.buyruq)), 0);
  if (navbat.length) t.push("", `🧮 Navbatdagi ish jami: ~${davomiylik(jami)}`);
  t.push("", (await kunlikHolati()) ? "📅 Kunlik rejim: <b>yoqilgan</b> (hisobot + 1 video)" : "📅 Kunlik rejim: o'chirilgan");
  const yr = (await q(`select qiymat from agent_sozlama where kalit = 'yurak'`))[0]?.qiymat;
  if (yr?.oxirgi) t.push(`💓 Oxirgi tekshiruv: ${hhmm(Date.parse(yr.oxirgi))} · bugun ${yr.soni ?? 0} marta`);
  t.push("", `<i>Yangilandi ${hhmm(Date.now())}</i>`);
  return { text: t.join("\n"), kb: [
    [{ text: "➕ Yangi vazifa", callback_data: "ag:new" }, { text: "🔄 Yangilash", callback_data: "ag:pn" }],
    [{ text: "📱 Ilovada ochish", web_app: { url: `${ILOVA_URL}#agent` } }],
  ] };
}

// Mini App uchun: panel ma'lumoti (JSON)
export async function ilovaMalumoti() {
  await jadvalTayyorla();
  const rows = await q(
    `select id, loyiha, tur, buyruq, holat, natija, izohlar, reja, joriy, qadamlar, taxmin_daq, ota_id, model,
            boshlangan, created_at, updated_at, to_char(kun,'YYYY-MM-DD') kun
     from agent_vazifalar order by id desc limit 40`,
  );
  const k = keyingiTekshiruv();
  return {
    hozir: Date.now(),
    keyingi: { vaqt: k.vaqt, ertaga: k.ertaga, qoldi: k.qoldi },
    jadval: JADVAL,
    kunlik: await kunlikHolati(),
    bugun: bugunTosh(),
    post_kunlari: await postKunlari(),
    vazifalar: rows.map((r) => ({
      ...r,
      otdi: r.boshlangan ? Math.max(0, Math.round((Date.now() - Date.parse(r.boshlangan)) / 60000)) : null,
      taxmin: r.taxmin_daq ?? taxminiyVaqt(r.buyruq),
    })),
  };
}

export async function ilovadanQosh(matn: string) {
  if (!matn.trim()) throw new Error("Vazifa matnini yozing");
  const v = await navbatgaQosh(matn.trim());
  void v.tur;
  await yubor(egasi(), [
    `🤖 <b>#${v.id} navbatga qo'shildi</b> (ilovadan) · ${LOYIHALAR[v.loyiha]}`,
    `<i>${esc(v.buyruq)}</i>`,
    `⏰ Keyingi tekshiruv: <b>${keyingiMatn()}</b> · ishning o'zi ~${davomiylik(taxminiyVaqt(v.buyruq))}`,
  ].join("\n"));
  await panelYangila();
  return v;
}

// Qadalgan panelni tahrirlaydi; bo'lmasa yangisini yuborib qadaydi
export async function panelYangila(yangidan = false) {
  try {
    const p = await panelMatni();
    const s = (await q(`select qiymat from agent_sozlama where kalit = 'panel_msg'`))[0];
    const eski = s?.qiymat?.id as number | undefined;
    if (eski && !yangidan) {
      const ok = await tg("editMessageText", { chat_id: egasi(), message_id: eski, text: p.text, parse_mode: "HTML", reply_markup: { inline_keyboard: p.kb } })
        .then(() => true).catch(() => false);
      if (ok) return;
    }
    if (eski) await tg("unpinChatMessage", { chat_id: egasi(), message_id: eski }).catch(() => {});
    const m = await yubor(egasi(), p.text, p.kb);
    await tg("pinChatMessage", { chat_id: egasi(), message_id: m.message_id, disable_notification: true }).catch(() => {});
    await q(`insert into agent_sozlama (kalit, qiymat) values ('panel_msg', $1::jsonb)
             on conflict (kalit) do update set qiymat = excluded.qiymat`, [JSON.stringify({ id: m.message_id })]);
  } catch (e) {
    console.error("panel", e);
  }
}

export async function apiOl(id: number, taxminDaq?: number, reja?: string[], model?: string) {
  const v = (await q(`select tur, buyruq from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) return false;
  const r0 = (reja?.length ? reja : standartReja(v.tur, v.buyruq)).map((x) => String(x).slice(0, 80));
  const r = (await q(
    `update agent_vazifalar
       set holat = 'ishlanmoqda', urinish = urinish + 1, updated_at = now(), boshlangan = now(),
           taxmin_daq = coalesce($2, taxmin_daq, $4), holat_msg = null, reja = $3::jsonb, joriy = 0,
           qadamlar = '[]'::jsonb, model = $5
     where id = $1 and holat = 'navbatda' returning id`,
    [id, taxminDaq ?? null, JSON.stringify(r0), taxminiyVaqt(v.buyruq), model ? String(model).slice(0, 40) : null],
  ))[0];
  if (!r) return false;
  await holatXabariniYangila(id);
  await panelYangila();
  return true;
}

// Agent qadam boshlaganini aytadi: rejadagi nom bo'lsa — o'sha qadamga o'tadi, bo'lmasa rejaga qo'shiladi
export async function apiJarayon(id: number, bosqich: string, taxminDaq?: number) {
  const v = (await q(`select reja, joriy, qadamlar from agent_vazifalar where id = $1 and holat = 'ishlanmoqda'`, [id]))[0];
  if (!v) throw new Error("vazifa ishlanmoqda holatida emas");
  const reja = [...((v.reja ?? []) as string[])];
  const b = bosqich.slice(0, 80);
  let idx = reja.findIndex((x) => norm(x) === norm(b) || norm(b).startsWith(norm(x)));
  if (idx < 0) {
    // rejada yo'q qadam: hozirgisidan keyin qo'shiladi
    idx = Math.min(v.joriy + 1, reja.length);
    reja.splice(idx, 0, b);
  }
  // joriy..idx-1 qadamlar hozir yakunlandi deb yoziladi
  const hozir = new Date().toISOString();
  const yakunlangan = idx > v.joriy ? reja.slice(v.joriy, idx).map((m) => ({ matn: m, vaqt: hozir })) : [];
  await q(
    `update agent_vazifalar
       set reja = $2::jsonb, joriy = $3, qadamlar = qadamlar || $4::jsonb,
           taxmin_daq = coalesce($5, taxmin_daq), updated_at = now()
     where id = $1`,
    [id, JSON.stringify(reja), idx, JSON.stringify(yakunlangan), taxminDaq ?? null],
  );
  await holatXabariniYangila(id);
  await panelYangila();
  return { ok: true, qadam: idx + 1, jami: reja.length };
}

type Natija = { matn: string; media_url?: string; media_tur?: "rasm" | "video" | "fayl"; izoh?: string; caption?: string; toliq_url?: string; tg_matn?: string; media_urls?: string[]; qisqa?: string; takliflar?: { matn: string; buyruq: string }[] };

// Tasdiq xabarida: Instagram caption va Telegram matni alohida
function ikkiMatn(n: Natija) {
  const qism: string[] = [];
  if (n.caption && !String(n.matn ?? "").includes(n.caption.slice(0, 40))) qism.push(`📸 <b>Instagram caption:</b>\n${esc(n.caption)}`);
  if (n.tg_matn) qism.push(`📢 <b>Telegram matni:</b>\n${esc(n.tg_matn)}`);
  if (n.tg_matn || n.caption) qism.push(`<i>✏️ bosib «ig: yangi caption» yoki «tg: yangi matn» yozsangiz — darhol almashtiraman.</i>`);
  return qism.length ? "\n\n" + qism.join("\n\n") : "";
}
// Botga uzun matn yuborilmaydi: 3 qatorlik xulosa (agent bergan «qisqa» yoki matndan avtomatik)
function qisqaAjrat(n: Natija): string {
  const tozala = (x: string) => x.replace(/^[\s•\-–*\d.)]+/, "").replace(/\*\*/g, "").trim();
  if (n.qisqa?.trim()) return n.qisqa.trim().split("\n").map(tozala).filter(Boolean).slice(0, 4).map((x) => x.slice(0, 110)).join("\n");
  const qatorlar = String(n.matn ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const i = qatorlar.findIndex((x) => /^(xulosa|qisqacha|asosiy)/i.test(x.replace(/[^\p{L}]/gu, "")));
  const tanlov = (i >= 0 ? qatorlar.slice(i + 1) : qatorlar).filter((x) => !/^[A-ZʻʼʻO‘G‘ \d]{6,}$/.test(x)).slice(0, 3);
  return tanlov.map(tozala).map((x) => (x.length > 110 ? x.slice(0, 107) + "…" : x)).join("\n");
}
function taklifTugmalari(id: number, n: Natija) {
  return (n.takliflar ?? []).slice(0, 3).map((t, i) => [{ text: `▶️ ${String(t.matn).slice(0, 40)}`, callback_data: `ag:tk:${id}:${i}` }]);
}
export async function apiNatija(id: number, n: Natija) {
  // Murojaat havolalari: dispetcher Zernio orqali joylasa ham caption'da bo'lsin
  if (n.caption) n.caption = igHavola(n.caption);
  if (n.tg_matn) n.tg_matn = tgHavola(n.tg_matn);
  const v = (await q(`select id, buyruq, izohlar, tur from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) throw new Error("vazifa topilmadi");
  if (v.tur === "hisobot" || v.tur === "tahlil") {
    // Hisobot va tahlil tasdiq talab qilmaydi
    await q(`update agent_vazifalar set qadamlar = qadamlar || jsonb_build_array(jsonb_build_object('matn', reja->>joriy, 'vaqt', now())),
                    joriy = jsonb_array_length(reja), holat = 'bajarildi', natija = $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify(n)]);
    await holatXabariniYangila(id, "tayyor");
    const bosh = v.tur === "hisobot" ? "📊 <b>Akkaunt hisoboti</b>" : `🔎 <b>Tahlil #${id}</b> · <i>${esc(String(v.buyruq).slice(0, 80))}</i>`;
    const q3 = qisqaAjrat(n);
    const kb = [...taklifTugmalari(id, n), [{ text: "📄 To‘liq hisobot — ilovada", web_app: { url: `${ILOVA_URL}#agent` } }]];
    const m = await yubor(egasi(), `${bosh}\n\n${esc(q3)}${n.takliflar?.length ? "\n\n<i>Tugmani bossangiz — agent shu ishni boshlaydi.</i>" : ""}`, kb);
    await q(`update agent_vazifalar set tg_msg = $2 where id = $1`, [id, m.message_id]);
    await panelYangila();
    return { tg_msg: m.message_id };
  }
  await q(`update agent_vazifalar set qadamlar = qadamlar || jsonb_build_array(jsonb_build_object('matn', reja->>joriy, 'vaqt', now())),
                  joriy = jsonb_array_length(reja) where id = $1`, [id]);
  await holatXabariniYangila(id, "tayyor");
  const sarlavha = `🤖 <b>#${id} tayyor</b> · <i>${esc(String(v.buyruq).slice(0, 80))}</i>`;
  const tana = esc(n.qisqa ? qisqaAjrat(n) : String(n.matn ?? "").length > 600 ? qisqaAjrat(n) + "\n<i>…to‘liq matn — ilovada</i>" : String(n.matn ?? "")) + ikkiMatn(n);
  const izoh = n.izoh ? `\n\n💬 <i>${esc(n.izoh)}</i>` : "";
  const kb = tasdiqTugmalari(id, Boolean(n.media_url || n.media_urls?.length));
  let msgId: number;
  if (n.media_urls && n.media_urls.length > 1) {
    // Karusel: avval rasmlar albomi, keyin matn + tugmalar
    await tg("sendMediaGroup", { chat_id: egasi(), media: n.media_urls.slice(0, 10).map((u, i) => ({ type: "photo", media: u, ...(i === 0 ? { caption: sarlavha, parse_mode: "HTML" } : {}) })) }).catch((e) => console.error("album", e));
    msgId = (await yubor(egasi(), `${sarlavha}\n\n${tana.slice(0, 3800)}${izoh}`, kb)).message_id;
  } else if (n.media_url) {
    const usul = n.media_tur === "video" ? "sendVideo" : n.media_tur === "fayl" ? "sendDocument" : "sendPhoto";
    const maydon = n.media_tur === "video" ? "video" : n.media_tur === "fayl" ? "document" : "photo";
    const toliqMatn = `${sarlavha}\n\n${tana}${izoh}`;
    if (toliqMatn.length <= 1000) {
      msgId = (await tg(usul, { chat_id: egasi(), [maydon]: n.media_url, caption: toliqMatn, parse_mode: "HTML", reply_markup: { inline_keyboard: kb } })).message_id;
    } else {
      await tg(usul, { chat_id: egasi(), [maydon]: n.media_url, caption: sarlavha, parse_mode: "HTML" });
      msgId = (await yubor(egasi(), `${tana.slice(0, 3800)}${izoh}`, kb)).message_id;
    }
  } else {
    msgId = (await yubor(egasi(), `${sarlavha}\n\n${tana.slice(0, 3800)}${izoh}`, kb)).message_id;
  }
  await q(`update agent_vazifalar set holat = 'tasdiq', natija = $2::jsonb, tg_msg = $3, updated_at = now() where id = $1`, [id, JSON.stringify(n), msgId]);
  await panelYangila();
  return { tg_msg: msgId };
}

export async function apiHolat(id: number, holat: string, izoh?: string, havola?: string, jim?: boolean) {
  if (!HOLAT_BELGI[holat]) throw new Error("noto'g'ri holat");
  const link = havola || (izoh?.match(/https?:\/\/\S+/) ?? [])[0] || null;
  const v = (await q(
    `update agent_vazifalar set holat = $2, updated_at = now(),
       natija = case when $3::text is null then natija else coalesce(natija, '{}'::jsonb) || jsonb_build_object('havola', $3::text) end
     where id = $1 returning id, buyruq`, [id, holat, link]))[0];
  if (!v) throw new Error("vazifa topilmadi");
  if (!jim && (izoh || holat === "joylandi" || holat === "xato")) {
    await yubor(egasi(), `${HOLAT_BELGI[holat]} · <b>#${id}</b>\n<i>${esc(String(v.buyruq).slice(0, 80))}</i>${izoh ? `\n\n${esc(izoh)}` : ""}`);
  }
  await panelYangila();
  return { ok: true };
}

export async function apiYangi(b: { loyiha?: string; tur?: string; buyruq: string; ota_id?: number; taxmin_daq?: number }) {
  const id = await vazifaYarat(b.loyiha ?? "productcrm", b.tur ?? "kontent", b.buyruq, b.ota_id, b.taxmin_daq);
  await panelYangila();
  return { id };
}

export async function apiXabar(matn: string) {
  await yubor(egasi(), `🤖 ${esc(matn).slice(0, 3900)}`);
  return { ok: true };
}

