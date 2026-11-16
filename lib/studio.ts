// Studiya: kontent ishlab chiqaruvchi studiya. Bitta video = bitta loyiha (cheksiz doska), har bir bosqich = tugun.
// Oqim: ssenariy → ovoz → referenslar (qahramon, joy, uslub) → demo sahnalar → yakuniy video → reliz.
// Kutubxona (qahramonlar, ovozlar, uslublar, joylar) — loyihalar orasida qayta ishlatiladi.
// Agent faqat "navbatda" va "qayta" tugunlarni ishlaydi; tasdiqlash — faqat egasi.

import { q } from "./db";
import { jadvalTayyorla, qaror, panelYangila, keyingiTekshiruv, bugunTosh } from "./agent";
import { tg, yubor, esc } from "./telegram";
import { studioHavola } from "./auth";
import { igHavola, tgHavola } from "./havolalar";
import { arxivgaMedia, type Bolim } from "./arxiv";
import { proksi } from "./media";

const BAZA_URL = "https://personal-os-bot-gold.vercel.app";
// Kutubxona fayllari (ovoz namunasi, qahramon rasmi) Telegram arxivida turadi; o'qishda imzolangan havola beriladi
function fayllarniOch(mazmun: any, toliq = false) {
  const fs: any[] = Array.isArray(mazmun?.fayllar) ? mazmun.fayllar : [];
  if (!fs.length) return mazmun;
  return { ...mazmun, fayllar: fs.map((x) => (x?.f ? { ...x, url: (toliq ? BAZA_URL : "") + proksi(String(x.f)) } : x)) };
}

export const HOLATLAR = ["kutmoqda", "navbatda", "ishlamoqda", "tekshiruvda", "tasdiqlandi", "qayta", "eskirgan", "xato"] as const;
type Holat = (typeof HOLATLAR)[number];
const AGENT_HOLATLARI: Holat[] = ["ishlamoqda", "tekshiruvda", "xato"];
const TURLAR = ["ssenariy", "ovoz", "referens", "sahna", "video", "reliz", "izoh"];
const egasi = () => String(process.env.ALLOWED_CHAT_ID);

