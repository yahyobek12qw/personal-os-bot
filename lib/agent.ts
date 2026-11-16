// Kontent agenti: Telegram navbati + rejali Claude.
// Oqim: /kontent → navbatda → (Claude oladi) ishlanmoqda → natija → tasdiq
//   ✅ Ha → tasdiqlandi → (Claude joylaydi) joylandi
//   ✏️ O'zgartir → izoh qo'shiladi → navbatda (qayta ishlanadi)
//   ❌ Yo'q → rad

import { q } from "./db";
import { tg, yubor, javob, esc, type Klaviatura } from "./telegram";

export const HOLAT_BELGI: Record<string, string> = {
  navbatda: "⏳ Navbatda",
  ishlanmoqda: "⚙️ Ishlanmoqda",
  tasdiq: "👀 Tasdiq kutmoqda",
  tasdiqlandi: "✅ Tasdiqlandi, joylanadi",
  joylandi: "🚀 Joylandi",
  rad: "❌ Rad etildi",
  xato: "⚠️ Xato",
};

const LOYIHALAR: Record<string, string> = { productcrm: "product CRM", eduflow: "EduFlow" };

// Rejali Claude ishga tushadigan vaqtlar (Toshkent). Rejali vazifa jadvali bilan bir xil bo'lishi shart.
export const JADVAL = ["07:37", "09:37", "11:37", "13:37", "15:37", "17:37", "22:37"];
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
    add column if not exists holat_msg int`);
  tayyor = true;
}

// "/kontent eduflow: ..." yoki "/kontent ..." (standart: product CRM)
export function buyruqniAjrat(arg: string): { loyiha: string; buyruq: string } {
  const m = arg.match(/^(productcrm|crm|eduflow|edu)\s*[:\-]\s*(.+)$/is);
  if (!m) return { loyiha: "productcrm", buyruq: arg.trim() };
  const l = m[1].toLowerCase();
  return { loyiha: l.startsWith("edu") ? "eduflow" : "productcrm", buyruq: m[2].trim() };
}

export async function navbatgaQosh(arg: string) {
  await jadvalTayyorla();
  const { loyiha, buyruq } = buyruqniAjrat(arg);
  const r = (await q(`insert into agent_vazifalar (loyiha, buyruq) values ($1, $2) returning id`, [loyiha, buyruq]))[0];
  return { id: r.id as number, loyiha, buyruq };
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

export async function navbatXabari(): Promise<{ text: string; kb: Klaviatura }> {
  await jadvalTayyorla();
  const rows = await q(
    `select id, loyiha, buyruq, holat, qadamlar, taxmin_daq,
            extract(epoch from (now() - boshlangan))::int / 60 otdi
     from agent_vazifalar
     order by (holat in ('joylandi','rad')) , id desc limit 12`,
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

const tasdiqTugmalari = (id: number): Klaviatura => [
  [
    { text: "✅ Ha, joylansin", callback_data: `ag:ha:${id}` },
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

  if (amal === "ls") {
    const x = await navbatXabari();
    await javob(cq.id);
    await yubor(chatId, x.text, x.kb);
    return true;
  }

  const id = Number(idS);
  const v = (await q(`select id, holat, buyruq from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) {
    await javob(cq.id, "Vazifa topilmadi", true);
    return true;
  }
  if (v.holat !== "tasdiq") {
    await javob(cq.id, `Holati: ${HOLAT_BELGI[v.holat] ?? v.holat}`, true);
    return true;
  }
  const bosh = `<b>#${id}</b> · <i>${esc(String(v.buyruq).slice(0, 80))}</i>`;
  if (amal === "ha") {
    await q(`update agent_vazifalar set holat = 'tasdiqlandi', updated_at = now() where id = $1`, [id]);
    await javob(cq.id, "✅ Tasdiqlandi");
    await tugmalarniAlmashtir(chatId, msgId, `${bosh}\n✅ Tasdiqlandi — Claude keyingi tekshiruvda joylaydi.`);
  } else if (amal === "yoq") {
    await q(`update agent_vazifalar set holat = 'rad', updated_at = now() where id = $1`, [id]);
    await javob(cq.id, "❌ Rad etildi");
    await tugmalarniAlmashtir(chatId, msgId, `${bosh}\n❌ Rad etildi.`);
  } else if (amal === "oz") {
    await javob(cq.id);
    await tg("sendMessage", {
      chat_id: chatId,
      text: IZOH_MATNI(id),
      parse_mode: "HTML",
      reply_markup: { force_reply: true, input_field_placeholder: "Masalan: hook qisqaroq, oxirida demo taklifi" },
    });
  }
  return true;
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
    await jadvalTayyorla();
    const id = Number(iz[1]);
    const v = (await q(
      `update agent_vazifalar
         set izohlar = izohlar || jsonb_build_array(jsonb_build_object('matn', $2::text, 'vaqt', now())),
             holat = 'navbatda', updated_at = now()
       where id = $1 and holat in ('tasdiq','navbatda') returning id`,
      [id, matn],
    ))[0];
    await yubor(
      m.chat.id,
      v ? `✏️ <b>#${id}</b> izoh bilan navbatga qaytdi. Claude qayta ishlaydi.` : `#${id} hozir o'zgartirib bo'lmaydi (holati o'zgargan).`,
      undefined,
      m.message_id,
    );
    return true;
  }
  return false;
}

// ======================= API (Claude chaqiradi) =======================

const egasi = () => String(process.env.ALLOWED_CHAT_ID);

