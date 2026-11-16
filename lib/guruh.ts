// Kanalning muhokama guruhi (izohlar + chat): bot FAQ'ga javob beradi, qolganini egasiga o'tkazadi.
// Qoidalar: Project'dagi claude/instagram-telegram-tizim.md (4-bo'lim). Bot hech qachon taxmin qilib javob bermaydi.
import { q } from "./db";
import { tg, yubor, esc, javob, type Klaviatura } from "./telegram";
import { kanal } from "./agent2";

const egasi = () => String(process.env.ALLOWED_CHAT_ID);
let tayyor = false;
async function jadval() {
  if (tayyor) return;
  await q(`create table if not exists guruh_savollar (
    id serial primary key, chat_id bigint not null, msg_id int not null, user_id bigint, muallif text, matn text,
    mavzu text, holat text not null default 'yangi', egasi_msg int, created_at timestamptz not null default now())`);
  await q(`create table if not exists agent_sozlama (kalit text primary key, qiymat jsonb)`);
  tayyor = true;
}

// ---------- FAQ mavzulari (kalit so'zlar) ----------
export const MAVZULAR: Record<string, { nom: string; soz: RegExp }> = {
  nima: { nom: "Bu nima / qanday ishlaydi", soz: /(nima\s*bu|bu\s*nima|qanday\s*ishlaydi|nima\s*qiladi|что\s*это|как\s*работает)/i },
  narx: { nom: "Narx", soz: /(narx|нарх|qancha\s*turadi|necha\s*pul|qanchadan|сколько\s*стоит|цена|стоимость|price|tarif)/i },
  demo: { nom: "Demo / sinab ko'rish", soz: /(demo|демо|sinab|sinov|test\b|ko[‘'`]?rsat|попробовать)/i },
  tolov: { nom: "To'lov", soz: /(to[‘'`]?lov|tolov|karta|click|payme|оплат)/i },
  admin: { nom: "Admin bilan aloqa", soz: /(admin|aloqa|bog[‘'`]?lan|telefon|nomer|номер|связ|контакт)/i },
  shablon: { nom: "Bepul shablon", soz: /(shablon|шаблон|excel|bepul\s*fayl)/i },
  telefon: { nom: "Telefonda / internet", soz: /(android|iphone|telefonda|internet|offline|офлайн)/i },
  xavfsiz: { nom: "Xavfsizlik", soz: /(xavfsiz|maxfiy|ma[‘'`]?lumotlarim|безопас)/i },
};
const ESKALATSIYA = /(chegirma|skidka|скидк|shartnoma|договор|1c|1с|integrats|интеграц|smena|filial|shikoyat|жалоб|xato\s*chiq|ishlamayapti|hamkor|партн)/i;
const SPAM = /(t\.me\/(?!product_crm)|telegram\.me\/|https?:\/\/(?!productcrm)|kripto|crypto|binance|usdt|ish\s*taklif|daromad\s*kafolat|заработ)/i;

export async function faqOl(): Promise<Record<string, string>> {
  await jadval();
  return (await q(`select qiymat from agent_sozlama where kalit = 'faq'`))[0]?.qiymat ?? {};
}
async function faqYoz(f: Record<string, string>) {
  await q(`insert into agent_sozlama (kalit, qiymat) values ('faq', $1::jsonb) on conflict (kalit) do update set qiymat = excluded.qiymat`, [JSON.stringify(f)]);
}

// ---------- Guruh: kanalning bog'langan muhokama guruhi ----------
export async function guruh(): Promise<{ id: number; nom: string; username?: string | null } | null> {
  await jadval();
  const s = (await q(`select qiymat from agent_sozlama where kalit = 'tg_guruh'`))[0]?.qiymat;
  if (s?.id) return s;
  const k = await kanal();
  if (!k) return null;
  const c = await tg("getChat", { chat_id: k.id }).catch(() => null);
  if (!c?.linked_chat_id) return null;
  const g = await tg("getChat", { chat_id: c.linked_chat_id }).catch(() => null);
  const qiymat = { id: c.linked_chat_id, nom: g?.title ?? "Guruh", username: g?.username ?? null };
  await q(`insert into agent_sozlama (kalit, qiymat) values ('tg_guruh', $1::jsonb) on conflict (kalit) do update set qiymat = excluded.qiymat`, [JSON.stringify(qiymat)]);
  return qiymat;
}
const botId = () => Number(String(process.env.TELEGRAM_BOT_TOKEN).split(":")[0]);
const xabarHavola = (g: { id: number; username?: string | null }, msg: number) =>
  g.username ? `https://t.me/${g.username}/${msg}` : `https://t.me/c/${String(g.id).replace(/^-100/, "")}/${msg}`;

// ---------- Guruhdagi har bir xabar ----------
export async function guruhXabari(m: any): Promise<boolean> {
  const g = await guruh();
  if (!g || String(m.chat.id) !== String(g.id)) return false;
  if (m.is_automatic_forward || m.sender_chat || m.from?.is_bot) return true; // kanal postining nusxasi yoki bot
  if (String(m.from?.id) === egasi()) return true; // egasi o'zi yozadi
  const matn = String(m.text ?? m.caption ?? "").trim();
  if (!matn) return true;
  const muallif = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || "Foydalanuvchi";
  const user = m.from?.username ? `@${m.from.username}` : "";

  // 1) Spam — o'chiriladi, egasiga xabar
  if (SPAM.test(matn)) {
    const ok = await tg("deleteMessage", { chat_id: g.id, message_id: m.message_id }).then(() => true).catch(() => false);
    await yubor(egasi(), `🧹 <b>Guruhda spam ${ok ? "o'chirildi" : "topildi (o'chirib bo'lmadi — bot admin emasmi?)"}</b>\n👤 ${esc(muallif)} ${esc(user)}\n💬 <i>${esc(matn.slice(0, 300))}</i>`);
    return true;
  }

  // 2) FAQ: aniq mavzu va egasi tasdiqlagan javob bo'lsa — bot javob beradi
  const mavzu = ESKALATSIYA.test(matn) ? null : Object.entries(MAVZULAR).find(([, v]) => v.soz.test(matn))?.[0] ?? null;
  const faq = await faqOl();
  if (mavzu && faq[mavzu]) {
    await tg("sendMessage", { chat_id: g.id, text: faq[mavzu], reply_parameters: { message_id: m.message_id }, link_preview_options: { is_disabled: true } });
    await q(`insert into guruh_savollar (chat_id, msg_id, user_id, muallif, matn, mavzu, holat) values ($1,$2,$3,$4,$5,$6,'bot')`,
      [g.id, m.message_id, m.from?.id ?? null, `${muallif} ${user}`.trim(), matn, mavzu]);
    return true;
  }

  // 3) Savolga o'xshasa (yoki FAQ mavzusi bo'lsa-yu javob hali yo'q bo'lsa) — egasiga
  const savol = Boolean(mavzu) || /\?|qanday|qancha|qachon|qayer|nega|mumkinmi|bormi|bo[‘'`]?ladimi|как|сколько|где|когда|можно/i.test(matn) || ESKALATSIYA.test(matn);
  if (!savol) return true; // oddiy suhbat — bot aralashmaydi
  const r = (await q(`insert into guruh_savollar (chat_id, msg_id, user_id, muallif, matn, mavzu) values ($1,$2,$3,$4,$5,$6) returning id`,
    [g.id, m.message_id, m.from?.id ?? null, `${muallif} ${user}`.trim(), matn, mavzu]))[0];
  // Guruhda bitta qisqa javob (bir odamga 30 daqiqada bir marta)
  const yaqin = (await q(`select count(*)::int n from guruh_savollar where user_id = $1 and holat in ('yangi','javob') and id <> $2 and created_at > now() - interval '30 minutes'`, [m.from?.id ?? 0, r.id]))[0].n;
  if (!yaqin) await tg("sendMessage", { chat_id: g.id, text: "Yaxshi savol! Uni adminga yubordim, tez orada shu yerda javob beradi 🙌", reply_parameters: { message_id: m.message_id } }).catch(() => {});
  const kb: Klaviatura = [[{ text: "✍️ Javob yozish", callback_data: `gj:${r.id}` }, { text: "✅ Javob berdim", callback_data: `gk:${r.id}` }], [{ text: "🔗 Xabarga o‘tish", url: xabarHavola(g, m.message_id) }]];
  const em = await yubor(egasi(), [
    `❓ <b>Guruhda savol</b> · #g${r.id}${mavzu ? ` · ${MAVZULAR[mavzu].nom}` : ""}`,
    `👤 ${esc(muallif)} ${esc(user)}`,
    `💬 <i>${esc(matn.slice(0, 1200))}</i>`,
    mavzu && !faq[mavzu] ? `\n💡 Bu FAQ mavzusi, lekin javob hali kiritilmagan: <code>/faq ${mavzu}: javob matni</code> — keyingi safar bot o‘zi javob beradi.` : "",
  ].filter(Boolean).join("\n"), kb);
  await q(`update guruh_savollar set egasi_msg = $2 where id = $1`, [r.id, em.message_id]);
  return true;
}

// ---------- Egasining tugmalari va javobi ----------
export const JAVOB_MATNI = (id: number) => `↩️ #g${id} — guruhga javobingizni yozing:`;
export async function guruhTugmasi(cq: any): Promise<boolean> {
  const [cmd, a] = String(cq.data ?? "").split(":");
  if (cmd !== "gj" && cmd !== "gk") return false;
  const id = Number(a);
  if (cmd === "gk") {
    await q(`update guruh_savollar set holat = 'javob' where id = $1`, [id]);
    await tg("editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await javob(cq.id, "✅ Belgilandi");
    return true;
  }
  await javob(cq.id);
  await tg("sendMessage", { chat_id: cq.message.chat.id, text: JAVOB_MATNI(id), reply_markup: { force_reply: true, input_field_placeholder: "Javob matni…" } });
  return true;
}
export async function guruhJavobi(m: any): Promise<boolean> {
  const rt = String(m.reply_to_message?.text ?? "");
  const t = rt.match(/^↩️ #g(\d+) — guruhga javobingizni yozing:/);
  if (!t) return false;
  const matn = String(m.text ?? "").trim();
  if (!matn) return true;
  const s = (await q(`select * from guruh_savollar where id = $1`, [Number(t[1])]))[0];
  if (!s) { await yubor(m.chat.id, "Savol topilmadi."); return true; }
  const r = await tg("sendMessage", { chat_id: s.chat_id, text: matn, reply_parameters: { message_id: s.msg_id, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true } });
  await q(`update guruh_savollar set holat = 'javob' where id = $1`, [s.id]);
  if (s.egasi_msg) await tg("editMessageReplyMarkup", { chat_id: egasi(), message_id: s.egasi_msg, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  const g = await guruh();
  await yubor(m.chat.id, `✅ Guruhga yuborildi${g ? ` · <a href="${xabarHavola(g, r.message_id)}">ko‘rish</a>` : ""}`, undefined, m.message_id);
  return true;
}

// ---------- Javobsiz savollar eslatmasi (2 soat) ----------
export async function savolEslatma() {
  await jadval();
  const rows = await q(`update guruh_savollar set holat = 'eslatildi' where holat = 'yangi' and created_at < now() - interval '2 hours' returning id, muallif, matn`);
  if (rows.length) await yubor(egasi(), `⏰ <b>Guruhda ${rows.length} ta savol 2 soatdan beri javobsiz</b>\n${rows.slice(0, 5).map((r: any) => `• #g${r.id} ${esc(r.muallif)}: <i>${esc(String(r.matn).slice(0, 80))}</i>`).join("\n")}`);
}

// ---------- Buyruqlar: /guruh va /faq ----------
export async function guruhBuyrugi(chatId: number | string) {
  let g = await guruh();
  if (g) { // nom va username'ni yangilash (bot qo'shilgandan keyin)
    const c = await tg("getChat", { chat_id: g.id }).catch(() => null);
    if (c) { g = { id: g.id, nom: c.title ?? g.nom, username: c.username ?? null };
      await q(`update agent_sozlama set qiymat = $1::jsonb where kalit = 'tg_guruh'`, [JSON.stringify(g)]); }
  }
  if (!g) return yubor(chatId, "👥 <b>Guruh topilmadi.</b>\nKanal sozlamalari → Discussion (Muhokama) → guruhni bog‘lang, botni guruhga <b>admin</b> qiling, keyin /guruh ni qayta yozing.");
  const a = await tg("getChatMember", { chat_id: g.id, user_id: botId() }).catch(() => null);
  const admin = a?.status === "administrator";
  const faq = await faqOl();
  const n = (await q(`select count(*) filter (where holat in ('yangi','eslatildi'))::int javobsiz, count(*) filter (where holat = 'bot')::int bot from guruh_savollar where created_at > now() - interval '7 days'`))[0];
  return yubor(chatId, [
    `👥 <b>Guruh: ${esc(g.nom)}</b>${g.username ? ` (@${esc(g.username)})` : ""}`,
    `Bot admin: ${admin ? "✅" : "❌ — admin qiling (xabarlarni o‘qish va spamni o‘chirish uchun)"}`,
    `FAQ javoblari: ${Object.keys(faq).length}/${Object.keys(MAVZULAR).length} · 7 kunda bot javob berdi: ${n.bot} · javobsiz: ${n.javobsiz}`,
    "",
    "Bot: tasdiqlangan FAQ’ga javob beradi, qolgan savollarni sizga yuboradi, spam havolalarni o‘chiradi. Oddiy suhbatga aralashmaydi.",
    "FAQ: /faq",
  ].join("\n"));
}
export async function faqBuyrugi(chatId: number | string, arg: string) {
  const faq = await faqOl();
  const m = arg.match(/^(\w+)\s*:\s*([\s\S]+)$/);
  if (m && MAVZULAR[m[1].toLowerCase()]) {
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (v === "-" || v === "o'chir") delete faq[k]; else faq[k] = v;
    await faqYoz(faq);
    return yubor(chatId, v === "-" || v === "o'chir" ? `🗑 <b>${k}</b> javobi o‘chirildi.` : `✅ <b>${MAVZULAR[k].nom}</b> javobi saqlandi. Guruhda shu mavzudagi savolga bot endi o‘zi javob beradi.`);
  }
  return yubor(chatId, [
    "📚 <b>Guruh FAQ</b> — bot faqat shu yerdagi javoblarni ishlatadi, o‘ylab topmaydi.",
    ...Object.entries(MAVZULAR).map(([k, v]) => `${faq[k] ? "✅" : "▫️"} <code>${k}</code> — ${v.nom}${faq[k] ? `\n   <i>${esc(faq[k].slice(0, 120))}</i>` : ""}`),
    "",
    "Qo‘shish: <code>/faq narx: Boshlang‘ich — 99 000 so‘m/oy…</code>",
    "O‘chirish: <code>/faq narx: -</code>",
  ].join("\n"));
}