let tayyor = false;
export async function studioTayyorla() {
  if (tayyor) return;
  await jadvalTayyorla();
  await q(`create table if not exists studio_loyiha (
    id serial primary key,
    nom text not null,
    mavzu text not null default '',
    loyiha text not null default 'productcrm',
    holat text not null default 'faol',
    vazifa_id int,
    jurnal jsonb not null default '[]'::jsonb,
    buyruqlar jsonb not null default '[]'::jsonb,
    tg_msg int,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await q(`create table if not exists studio_tugun (
    id serial primary key,
    loyiha_id int not null references studio_loyiha(id) on delete cascade,
    kalit text not null,
    tur text not null,
    nom text not null,
    holat text not null default 'kutmoqda',
    x int not null default 0,
    y int not null default 0,
    w int not null default 260,
    ota jsonb not null default '[]'::jsonb,
    mazmun jsonb not null default '{}'::jsonb,
    versiyalar jsonb not null default '[]'::jsonb,
    izohlar jsonb not null default '[]'::jsonb,
    foiz int,
    bosqich text,
    tartib int not null default 0,
    updated_at timestamptz not null default now(),
    unique (loyiha_id, kalit)
  )`);
  await q(`create index if not exists st_loyiha on studio_tugun (loyiha_id)`);
  await q(`alter table studio_loyiha
    add column if not exists reklama text,
    add column if not exists qahramon_id int,
    add column if not exists format text`);
  await q(`create table if not exists studio_kutubxona (
    id serial primary key,
    tur text not null,
    nom text not null,
    mazmun jsonb not null default '{}'::jsonb,
    rasm text,
    holat text not null default 'faol',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  tayyor = true;
}

// ---------- Shablon: yangi loyiha tugunlari ----------
const SHABLON = [
  { kalit: "ssenariy", tur: "ssenariy", nom: "Ssenariy", ota: [], x: 0, y: 40, w: 280, holat: "navbatda" },
  { kalit: "ovoz", tur: "ovoz", nom: "Ovoz", ota: ["ssenariy"], x: 360, y: 40, w: 260 },
  { kalit: "qahramon", tur: "referens", nom: "Qahramon", ota: ["ovoz"], x: 700, y: 0, w: 240 },
  { kalit: "joy", tur: "referens", nom: "Joy va sahna", ota: ["ovoz"], x: 960, y: 0, w: 240 },
  { kalit: "uslub", tur: "referens", nom: "Umumiy uslub", ota: ["ovoz"], x: 700, y: 330, w: 500 },
  { kalit: "video", tur: "video", nom: "Yakuniy video", ota: ["sahna-*"], x: 1260, y: 660, w: 260 },
  { kalit: "reliz", tur: "reliz", nom: "Reliz", ota: ["video"], x: 1580, y: 660, w: 280 },
];
const SAHNA_OTA = ["ovoz", "qahramon", "joy", "uslub"];
const SAHNA_Y = 620;

const jurnalQator = (matn: string, kim: "agent" | "siz" | "tizim" = "tizim") => ({ matn: String(matn).slice(0, 240), kim, vaqt: new Date().toISOString() });
async function jurnalga(loyihaId: number, matn: string, kim: "agent" | "siz" | "tizim" = "tizim") {
  await q(
    `update studio_loyiha set jurnal = (jsonb_build_array($2::jsonb) || jurnal) - 80, updated_at = now() where id = $1`,
    [loyihaId, JSON.stringify(jurnalQator(matn, kim))],
  );
}

export const REKLAMALAR: Record<string, string> = { eduflow: "EduFlow", productcrm: "product CRM", kurs: "Kontent kurslari" };
export const FORMATLAR: Record<string, string> = { hikoya: "Hikoya", komediya: "Kulgili sahna", muammo: "Ijtimoiy muammo", seriya: "Seriya qismi", sahna_ortidan: "Sahna ortidan" };
export type YangiOpts = { reklama?: string; qahramon?: number | null; format?: string; variantlar?: number };

export async function yangiLoyiha(mavzu: string, nom?: string, opts: YangiOpts = {}) {
  await studioTayyorla();
  const m = String(mavzu || "").trim();
  if (m.length < 3) throw new Error("Mavzuni yozing");
  const n = (String(nom || "").trim() || m).slice(0, 80);
  const reklama = opts.reklama && REKLAMALAR[opts.reklama] ? opts.reklama : null;
  const format = opts.format && FORMATLAR[opts.format] ? opts.format : null;
  const qahramon = opts.qahramon ? Number(opts.qahramon) || null : null;
  const l = (await q(`insert into studio_loyiha (nom, mavzu, loyiha, jurnal, reklama, format, qahramon_id) values ($1, $2, 'studiya', $3::jsonb, $4, $5, $6) returning id`,
    [n, m.slice(0, 2000), JSON.stringify([jurnalQator("Loyiha ochildi", "siz")]), reklama, format, qahramon]))[0];
  const soni = Math.max(1, Math.min(6, Number(opts.variantlar) || 3));
  for (const [i, t] of SHABLON.entries()) {
    const mazmun = t.kalit === "ssenariy" && soni > 1 ? { _soni: soni } : {};
    await q(`insert into studio_tugun (loyiha_id, kalit, tur, nom, holat, x, y, w, ota, tartib, mazmun) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)`,
      [l.id, t.kalit, t.tur, t.nom, t.holat ?? "kutmoqda", t.x, t.y, t.w, JSON.stringify(t.ota), i, JSON.stringify(mazmun)]);
  }
  await agentgaNavbat(l.id);
  return { id: l.id as number };
}

// ---------- Bog'liqliklar ----------
type Tugun = { id: number; kalit: string; tur: string; holat: Holat; ota: string[]; nom: string; mazmun: any; izohlar: any[]; versiyalar: any[]; x: number; y: number; w: number };
const otaMos = (ota: string, kalit: string) => (ota.endsWith("*") ? kalit.startsWith(ota.slice(0, -1)) : ota === kalit);
const otalari = (t: Tugun, hammasi: Tugun[]) => hammasi.filter((o) => o.id !== t.id && t.ota.some((k) => otaMos(k, o.kalit)));
function otaTayyor(t: Tugun, hammasi: Tugun[]) {
  for (const k of t.ota) {
    const mos = hammasi.filter((o) => o.id !== t.id && otaMos(k, o.kalit));
    if (!mos.length || mos.some((o) => o.holat !== "tasdiqlandi")) return false;
  }
  return true;
}
// Pastdagi (bog'liq) tugunlar, rekursiv
function avlodlar(t: Tugun, hammasi: Tugun[]): Tugun[] {
  const natija = new Map<number, Tugun>();
  const navbat = [t];
  while (navbat.length) {
    const joriy = navbat.shift()!;
    for (const b of hammasi) {
      if (natija.has(b.id) || b.id === t.id) continue;
      if (b.ota.some((k) => otaMos(k, joriy.kalit))) { natija.set(b.id, b); navbat.push(b); }
    }
  }
  return [...natija.values()];
}

async function tugunlar(loyihaId: number): Promise<Tugun[]> {
  return q(`select id, kalit, tur, holat, ota, nom, mazmun, izohlar, versiyalar, x, y, w from studio_tugun where loyiha_id = $1 order by tartib, id`, [loyihaId]);
}

// Bog'liqliklari tasdiqlangan "kutmoqda" tugunlarni ochadi; agentga ish bo'lsa navbatga qo'yadi
async function ochish(loyihaId: number) {
  const h = await tugunlar(loyihaId);
  const ochiladi = h.filter((t) => t.holat === "kutmoqda" && t.tur !== "izoh" && otaTayyor(t, h));
  for (const t of ochiladi) await q(`update studio_tugun set holat = 'navbatda', updated_at = now() where id = $1 and holat = 'kutmoqda'`, [t.id]);
  if (ochiladi.length) await jurnalga(loyihaId, `Ochildi: ${ochiladi.map((t) => t.nom).join(", ")}`);
  await agentgaNavbat(loyihaId);
}

// Agent uchun ish bo'lsa — agent_vazifalar'da bitta "studio" vazifasi navbatda turadi
async function agentgaNavbat(loyihaId: number) {
  const ish = (await q(`select count(*)::int n from studio_tugun where loyiha_id = $1 and holat in ('navbatda','qayta')`, [loyihaId]))[0].n
    + (await q(`select jsonb_array_length(buyruqlar) n from studio_loyiha where id = $1`, [loyihaId]))[0].n;
  if (!ish) return;
  const l = (await q(`select id, nom, loyiha, vazifa_id from studio_loyiha where id = $1`, [loyihaId]))[0];
  if (l.vazifa_id) {
    const r = await q(`update agent_vazifalar set holat = 'navbatda', updated_at = now()
                       where id = $1 and holat not in ('navbatda','ishlanmoqda') returning id`, [l.vazifa_id]);
    const bor = (await q(`select id from agent_vazifalar where id = $1`, [l.vazifa_id]))[0];
    if (bor) { if (r.length) await panelYangila(); return; }
  }
  const v = (await q(`insert into agent_vazifalar (loyiha, tur, buyruq, taxmin_daq) values ($1, 'studio', $2, 20) returning id`,
    [l.loyiha, `Studiya #${l.id}: ${String(l.nom).slice(0, 70)}`]))[0];
  await q(`update studio_loyiha set vazifa_id = $2 where id = $1`, [loyihaId, v.id]);
  await panelYangila();
}

// ---------- Egasiga qisqa xabar: tekshiruv kutayotgan tugunlar ----------
async function egasigaXabar(loyihaId: number) {
  try {
    const l = (await q(`select id, nom, tg_msg from studio_loyiha where id = $1`, [loyihaId]))[0];
    const kut = await q(`select nom from studio_tugun where loyiha_id = $1 and holat in ('tekshiruvda','eskirgan') order by tartib, id`, [loyihaId]);
    const kb = [[{ text: "🎛 Studiyada ochish", url: studioHavola(loyihaId) }]];
    if (!kut.length) {
      if (l.tg_msg) {
        await tg("editMessageText", { chat_id: egasi(), message_id: l.tg_msg, text: `✅ <b>Studiya #${l.id}</b> · hammasi ko‘rildi`, parse_mode: "HTML", reply_markup: { inline_keyboard: kb } }).catch(() => {});
        await q(`update studio_loyiha set tg_msg = null where id = $1`, [loyihaId]);
      }
      return;
    }
    const matn = `👀 <b>Studiya #${l.id}</b> · ${esc(String(l.nom).slice(0, 60))}\nTekshiruvingiz kerak: ${kut.map((t: any) => esc(t.nom)).join(", ")}`;
    if (l.tg_msg) {
      const ok = await tg("editMessageText", { chat_id: egasi(), message_id: l.tg_msg, text: matn, parse_mode: "HTML", reply_markup: { inline_keyboard: kb } }).then(() => true).catch(() => false);
      if (ok) return;
    }
    const m = await yubor(egasi(), matn, kb);
    await q(`update studio_loyiha set tg_msg = $2 where id = $1`, [loyihaId, m.message_id]);
  } catch (e) {
    console.error("studio xabar", e);
  }
}

// ================= Egasi amallari (doskadan) =================
async function tugunOl(id: number): Promise<Tugun & { loyiha_id: number }> {
  const t = (await q(`select id, loyiha_id, kalit, tur, holat, ota, nom, mazmun, izohlar, versiyalar, x, y, w from studio_tugun where id = $1`, [id]))[0];
  if (!t) throw new Error("Tugun topilmadi");
  return t;
}
const izohQator = (matn: string, tur: string) => JSON.stringify([{ matn: String(matn).slice(0, 1000), tur, vaqt: new Date().toISOString() }]);

export async function tasdiqla(id: number) {
  const t = await tugunOl(id);
  if (!["tekshiruvda", "eskirgan"].includes(t.holat)) throw new Error("Bu tugun tekshiruvda emas");
  if (t.tur === "reliz") throw new Error("Relizni «Joylash» tugmasi bilan tasdiqlang");
  await q(`update studio_tugun set holat = 'tasdiqlandi', foiz = null, bosqich = null, updated_at = now() where id = $1`, [id]);
  await jurnalga(t.loyiha_id, `${t.nom} tasdiqlandi`, "siz");
  await ochish(t.loyiha_id);
  await egasigaXabar(t.loyiha_id);
  return { ok: true };
}

// Izoh bilan qayta (rad = boshidan, boshqa yondashuv). Tasdiqlangan tugun qayta ochilsa — pastdagilar "eskirgan".
export async function qaytaQil(id: number, izoh: string, rad = false) {
  const t = await tugunOl(id);
  const matn = String(izoh || "").trim();
  if (!matn && !rad) throw new Error("Nimani o‘zgartirish kerakligini yozing");
  if (["kutmoqda", "navbatda"].includes(t.holat) && !matn) throw new Error("Bu tugun hali ishlanmagan");
  const izohMatn = rad ? `Rad etildi — boshidan, boshqa yondashuv bilan.${matn ? " " + matn : ""}` : matn;
  const yangiHolat = t.holat === "kutmoqda" ? "kutmoqda" : "qayta";
  await q(`update studio_tugun set holat = $2, izohlar = izohlar || $3::jsonb, foiz = null, bosqich = null, updated_at = now() where id = $1`,
    [id, yangiHolat, izohQator(izohMatn, rad ? "rad" : "izoh")]);
  if (t.holat === "tasdiqlandi") {
    const h = await tugunlar(t.loyiha_id);
    const eskirgan: string[] = [];
    for (const a of avlodlar(t, h)) {
      if (a.holat === "tasdiqlandi" || a.holat === "tekshiruvda") { await q(`update studio_tugun set holat = 'eskirgan', updated_at = now() where id = $1`, [a.id]); eskirgan.push(a.nom); }
      else if (a.holat === "navbatda") await q(`update studio_tugun set holat = 'kutmoqda', updated_at = now() where id = $1`, [a.id]);
    }
    if (eskirgan.length) await jurnalga(t.loyiha_id, `Eskirdi: ${eskirgan.join(", ")}`);
  }
  await jurnalga(t.loyiha_id, `${t.nom}: ${rad ? "rad etildi" : "izoh bilan qayta"}${matn ? ` — «${matn.slice(0, 120)}»` : ""}`, "siz");
  await agentgaNavbat(t.loyiha_id);
  await egasigaXabar(t.loyiha_id);
  return { ok: true };
}

// Eskirgan tugun: "qayta qilsin" yoki "shunday qolsin"
export async function eskirganQaror(id: number, qayta: boolean) {
  const t = await tugunOl(id);
  if (t.holat !== "eskirgan") throw new Error("Tugun eskirgan emas");
  if (qayta) {
    await q(`update studio_tugun set holat = 'kutmoqda', izohlar = izohlar || $2::jsonb, updated_at = now() where id = $1`,
      [id, izohQator("Yuqoridagi bosqich o‘zgardi — yangilash kerak", "eskirgan")]);
    await jurnalga(t.loyiha_id, `${t.nom}: yangilansin`, "siz");
    await ochish(t.loyiha_id);
  } else {
    await q(`update studio_tugun set holat = 'tasdiqlandi', updated_at = now() where id = $1`, [id]);
    await jurnalga(t.loyiha_id, `${t.nom}: o‘zgarishsiz qoldi`, "siz");
    await ochish(t.loyiha_id);
  }
  await egasigaXabar(t.loyiha_id);
  return { ok: true };
}

export async function qaytaUrin(id: number) {
  const t = await tugunOl(id);
  if (t.holat !== "xato") throw new Error("Tugunda xato yo‘q");
  await q(`update studio_tugun set holat = 'navbatda', foiz = null, bosqich = null, updated_at = now() where id = $1`, [id]);
  await jurnalga(t.loyiha_id, `${t.nom}: qayta urinish`, "siz");
  await agentgaNavbat(t.loyiha_id);
  return { ok: true };
}

export async function joyla(id: number, x: number, y: number, w?: number) {
  const X = Math.round(Math.max(-20000, Math.min(20000, Number(x) || 0)));
  const Y = Math.round(Math.max(-20000, Math.min(20000, Number(y) || 0)));
  const W = w ? Math.round(Math.max(160, Math.min(800, Number(w)))) : null;
  await q(`update studio_tugun set x = $2, y = $3, w = coalesce($4, w) where id = $1`, [id, X, Y, W]);
  return { ok: true };
}

// Doskadagi erkin qaydlar (yopishqoq qog'oz)
export async function qaydQosh(loyihaId: number, x: number, y: number, matn: string) {
  const kalit = `izoh-${Date.now().toString(36)}`;
  const r = (await q(`insert into studio_tugun (loyiha_id, kalit, tur, nom, holat, x, y, w, mazmun, tartib) values ($1,$2,'izoh','Qayd','tasdiqlandi',$3,$4,220,$5::jsonb,999) returning id`,
    [loyihaId, kalit, Math.round(x), Math.round(y), JSON.stringify({ matn: String(matn || "").slice(0, 2000) })]))[0];
  await q(`update studio_loyiha set updated_at = now() where id = $1`, [loyihaId]);
  return { id: r.id };
}
export async function qaydTahrir(id: number, matn: string) {
  const t = await tugunOl(id);
  if (t.tur !== "izoh") throw new Error("Faqat qaydni tahrirlash mumkin");
  await q(`update studio_tugun set mazmun = jsonb_set(mazmun, '{matn}', to_jsonb($2::text)), updated_at = now() where id = $1`, [id, String(matn || "").slice(0, 2000)]);
  return { ok: true };
}
export async function qaydOchir(id: number) {
  const t = await tugunOl(id);
  if (t.tur !== "izoh") throw new Error("Faqat qaydni o‘chirish mumkin");
  await q(`delete from studio_tugun where id = $1`, [id]);
  await q(`update studio_loyiha set updated_at = now() where id = $1`, [t.loyiha_id]);
  return { ok: true };
}

// Agentga erkin buyruq (doska pastidagi qator)
export async function buyruqBer(loyihaId: number, matn: string) {
  const m = String(matn || "").trim();
  if (!m) throw new Error("Buyruqni yozing");
  await q(`update studio_loyiha set buyruqlar = buyruqlar || $2::jsonb, updated_at = now() where id = $1`, [loyihaId, JSON.stringify([jurnalQator(m, "siz")])]);
  await jurnalga(loyihaId, m, "siz");
  await agentgaNavbat(loyihaId);
  return { ok: true };
}

// Reliz: egasi ruxsat beradi → mavjud joylash quvuri (Zernio + Telegram kanal)
export async function relizQil(id: number, vaqt: "hozir" | "eng_yaxshi", caption?: string, tgMatn?: string) {
  const t = await tugunOl(id);
  if (t.tur !== "reliz") throw new Error("Bu reliz tuguni emas");
  if (t.holat !== "tekshiruvda") throw new Error("Reliz hali tayyor emas");
  const video = (await q(`select mazmun, holat from studio_tugun where loyiha_id = $1 and kalit = 'video'`, [t.loyiha_id]))[0];
  if (!video || video.holat !== "tasdiqlandi" || !video.mazmun?.media_url) throw new Error("Avval yakuniy videoni tasdiqlang");
  const l = (await q(`select id, nom, loyiha from studio_loyiha where id = $1`, [t.loyiha_id]))[0];
  const cap = igHavola(String(caption ?? t.mazmun?.caption ?? "").trim());
  const tgm = tgHavola(String(tgMatn ?? t.mazmun?.tg_matn ?? "").trim());
  if (!cap) throw new Error("Instagram matni bo‘sh");
  const natija = { matn: `Studiya #${l.id}: ${l.nom}`, media_url: video.mazmun.media_url, ...(video.mazmun.toliq_url ? { toliq_url: video.mazmun.toliq_url } : {}), media_tur: "video", caption: cap, tg_matn: tgm, studio: l.id };
  const v = (await q(`insert into agent_vazifalar (loyiha, tur, buyruq, holat, natija, kun) values ($1, 'video', $2, 'tasdiq', $3::jsonb, $4::date) returning id`,
    [l.loyiha, `Studiya #${l.id}: ${String(l.nom).slice(0, 70)}`, JSON.stringify(natija), bugunTosh()]))[0];
  await q(`update studio_tugun set mazmun = mazmun || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify({ caption: cap, tg_matn: tgm, vazifa_id: v.id })]);
  const r = await qaror(v.id, vaqt === "eng_yaxshi" ? "hv" : "ha");
  await q(`update studio_tugun set holat = 'tasdiqlandi', updated_at = now() where id = $1`, [id]);
  await q(`update studio_loyiha set holat = 'tugadi', updated_at = now() where id = $1`, [t.loyiha_id]);
  await jurnalga(t.loyiha_id, vaqt === "eng_yaxshi" ? "Reliz: eng yaxshi vaqtga rejalandi" : "Reliz: joylanmoqda", "siz");
  await egasigaXabar(t.loyiha_id);
  return { ok: true, vazifa: v.id, natija: r };
}

export async function arxivla(loyihaId: number, arxiv = true) {
  await q(`update studio_loyiha set holat = $2, updated_at = now() where id = $1`, [loyihaId, arxiv ? "arxiv" : "faol"]);
  return { ok: true };
}

// ---------- Variantlar va versiyalar ----------
// Agent bir tugun uchun bir nechta variant beradi: mazmun.variantlar = [{...}, ...]. Egasi bittasini tanlaydi.
export async function variantTanla(id: number, i: number, tasdiq = false) {
  const t = await tugunOl(id);
  const vs: any[] = Array.isArray(t.mazmun?.variantlar) ? t.mazmun.variantlar : [];
  if (!vs[i] || typeof vs[i] !== "object") throw new Error("Variant topilmadi");
  if (!["tekshiruvda", "eskirgan"].includes(t.holat)) throw new Error("Variant faqat tekshiruvda tanlanadi");
  const mazmun = { ...vs[i], variantlar: vs, tanlangan: i, _v: t.mazmun?._v ?? 1 };
  await q(`update studio_tugun set mazmun = $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify(mazmun)]);
  await jurnalga(t.loyiha_id, `${t.nom}: ${i + 1}-variant tanlandi`, "siz");
  if (tasdiq) return tasdiqla(id);
  return { ok: true };
}

// "Yana N ta variant" — agent qayta ishlaydi va mazmun.variantlar qaytaradi
export async function variantSora(id: number, soni: number, izoh = "") {
  const t = await tugunOl(id);
  const n = Math.max(2, Math.min(6, Number(soni) || 3));
  if (["kutmoqda", "ishlamoqda"].includes(t.holat)) throw new Error("Bu tugun hozir ishlanmaydi");
  const matn = `${n} ta har xil variant kerak — men tanlayman.${izoh ? " " + String(izoh).trim() : ""}`;
  await q(`update studio_tugun set mazmun = mazmun || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify({ _soni: n })]);
  return qaytaQil(id, matn, false);
}

// Oldingi versiyani qaytarish: joriy mazmun versiyalarga o'tadi, tanlangan versiya — tekshiruvga
export async function versiyaQaytar(id: number, i: number) {
  const t = await tugunOl(id);
  const vs: any[] = Array.isArray(t.versiyalar) ? t.versiyalar : [];
  const v = vs[i];
  if (!v?.mazmun) throw new Error("Versiya topilmadi");
  if (["kutmoqda", "navbatda", "ishlamoqda"].includes(t.holat)) throw new Error("Bu tugun hozir band");
  const yangiVs = vs.filter((_, k) => k !== i).concat([{ mazmun: t.mazmun, vaqt: new Date().toISOString() }]);
  const mazmun = { ...v.mazmun, _v: Number(t.mazmun?._v || 0) + 1 };
  if (t.holat === "tasdiqlandi") {
    await qaytaQil(id, `v${v.mazmun._v ?? i + 1} versiyasiga qaytarildi`, false);
  }
  await q(`update studio_tugun set holat = 'tekshiruvda', mazmun = $2::jsonb, versiyalar = $3::jsonb, updated_at = now() where id = $1`,
    [id, JSON.stringify(mazmun), JSON.stringify(yangiVs)]);
  await jurnalga(t.loyiha_id, `${t.nom}: v${v.mazmun._v ?? i + 1} qaytarildi`, "siz");
  await egasigaXabar(t.loyiha_id);
  return { ok: true };
}

// ---------- Kutubxona: qahramonlar, ovozlar, uslublar, joylar ----------
export const KUTUBXONA_TURLARI = ["qahramon", "ovoz", "uslub", "joy", "manba"] as const;
const kTur = (t: unknown) => {
  const x = String(t || "");
  if (!(KUTUBXONA_TURLARI as readonly string[]).includes(x)) throw new Error("tur: qahramon | ovoz | uslub | joy | manba");
  return x;
};
export async function kutubxona(tur?: string) {
  await studioTayyorla();
  const r = await q(`select id, tur, nom, mazmun, rasm, holat, updated_at from studio_kutubxona
                        where holat <> 'ochirildi' and ($1::text is null or tur = $1) order by tur, updated_at desc limit 200`, [tur ? kTur(tur) : null]);
  return { kutubxona: r.map((k: any) => ({ ...k, mazmun: fayllarniOch(k.mazmun) })) };
}

// Fayl yuklash (ovoz namunasi, qahramon rasmi): base64, ≤3.5 MB → Telegram arxivi → kutubxona elementiga biriktiriladi
export async function yukla(b: any) {
  const id = Number(b.id);
  const k = (await q(`select id, tur, nom, mazmun from studio_kutubxona where id = $1`, [id]))[0];
  if (!k) throw new Error("Avval kutubxona elementini saqlang");
  const mime = String(b.mime || "application/octet-stream");
  const buf = Buffer.from(String(b.b64 || ""), "base64");
  if (!buf.length) throw new Error("Fayl bo‘sh");
  if (buf.length > 3.5 * 1024 * 1024) throw new Error("Fayl 3.5 MB dan katta — qisqaroq yozuv yuboring");
  const bolim: Bolim = mime.startsWith("image/") ? "rasm" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "ovoz" : "hujjat";
  const nom = String(b.nom || "fayl").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  // Rasm hujjat sifatida yuboriladi — Telegram siqmasin
  const f = await arxivgaMedia(new Blob([buf], { type: mime }), nom, bolim === "rasm" ? "hujjat" : bolim, `🎛 Studiya kutubxonasi · ${k.tur} · ${k.nom}`);
  if (!f?.f) throw new Error("Fayllar guruhi (FILES_CHAT_ID) sozlanmagan");
  const yozuv = { f: f.f, nom, tur: bolim, hajm: buf.length, vaqt: new Date().toISOString() };
  await q(`update studio_kutubxona set mazmun = jsonb_set(mazmun, '{fayllar}', coalesce(mazmun->'fayllar','[]'::jsonb) || $2::jsonb), updated_at = now() where id = $1`,
    [id, JSON.stringify([yozuv])]);
  return { ok: true, url: proksi(f.f) };
}
export async function kutubxonaSaqla(b: any, kim: "siz" | "agent" = "siz") {
  await studioTayyorla();
  const nom = String(b.nom || "").trim().slice(0, 80);
  const mazmun = b.mazmun && typeof b.mazmun === "object" ? b.mazmun : {};
  const rasm = b.rasm ? String(b.rasm).slice(0, 1000) : null;
  if (b.id) {
    const r = await q(`update studio_kutubxona set nom = coalesce(nullif($2,''), nom), mazmun = mazmun || $3::jsonb, rasm = coalesce($4, rasm),
                        holat = coalesce($5, holat), updated_at = now() where id = $1 returning id`,
      [Number(b.id), nom, JSON.stringify(mazmun), rasm, b.holat ? String(b.holat).slice(0, 20) : null]);
    if (!r.length) throw new Error("Kutubxonada topilmadi");
    return { id: r[0].id, kim };
  }
  if (!nom) throw new Error("Nomini yozing");
  const r = await q(`insert into studio_kutubxona (tur, nom, mazmun, rasm, holat) values ($1,$2,$3::jsonb,$4,$5) returning id`,
    [kTur(b.tur), nom, JSON.stringify(mazmun), rasm, b.holat ? String(b.holat).slice(0, 20) : kim === "siz" && b.tur === "ovoz" ? "navbatda" : "faol"]);
  return { id: r[0].id, kim };
}
export async function kutubxonaOchir(id: number) {
  await q(`update studio_kutubxona set holat = 'ochirildi', updated_at = now() where id = $1`, [id]);
  return { ok: true };
}
// Kutubxonadagi ish agentga: masalan, yangi klon ovoz namunasini tayyorlash
export async function kutubxonaIshi(id: number, matn: string) {
  const k = (await q(`select id, tur, nom from studio_kutubxona where id = $1`, [id]))[0];
  if (!k) throw new Error("Kutubxonada topilmadi");
  await q(`update studio_kutubxona set holat = 'navbatda', mazmun = mazmun || $2::jsonb, updated_at = now() where id = $1`,
    [id, JSON.stringify({ _buyruq: String(matn || "").slice(0, 1000), _vaqt: new Date().toISOString() })]);
  const bor = (await q(`select id from agent_vazifalar where tur = 'studio' and buyruq like $1 and holat in ('navbatda','ishlanmoqda')`, [`Kutubxona #${id}:%`]))[0];
  if (!bor) await q(`insert into agent_vazifalar (loyiha, tur, buyruq, taxmin_daq) values ('studiya', 'studio', $1, 15)`, [`Kutubxona #${id}: ${k.tur} · ${String(k.nom).slice(0, 60)}`]);
  await panelYangila();
  return { ok: true };
}

// ---------- Telefon: faqat agent — tasdiq kutayotgan hamma narsa bitta lentada ----------
export async function kutish() {
  await studioTayyorla();
  const tugunlarK = await q(`select t.id, t.kalit, t.tur, t.nom, t.holat, t.mazmun, t.foiz, t.bosqich, t.updated_at, t.versiyalar,
        l.id loyiha_id, l.nom loyiha_nom
      from studio_tugun t join studio_loyiha l on l.id = t.loyiha_id
      where l.holat = 'faol' and t.tur <> 'izoh' and t.holat in ('tekshiruvda','eskirgan','xato')
      order by t.updated_at desc limit 40`);
  const jarayon = await q(`select t.id, t.nom, t.holat, t.foiz, t.bosqich, l.id loyiha_id, l.nom loyiha_nom
      from studio_tugun t join studio_loyiha l on l.id = t.loyiha_id
      where l.holat = 'faol' and t.holat in ('ishlamoqda','navbatda','qayta') order by t.holat = 'ishlamoqda' desc, t.updated_at desc limit 20`);
  const vazifalar = await q(`select id, tur, buyruq, holat, natija, updated_at from agent_vazifalar
      where holat = 'tasdiq' order by updated_at desc limit 20`);
  const loyihalar = await q(`select l.id, l.nom, l.holat, l.updated_at,
        count(t.*) filter (where t.tur <> 'izoh')::int jami,
        count(t.*) filter (where t.tur <> 'izoh' and t.holat = 'tasdiqlandi')::int tayyor
      from studio_loyiha l left join studio_tugun t on t.loyiha_id = l.id
      where l.holat in ('faol','tugadi') group by l.id order by l.updated_at desc limit 12`);
  const k = keyingiTekshiruv();
  const ishlayapti = (await q(`select count(*)::int n from agent_vazifalar where holat = 'ishlanmoqda'`))[0].n > 0;
  return { tugunlar: tugunlarK, jarayon, vazifalar, loyihalar, agent: { ishlayapti, keyingi: { vaqt: k.vaqt, ertaga: k.ertaga, qoldi: k.qoldi } } };
}

// ================= O'qish =================
export async function royxat() {
  await studioTayyorla();
  return {
    loyihalar: await q(`select l.id, l.nom, l.holat, l.updated_at, l.reklama, l.format,
        count(t.*) filter (where t.tur <> 'izoh')::int jami,
        count(t.*) filter (where t.tur <> 'izoh' and t.holat = 'tasdiqlandi')::int tayyor,
        count(t.*) filter (where t.holat in ('tekshiruvda','eskirgan'))::int kutadi,
        count(t.*) filter (where t.holat = 'ishlamoqda')::int ishlamoqda
      from studio_loyiha l left join studio_tugun t on t.loyiha_id = l.id
      where l.holat <> 'arxiv' group by l.id order by l.updated_at desc limit 40`),
  };
}

export async function belgi(loyihaId: number) {
  await studioTayyorla();
  const r = (await q(`select greatest(
      (select updated_at from studio_loyiha where id = $1),
      (select max(updated_at) from studio_tugun where loyiha_id = $1),
      (select v.updated_at from agent_vazifalar v join studio_loyiha l on l.vazifa_id = v.id where l.id = $1)
    ) b`, [loyihaId]))[0];
  return { belgi: r?.b ? new Date(r.b).getTime() : 0 };
}

export async function loyihaOl(loyihaId: number) {
  await studioTayyorla();
  const l = (await q(`select id, nom, mavzu, loyiha, holat, vazifa_id, jurnal, buyruqlar, reklama, format, qahramon_id, created_at, updated_at from studio_loyiha where id = $1`, [loyihaId]))[0];
  if (!l) throw new Error("Loyiha topilmadi");
  const t = await q(`select id, kalit, tur, nom, holat, x, y, w, ota, mazmun, versiyalar, izohlar, foiz, bosqich, updated_at from studio_tugun where loyiha_id = $1 order by tartib, id`, [loyihaId]);
  const v = l.vazifa_id
    ? (await q(`select id, holat, model, reja, joriy, taxmin_daq, boshlangan, updated_at from agent_vazifalar where id = $1`, [l.vazifa_id]))[0] ?? null
    : null;
  const k = keyingiTekshiruv();
  const b = await belgi(loyihaId);
  return {
    loyiha: l,
    tugunlar: t,
    agent: v ? { ...v, otdi: v.boshlangan && v.holat === "ishlanmoqda" ? Math.max(0, Math.round((Date.now() - Date.parse(v.boshlangan)) / 60000)) : null } : null,
    keyingi: { vaqt: k.vaqt, ertaga: k.ertaga, qoldi: k.qoldi },
    belgi: b.belgi,
  };
}

// ================= Agent amallari (api/agent.ts orqali) =================
// GET ?studio=1[&loyiha=L] — ishi bor loyihalar: barcha tugunlar, egasining izohlari va buyruqlari
export async function agentIshlari(loyihaId?: number) {
  await studioTayyorla();
  const ls = await q(
    `select l.id, l.nom, l.mavzu, l.loyiha, l.vazifa_id, l.buyruqlar, l.reklama, l.format, l.qahramon_id from studio_loyiha l
     where l.holat = 'faol' and ($1::int is null or l.id = $1)
       and (exists (select 1 from studio_tugun t where t.loyiha_id = l.id and t.holat in ('navbatda','qayta','ishlamoqda'))
            or jsonb_array_length(l.buyruqlar) > 0)
     order by l.id`, [loyihaId ?? null]);
  const natija = [];
  for (const l of ls) {
    const t = await q(`select kalit, tur, nom, holat, ota, mazmun, izohlar, foiz, bosqich from studio_tugun where loyiha_id = $1 and tur <> 'izoh' order by tartib, id`, [l.id]);
    const qaydlar = (await q(`select mazmun->>'matn' matn from studio_tugun where loyiha_id = $1 and tur = 'izoh'`, [l.id])).map((r: any) => r.matn).filter(Boolean);
    natija.push({
      ...l,
      ish: t.filter((x: any) => ["navbatda", "qayta"].includes(x.holat)).map((x: any) => x.kalit),
      tugunlar: t,
      qaydlar,
    });
  }
  // Kutubxona: loyihalar qahramon/ovoz/uslubni shu yerdan oladi; holat=navbatda — agent uchun ish (masalan, klon ovoz)
  const kut = (await q(`select id, tur, nom, mazmun, rasm, holat from studio_kutubxona where holat <> 'ochirildi' order by tur, id`))
    .map((k: any) => ({ ...k, mazmun: fayllarniOch(k.mazmun, true) }));
  return { studio: natija, kutubxona: kut, kutubxona_ishi: kut.filter((k: any) => k.holat === "navbatda").map((k: any) => k.id) };
}

// POST {amal:"tugun", loyiha_id, kalit, holat?, foiz?, bosqich?, mazmun?, jurnal?}
export async function agentTugun(b: any) {
  await studioTayyorla();
  const loyihaId = Number(b.loyiha_id);
  const t = (await q(`select id, holat, mazmun, nom from studio_tugun where loyiha_id = $1 and kalit = $2`, [loyihaId, String(b.kalit || "")]))[0];
  if (!t) throw new Error("tugun topilmadi (loyiha_id + kalit)");
  const holat = b.holat ? String(b.holat) : null;
  if (holat && !AGENT_HOLATLARI.includes(holat as Holat)) throw new Error("agent holati: ishlamoqda | tekshiruvda | xato");
  if (holat === "ishlamoqda" && !["navbatda", "qayta", "ishlamoqda", "xato"].includes(t.holat)) throw new Error(`tugun holati: ${t.holat} — ishlab bo'lmaydi`);
  if (holat === "tekshiruvda" && !["navbatda", "qayta", "ishlamoqda", "xato"].includes(t.holat)) throw new Error(`tugun holati: ${t.holat}`);
  const yangi = b.mazmun && typeof b.mazmun === "object" ? b.mazmun : null;
  if (holat === "tekshiruvda") {
    const eski = t.mazmun ?? {};
    const v = Number(eski._v || 0);
    const arxiv = v ? [{ mazmun: eski, vaqt: new Date().toISOString() }] : [];
    const mazmun = { ...(yangi ? yangi : eski), _v: v + 1 };
    await q(`update studio_tugun set holat = 'tekshiruvda', mazmun = $2::jsonb, versiyalar = (versiyalar || $3::jsonb), foiz = null, bosqich = null, updated_at = now() where id = $1`,
      [t.id, JSON.stringify(mazmun), JSON.stringify(arxiv)]);
  } else {
    await q(`update studio_tugun set holat = coalesce($2, holat), mazmun = mazmun || $3::jsonb,
               foiz = case when $4::int is null then foiz else $4::int end, bosqich = coalesce($5, bosqich), updated_at = now() where id = $1`,
      [t.id, holat, JSON.stringify(yangi ?? {}), b.foiz == null ? null : Math.max(0, Math.min(100, Number(b.foiz) || 0)), b.bosqich ? String(b.bosqich).slice(0, 120) : null]);
  }
  if (b.jurnal) await jurnalga(loyihaId, `${t.nom}: ${String(b.jurnal)}`, "agent");
  else if (holat === "tekshiruvda") await jurnalga(loyihaId, `${t.nom} tekshiruvga tayyor`, "agent");
  else if (holat === "xato") await jurnalga(loyihaId, `${t.nom}: xato`, "agent");
  if (holat === "tekshiruvda" || holat === "xato") {
    await egasigaXabar(loyihaId);
    await agentYakunla(loyihaId);
  }
  return { ok: true };
}

// POST {amal:"tugun_yangi", loyiha_id, tugunlar:[{kalit, tur, nom, ota?, mazmun?, x?, y?, w?}]} — masalan, sahnalar
export async function agentTugunYangi(b: any) {
  await studioTayyorla();
  const loyihaId = Number(b.loyiha_id);
  const ls: any[] = Array.isArray(b.tugunlar) ? b.tugunlar.slice(0, 30) : [];
  if (!ls.length) throw new Error("tugunlar bo'sh");
  const bor = await tugunlar(loyihaId);
  if (!bor.length) throw new Error("loyiha topilmadi");
  let sahnaN = bor.filter((t) => t.kalit.startsWith("sahna-")).length;
  const qoshildi: string[] = [];
  for (const [i, x] of ls.entries()) {
    const kalit = String(x.kalit || "").trim().slice(0, 40);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(kalit)) throw new Error(`kalit noto'g'ri: ${kalit}`);
    const tur = TURLAR.includes(String(x.tur)) ? String(x.tur) : kalit.startsWith("sahna-") ? "sahna" : "referens";
    const sahna = tur === "sahna";
    const pos = sahna ? sahnaN++ : i;
    const ota = Array.isArray(x.ota) ? x.ota.map(String).slice(0, 10) : sahna ? SAHNA_OTA : [];
    const r = await q(
      `insert into studio_tugun (loyiha_id, kalit, tur, nom, ota, mazmun, x, y, w, tartib)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)
       on conflict (loyiha_id, kalit) do update set nom = excluded.nom, ota = excluded.ota, mazmun = studio_tugun.mazmun || excluded.mazmun, updated_at = now()
       returning (xmax = 0) yangi`,
      [loyihaId, kalit, tur, String(x.nom || kalit).slice(0, 60), JSON.stringify(ota), JSON.stringify(x.mazmun ?? {}),
       x.x ?? (sahna ? (pos % 4) * 290 : 1300), x.y ?? (sahna ? SAHNA_Y + Math.floor(pos / 4) * 400 : 0), x.w ?? (sahna ? 260 : 240), sahna ? 100 + pos : 50 + i]);
    if (r[0]?.yangi) qoshildi.push(kalit);
  }
  if (qoshildi.length) await jurnalga(loyihaId, `Yangi tugunlar: ${qoshildi.join(", ")}`, "agent");
  await ochish(loyihaId);
  return { ok: true, qoshildi };
}

// POST {amal:"studio_buyruq", loyiha_id} — egasining buyruqlari o'qildi
export async function agentBuyruqOqildi(loyihaId: number) {
  await q(`update studio_loyiha set buyruqlar = '[]'::jsonb, updated_at = now() where id = $1`, [loyihaId]);
  return { ok: true };
}

// Agentga ish qolmasa, studio vazifasi "bajarildi" (egasi amal qilganda yana navbatga tushadi)
async function agentYakunla(loyihaId: number) {
  const l = (await q(`select vazifa_id, jsonb_array_length(buyruqlar) b from studio_loyiha where id = $1`, [loyihaId]))[0];
  if (!l?.vazifa_id || l.b) return;
  const n = (await q(`select count(*)::int n from studio_tugun where loyiha_id = $1 and holat in ('navbatda','qayta','ishlamoqda')`, [loyihaId]))[0].n;
  if (n) return;
  const r = await q(`update agent_vazifalar set holat = 'bajarildi', updated_at = now() where id = $1 and holat in ('ishlanmoqda','navbatda') returning id`, [l.vazifa_id]);
  if (r.length) await panelYangila();
}
