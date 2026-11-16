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
      "Claude keyingi tekshiruvda oladi va natijani shu yerga tasdiqlash tugmalari bilan yuboradi.",
    ].join("\n"),
    [[{ text: "📋 Navbat", callback_data: "ag:ls" }]],
    replyTo,
  );
}

export async function navbatXabari(): Promise<{ text: string; kb: Klaviatura }> {
  await jadvalTayyorla();
  const rows = await q(
    `select id, loyiha, buyruq, holat from agent_vazifalar
     order by (holat in ('joylandi','rad')) , id desc limit 12`,
  );
  if (!rows.length) return { text: "🤖 <b>Agent navbati bo'sh.</b>\nYangi vazifa: <code>/kontent Reels: ...</code>", kb: [] };
  const t = ["🤖 <b>Agent navbati</b>", ""];
  for (const r of rows) t.push(`<b>#${r.id}</b> ${HOLAT_BELGI[r.holat] ?? r.holat} · ${esc(String(r.buyruq).slice(0, 60))}`);
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

export async function apiOl(id: number) {
  const r = (await q(
    `update agent_vazifalar set holat = 'ishlanmoqda', urinish = urinish + 1, updated_at = now()
     where id = $1 and holat = 'navbatda' returning id`,
    [id],
  ))[0];
  return Boolean(r);
}

type Natija = { matn: string; media_url?: string; media_tur?: "rasm" | "video" | "fayl"; izoh?: string };

export async function apiNatija(id: number, n: Natija) {
  const v = (await q(`select id, buyruq, izohlar from agent_vazifalar where id = $1`, [id]))[0];
  if (!v) throw new Error("vazifa topilmadi");
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