export async function apiNavbat() {
  await jadvalTayyorla();
  // 2 soatdan ortiq "ishlanmoqda"da qolganlarini qayta navbatga qaytaramiz
  await q(`update agent_vazifalar set holat = 'navbatda', updated_at = now()
           where holat = 'ishlanmoqda' and updated_at < now() - interval '2 hours'`);
  return q(
    `select id, loyiha, tur, buyruq, holat, natija, izohlar, urinish, to_char(created_at at time zone 'Asia/Tashkent','YYYY-MM-DD HH24:MI') yaratilgan
     from agent_vazifalar where holat in ('navbatda','tasdiqlandi') order by id`,
  );
}

// Vazifaning jonli holat xabari: qadamlar, o'tgan va taxminiy vaqt
function holatMatni(v: any, yakun?: string) {
  const qadamlar = (v.qadamlar ?? []) as { matn: string; vaqt: string }[];
  const otdi = v.boshlangan ? Math.max(0, Math.round((Date.now() - Date.parse(v.boshlangan)) / 60000)) : 0;
  const t = [
    `${yakun ? "✅" : "⚙️"} <b>#${v.id} ${yakun ?? "ishlanmoqda"}</b> · <i>${esc(String(v.buyruq).slice(0, 70))}</i>`,
    v.boshlangan ? `🕐 Boshlandi ${hhmm(Date.parse(v.boshlangan))} · ${davomiylik(otdi)} o'tdi${!yakun && v.taxmin_daq ? ` · taxminan ${davomiylik(Math.max(1, v.taxmin_daq - otdi))} qoldi` : ""}` : "",
    "",
  ];
  qadamlar.forEach((x, i) => {
    const oxirgi = i === qadamlar.length - 1 && !yakun;
    t.push(`${oxirgi ? "⏳" : "✔️"} ${esc(x.matn)} <i>${hhmm(Date.parse(x.vaqt))}</i>`);
  });
  return t.filter((x, i) => x || i === 2).join("\n");
}

async function holatXabariniYangila(id: number, yakun?: string) {
  const v = (await q(`select id, buyruq, qadamlar, taxmin_daq, boshlangan, holat_msg from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) return;
  const text = holatMatni(v, yakun);
  if (v.holat_msg) {
    await tg("editMessageText", { chat_id: egasi(), message_id: v.holat_msg, text, parse_mode: "HTML" }).catch(() => {});
  } else {
    const m = await yubor(egasi(), text);
    await q(`update agent_vazifalar set holat_msg = $2 where id = $1`, [id, m.message_id]);
  }
}

export async function apiOl(id: number, taxminDaq?: number) {
  const r = (await q(
    `update agent_vazifalar
       set holat = 'ishlanmoqda', urinish = urinish + 1, updated_at = now(), boshlangan = now(),
           taxmin_daq = coalesce($2, taxmin_daq), holat_msg = null,
           qadamlar = jsonb_build_array(jsonb_build_object('matn', 'Vazifa olindi', 'vaqt', now()))
     where id = $1 and holat = 'navbatda' returning id, buyruq`,
    [id, taxminDaq ?? null],
  ))[0];
  if (!r) return false;
  if (!taxminDaq) await q(`update agent_vazifalar set taxmin_daq = $2 where id = $1 and taxmin_daq is null`, [id, taxminiyVaqt(r.buyruq)]);
  await holatXabariniYangila(id);
  return true;
}

// Agent har bir qadamni yuboradi: holat xabari tahrirlanadi
export async function apiJarayon(id: number, bosqich: string, taxminDaq?: number) {
  const r = (await q(
    `update agent_vazifalar
       set qadamlar = qadamlar || jsonb_build_array(jsonb_build_object('matn', $2::text, 'vaqt', now())),
           taxmin_daq = coalesce($3, taxmin_daq), updated_at = now()
     where id = $1 and holat = 'ishlanmoqda' returning id`,
    [id, bosqich.slice(0, 120), taxminDaq ?? null],
  ))[0];
  if (!r) throw new Error("vazifa ishlanmoqda holatida emas");
  await holatXabariniYangila(id);
  return { ok: true };
}

type Natija = { matn: string; media_url?: string; media_tur?: "rasm" | "video" | "fayl"; izoh?: string };

export async function apiNatija(id: number, n: Natija) {
  const v = (await q(`select id, buyruq, izohlar from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) throw new Error("vazifa topilmadi");
  await q(`update agent_vazifalar set qadamlar = qadamlar || jsonb_build_array(jsonb_build_object('matn', 'Natija yuborildi', 'vaqt', now())) where id = $1`, [id]);
  await holatXabariniYangila(id, "tayyor");
  const sarlavha = `🤖 <b>#${id} tayyor</b> · <i>${esc(String(v.buyruq).slice(0, 80))}</i>`;
  const tana = esc(n.matn ?? "");
  const izoh = n.izoh ? `\n\n💬 <i>${esc(n.izoh)}</i>` : "";
  const kb = tasdiqTugmalari(id);
  let msgId: number;
  if (n.media_url) {
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
  return { tg_msg: msgId };
}

export async function apiHolat(id: number, holat: string, izoh?: string) {
  if (!HOLAT_BELGI[holat]) throw new Error("noto'g'ri holat");
  const v = (await q(`update agent_vazifalar set holat = $2, updated_at = now() where id = $1 returning id, buyruq`, [id, holat]))[0];
  if (!v) throw new Error("vazifa topilmadi");
  if (izoh || holat === "joylandi" || holat === "xato") {
    await yubor(egasi(), `${HOLAT_BELGI[holat]} · <b>#${id}</b>\n<i>${esc(String(v.buyruq).slice(0, 80))}</i>${izoh ? `\n\n${esc(izoh)}` : ""}`);
  }
  return { ok: true };
}

export async function apiXabar(matn: string) {
  await yubor(egasi(), `🤖 ${esc(matn).slice(0, 3900)}`);
  return { ok: true };
}

