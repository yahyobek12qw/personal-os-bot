// Personal OS 2.0 — Neon ustidagi asosiy mantiq (ilova va bot uchun umumiy).

import { q } from "./db";
import { kunQosh } from "./parse";
import { tahlil } from "./tahlil";
import { proksi } from "./media";
import { arxivHavola } from "./arxiv";

export const TURLAR = ["vazifa", "voqea", "qayd", "goya", "havola", "xarajat", "daromad", "odat", "loyiha", "kurs", "dars", "kitob", "qadam", "qarz", "maqsad", "tolov"] as const;
export const KONTEYNER = ["loyiha", "kurs", "kitob", "maqsad"];
const MAYDONLAR = ["tur", "nom", "matn", "soha_id", "ota_id", "holat", "inbox", "sana", "vaqt", "davomiylik", "eslatma", "summa", "kategoriya", "progress", "havola", "tartib"] as const;
const MAX_TG = 20 * 1024 * 1024;

// Ro'yxatlar uchun yengil element
const ROYXAT = `
  e.id, e.tur, e.nom, e.soha_id, e.ota_id, e.holat, e.inbox, to_char(e.sana,'YYYY-MM-DD') sana, to_char(e.vaqt,'HH24:MI') vaqt,
  e.summa::float summa, e.kategoriya, e.progress, e.havola, e.meta, e.tartib, e.created_at,
  o.nom ota_nom, o.tur ota_tur,
  (select count(*)::int from elementlar b where b.ota_id = e.id) bolalar,
  (select count(*)::int from elementlar b where b.ota_id = e.id and b.holat = 'bajarildi') bajarilgan,
  (select count(*)::int from fayllar f where f.element_id = e.id) fayllar`;
const FROM = `from elementlar e left join elementlar o on o.id = e.ota_id`;

export function hozirToshkent() {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return { sana: d.toISOString().slice(0, 10), vaqt: d.toISOString().slice(11, 16) };
}
const oyBoshi = (s: string) => s.slice(0, 7) + "-01";
const oyOxiri = (s: string) => { const [y, m] = s.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const haftaKuni = (s: string) => ((new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7) + 1; // Du=1 ... Ya=7

// ---------- fayllar ----------
export function faylKorinish(f: any) {
  const katta = Number(f.hajm || 0) > MAX_TG;
  const src = f.url || (f.file_id && !katta ? proksi(f.file_id) : null);
  return {
    id: f.id, tur: f.tur, nom: f.nom, hajm: f.hajm ? Number(f.hajm) : null, katta,
    src, thumb: f.thumb_id ? proksi(f.thumb_id) : f.tur === "rasm" ? src : null,
    tgLink: f.tg_msg ? arxivHavola(f.tg_msg, (f.tg_bolim || (f.tur === "fayl" ? "hujjat" : f.tur)) as any) : null,
  };
}

// ---------- odatlar ----------
async function odatlar(bugun: string) {
  const rows = await q(`select e.id, e.nom, e.soha_id, e.meta from elementlar e where e.tur = 'odat' and e.holat <> 'bekor' order by e.tartib nulls last, e.created_at`);
  if (!rows.length) return [];
  const belgi = await q(`select odat_id, to_char(sana,'YYYY-MM-DD') sana from odat_belgi where sana > $1::date - 120`, [bugun]);
  const m = new Map<string, Set<string>>();
  for (const b of belgi) (m.get(b.odat_id) ?? m.set(b.odat_id, new Set()).get(b.odat_id)!).add(b.sana);
  const hk = haftaKuni(bugun);
  return rows
    .map((o) => {
      const s = m.get(o.id) ?? new Set<string>();
      let streak = 0;
      let d = s.has(bugun) ? bugun : kunQosh(bugun, -1);
      while (s.has(d)) { streak++; d = kunQosh(d, -1); }
      const kunlar: number[] = o.meta?.kunlar ?? [1, 2, 3, 4, 5, 6, 7];
      const hafta = Array.from({ length: 7 }, (_, i) => s.has(kunQosh(bugun, i - 6)));
      return { id: o.id, nom: o.nom, soha_id: o.soha_id, done: s.has(bugun), streak, bugunmi: kunlar.includes(hk), hafta };
    });
}
export async function odatBelgila(id: string, sana: string, done: boolean) {
  if (done) await q(`insert into odat_belgi (odat_id, sana) values ($1, $2) on conflict do nothing`, [id, sana]);
  else await q(`delete from odat_belgi where odat_id = $1 and sana = $2`, [id, sana]);
  return { ok: true };
}

// ---------- doimiy to'lov / qarz eslatmalari ----------
async function pulEslatmalari(bugun: string) {
  const r: any[] = [];
  const tolov = await q(`select id, nom, summa::float summa, meta from elementlar where tur = 'tolov' and holat = 'ochiq'`);
  for (const t of tolov) {
    const kun = Math.min(Number(t.meta?.kun) || 1, Number(oyOxiri(bugun).slice(8)));
    const muddat = bugun.slice(0, 8) + String(kun).padStart(2, "0");
    const tolangan = t.meta?.oxirgi && t.meta.oxirgi >= oyBoshi(bugun);
    if (!tolangan && muddat <= kunQosh(bugun, 3)) r.push({ id: t.id, tur: "tolov", nom: t.nom, summa: t.summa, sana: muddat, kechikkan: muddat < bugun, daromad: t.meta?.turi === "Daromad" });
  }
  const qarz = await q(`select id, nom, summa::float summa, to_char(sana,'YYYY-MM-DD') sana, meta from elementlar where tur = 'qarz' and holat = 'ochiq' and sana is not null and sana <= $1::date + 3`, [bugun]);
  for (const x of qarz) r.push({ id: x.id, tur: "qarz", nom: x.nom, summa: x.summa, sana: x.sana, kechikkan: x.sana < bugun, mendan: x.meta?.yonalish === "Men oldim" });
  return r;
}

// ---------- BUGUN ----------
export async function bugunKorinish() {
  const { sana: bugun, vaqt: hozir } = hozirToshkent();
  const [reja, kechikkan, inbox, kund, od, pul] = await Promise.all([
    q(`select ${ROYXAT} ${FROM} where e.sana = $1 and e.holat <> 'bekor' and e.tur not in ('xarajat','daromad','odat','tolov') order by e.vaqt nulls last, e.created_at`, [bugun]),
    q(`select ${ROYXAT} ${FROM} where e.sana < $1 and e.holat in ('ochiq','jarayonda') and e.tur in ('vazifa','qadam') order by e.sana`, [bugun]),
    q(`select count(*)::int n from elementlar where inbox and holat <> 'bekor'`),
    q(`select kayfiyat, matn from kundalik where sana = $1`, [bugun]),
    odatlar(bugun),
    pulEslatmalari(bugun),
  ]);
  const keyingi = reja.find((x) => x.holat !== "bajarildi" && x.vaqt && x.vaqt >= hozir) ?? null;
  const bajarildi = reja.filter((x) => x.holat === "bajarildi").length;
  return { sana: bugun, hozir, reja, kechikkan, keyingi, inbox: inbox[0].n, kundalik: kund[0] ?? null, odatlar: od.filter((o) => o.bugunmi), pul, progress: { bajarildi, jami: reja.length } };
}

// ---------- KALENDAR ----------
export async function kalendar(oy: string) {
  const bosh = `${oy}-01`, oxir = oyOxiri(bosh);
  const items = await q(`select ${ROYXAT} ${FROM} where e.sana between $1 and $2 and e.holat <> 'bekor' and e.tur not in ('xarajat','daromad') order by e.sana, e.vaqt nulls last`, [bosh, oxir]);
  return { oy, items };
}

// ---------- SOHALAR ----------
export async function sohalar() {
  const { sana: bugun } = hozirToshkent();
  const [s, st, keyingi, hafta, pul, od] = await Promise.all([
    q(`select id, nom, rang, ikon, izoh, tartib from sohalar where not arxiv order by tartib, created_at`),
    q(`select soha_id, count(*) filter (where holat in ('ochiq','jarayonda') and tur in ('vazifa','qadam'))::int ochiq,
              count(*) filter (where tur in ('loyiha','kurs','kitob') and holat <> 'bekor')::int konteyner,
              count(*)::int jami from elementlar group by soha_id`),
    q(`select distinct on (soha_id) soha_id, nom, to_char(sana,'YYYY-MM-DD') sana from elementlar where sana >= $1 and holat in ('ochiq','jarayonda') and soha_id is not null order by soha_id, sana, vaqt nulls last`, [bugun]),
    q(`select count(*)::int n from elementlar where tur in ('vazifa','qadam') and sana between $1 and $2::date + 6 and holat <> 'bekor'`, [bugun, bugun]),
    q(`select coalesce(sum(case when tur='daromad' then summa end),0)::float daromad, coalesce(sum(case when tur='xarajat' then summa end),0)::float xarajat from elementlar where tur in ('xarajat','daromad') and sana between $1 and $2`, [oyBoshi(bugun), oyOxiri(bugun)]),
    odatlar(bugun),
  ]);
  const stm = new Map(st.map((x) => [x.soha_id, x]));
  const km = new Map(keyingi.map((x) => [x.soha_id, x]));
  const odatFoiz = od.length ? Math.round((od.reduce((a, o) => a + o.hafta.filter(Boolean).length, 0) / (od.length * 7)) * 100) : null;
  return {
    sohalar: s.map((x) => ({ ...x, ...(stm.get(x.id) ?? { ochiq: 0, konteyner: 0, jami: 0 }), keyingi: km.get(x.id) ?? null, odatlar: od.filter((o) => o.soha_id === x.id).length })),
    sohasiz: stm.get(null)?.jami ?? 0,
    hafta: { vazifa: hafta[0].n, odatFoiz, xarajat: pul[0].xarajat, daromad: pul[0].daromad },
  };
}

// ---------- SOHA SAHIFASI ----------
export async function soha(id: string) {
  const { sana: bugun } = hozirToshkent();
  const s = (await q(`select * from sohalar where id = $1`, [id]))[0];
  if (!s && id !== "sohasiz") throw new Error("Soha topilmadi");
  const w = id === "sohasiz" ? "e.soha_id is null and not e.inbox" : "e.soha_id = $1";
  const p = id === "sohasiz" ? [] : [id];
  const [hamma, media] = await Promise.all([
    q(`select ${ROYXAT} ${FROM} where ${w} and e.tur <> 'qadam' order by e.sana nulls last, e.vaqt nulls last, e.created_at desc limit 400`, p),
    q(`select f.*, e.nom el_nom, e.id el_id from fayllar f join elementlar e on e.id = f.element_id where ${w} order by f.created_at desc limit 24`, p),
  ]);
  const r: any = {
    soha: s ?? { id: "sohasiz", nom: "Sohasiz", rang: "ish", ikon: "list" },
    konteynerlar: hamma.filter((x) => KONTEYNER.includes(x.tur) && !x.ota_id),
    yaqin: hamma.filter((x) => x.sana && x.sana >= bugun && x.holat !== "bajarildi" && x.holat !== "bekor").slice(0, 8),
    vazifalar: hamma.filter((x) => (x.tur === "vazifa" || x.tur === "dars") && x.holat !== "bajarildi" && x.holat !== "bekor"),
    qaydlar: hamma.filter((x) => ["qayd", "goya", "havola"].includes(x.tur)),
    odatlar: hamma.filter((x) => x.tur === "odat"),
    bajarilgan: hamma.filter((x) => x.holat === "bajarildi" && !["xarajat", "daromad"].includes(x.tur)).slice(0, 20),
    media: media.map((f) => ({ ...faylKorinish(f), element: { id: f.el_id, nom: f.el_nom } })),
    statlar: { ochiq: hamma.filter((x) => ["vazifa", "dars"].includes(x.tur) && ["ochiq", "jarayonda"].includes(x.holat)).length, bugun: hamma.filter((x) => x.sana === bugun).length, qayd: hamma.filter((x) => ["qayd", "goya", "havola"].includes(x.tur)).length },
  };
  if (id === "pul") r.moliya = await moliya(bugun);
  return r;
}

export async function moliya(bugun: string) {
  const [oy, kat, oxirgi, byud, tolov, qarz, maqsad] = await Promise.all([
    q(`select coalesce(sum(case when tur='daromad' then summa end),0)::float daromad, coalesce(sum(case when tur='xarajat' then summa end),0)::float xarajat from elementlar where tur in ('xarajat','daromad') and sana between $1 and $2`, [oyBoshi(bugun), oyOxiri(bugun)]),
    q(`select coalesce(kategoriya,'Boshqa') nom, sum(summa)::float summa from elementlar where tur = 'xarajat' and sana between $1 and $2 group by 1 order by 2 desc`, [oyBoshi(bugun), oyOxiri(bugun)]),
    q(`select ${ROYXAT} ${FROM} where e.tur in ('xarajat','daromad') order by e.sana desc nulls last, e.created_at desc limit 15`),
    q(`select qiymat from sozlamalar where kalit = 'byudjet'`),
    q(`select ${ROYXAT} ${FROM} where e.tur = 'tolov' order by e.holat, (e.meta->>'kun')::int nulls last`),
    q(`select ${ROYXAT} ${FROM} where e.tur = 'qarz' order by e.holat, e.sana nulls last`),
    q(`select ${ROYXAT} ${FROM} where e.tur = 'maqsad' order by e.holat, e.sana nulls last`),
  ]);
  return { ...oy[0], oy: bugun.slice(0, 7), kategoriyalar: kat, oxirgi, byudjet: byud[0]?.qiymat ?? {}, tolovlar: tolov, qarzlar: qarz, maqsadlar: maqsad };
}

// ---------- ELEMENT ----------
export async function element(id: string) {
  const e = (await q(`select ${ROYXAT}, e.matn, to_char(e.eslatma at time zone 'Asia/Tashkent','YYYY-MM-DD"T"HH24:MI') eslatma, e.davomiylik, e.updated_at, e.bajarildi_at ${FROM} where e.id = $1`, [id]))[0];
  if (!e) throw new Error("Topilmadi");
  const [bolalar, fayllar, soha, aka] = await Promise.all([
    q(`select ${ROYXAT} ${FROM} where e.ota_id = $1 order by e.tartib nulls last, e.sana nulls last, e.created_at`, [id]),
    q(`select * from fayllar where element_id = $1 order by created_at`, [id]),
    e.soha_id ? q(`select id, nom, rang, ikon from sohalar where id = $1`, [e.soha_id]) : Promise.resolve([]),
    e.ota_id ? q(`select id, nom, tur, holat from elementlar where ota_id = $1 order by tartib nulls last, sana nulls last, created_at`, [e.ota_id]) : Promise.resolve([]),
  ]);
  const i = aka.findIndex((x) => x.id === id);
  return { element: e, bolalar, fayllar: fayllar.map(faylKorinish), soha: soha[0] ?? null, oldingi: i > 0 ? aka[i - 1] : null, keyingi: i >= 0 && i < aka.length - 1 ? aka[i + 1] : null };
}

export async function saqla(id: string | null, x: Record<string, any>): Promise<{ id: string }> {
  const ust: string[] = [];
  const val: unknown[] = [];
  const qiymat: Record<string, unknown> = {};
  for (const k of MAYDONLAR) {
    if (!(k in x)) continue;
    let v = x[k];
    if (v === "" || v === undefined) v = null;
    if (k === "tur" && v && !(TURLAR as readonly string[]).includes(v)) throw new Error("Noto'g'ri tur");
    if (k === "nom" && !String(v ?? "").trim()) throw new Error("Nomini yozing");
    if (k === "holat" && v && !["ochiq", "jarayonda", "bajarildi", "bekor"].includes(v)) throw new Error("Noto'g'ri holat");
    if (k === "summa" && v != null) v = Number(String(v).replace(/[^\d.\-]/g, "")) || null;
    qiymat[k] = v;
  }
  // soha yoki sana qo'yilsa — Inbox'dan chiqadi
  if (!("inbox" in x) && (qiymat.soha_id || qiymat.sana || qiymat.ota_id)) qiymat.inbox = false;
  if (qiymat.holat === "bajarildi") qiymat.bajarildi_at = new Date().toISOString();
  else if ("holat" in qiymat) qiymat.bajarildi_at = null;
  for (const [k, v] of Object.entries(qiymat)) { val.push(v); ust.push(`${k} = $${val.length}`); }
  if (x.meta && typeof x.meta === "object") { val.push(JSON.stringify(x.meta)); ust.push(`meta = coalesce(meta,'{}'::jsonb) || $${val.length}::jsonb`); }
  if (id) {
    if (!ust.length) return { id };
    val.push(id);
    const r = await q(`update elementlar set ${ust.join(", ")}, updated_at = now() where id = $${val.length} returning id`, val);
    if (!r.length) throw new Error("Topilmadi");
    return { id: r[0].id };
  }
  if (!qiymat.nom) throw new Error("Nomini yozing");
  const cols = Object.keys(qiymat);
  const v2 = cols.map((k) => qiymat[k]);
  let sqlText = `insert into elementlar (${cols.join(", ")}${x.meta ? ", meta" : ""}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}${x.meta ? `, $${cols.length + 1}::jsonb` : ""}) returning id`;
  const r = await q(sqlText, x.meta ? [...v2, JSON.stringify(x.meta)] : v2);
  return { id: r[0].id };
}

export async function ochir(id: string) {
  await q(`delete from elementlar where id = $1`, [id]);
  return { ok: true };
}

// ---------- INBOX, QIDIRUV ----------
export async function inbox() {
  return { items: await q(`select ${ROYXAT} ${FROM} where e.inbox and e.holat <> 'bekor' order by e.created_at desc limit 200`) };
}
export async function qidiruv(s: string) {
  const t = String(s || "").trim();
  if (t.length < 2) return { items: [] };
  return { items: await q(`select ${ROYXAT} ${FROM} where e.nom ilike $1 or e.matn ilike $1 or e.kategoriya ilike $1 order by (e.nom ilike $1) desc, similarity(e.nom, $2) desc, e.updated_at desc limit 40`, [`%${t}%`, t]) };
}

export async function konteynerlar() {
  return { items: await q(`select ${ROYXAT} ${FROM} where e.tur in ('loyiha','kurs','kitob','maqsad') and e.holat <> 'bekor' order by e.soha_id, e.nom`) };
}

// ---------- TEZ QO'SHISH ----------
async function loyihaRoyxati() {
  return q(`select id, nom, soha_id from elementlar where tur in ('loyiha','kurs','kitob') and holat <> 'bekor'`);
}
export async function tahlilQil(matn: string) {
  return tahlil(matn, hozirToshkent().sana, await loyihaRoyxati());
}
export async function tezQosh(matn: string, ustidan: Record<string, any> = {}, manba = "Ilova") {
  const t = await tahlilQil(matn);
  const x: Record<string, any> = { tur: t.tur, nom: t.nom, sana: t.sana, vaqt: t.vaqt, soha_id: t.soha_id, ota_id: t.ota_id, summa: t.summa, kategoriya: t.kategoriya, havola: t.havola, inbox: t.inbox };
  for (const [k, v] of Object.entries(ustidan)) if (v !== undefined) x[k] = v;
  if (("soha_id" in ustidan && ustidan.soha_id) || ("sana" in ustidan && ustidan.sana)) x.inbox = false;
  if (x.tur === "xarajat" || x.tur === "daromad") { x.holat = "bajarildi"; x.soha_id = x.soha_id ?? "pul"; x.sana = x.sana ?? hozirToshkent().sana; x.inbox = false; }
  if (x.tur === "odat") x.inbox = false;
  const r = await saqla(null, { ...x, meta: { manba } });
  return { id: r.id, tahlil: t };
}

// ---------- to'lov, jamg'arma ----------
export async function tolandi(id: string) {
  const t = (await q(`select nom, summa::float summa, kategoriya, meta from elementlar where id = $1 and tur = 'tolov'`, [id]))[0];
  if (!t) throw new Error("To'lov topilmadi");
  const bugun = hozirToshkent().sana;
  await saqla(null, { tur: t.meta?.turi === "Daromad" ? "daromad" : "xarajat", nom: t.nom, summa: t.summa, kategoriya: t.kategoriya, sana: bugun, soha_id: "pul", holat: "bajarildi", ota_id: id });
  await q(`update elementlar set meta = meta || $2::jsonb, updated_at = now() where id = $1`, [id, JSON.stringify({ oxirgi: bugun })]);
  return { ok: true };
}
export async function jamgar(id: string, summa: number) {
  const r = await q(`update elementlar set meta = jsonb_set(meta, '{yigilgan}', to_jsonb(greatest(0, coalesce((meta->>'yigilgan')::numeric,0) + $2))), updated_at = now() where id = $1 and tur = 'maqsad' returning (meta->>'yigilgan')::float yigilgan, summa::float maqsad`, [id, summa]);
  if (!r.length) throw new Error("Maqsad topilmadi");
  if (r[0].maqsad && r[0].yigilgan >= r[0].maqsad) await q(`update elementlar set holat = 'bajarildi', bajarildi_at = now() where id = $1`, [id]);
  return { ok: true, yigilgan: r[0].yigilgan };
}

// ---------- kundalik ----------
export async function kundalikSaqla(sana: string, x: { kayfiyat?: number | null; matn?: string | null }) {
  await q(
    `insert into kundalik (sana, kayfiyat, matn) values ($1, $2, $3)
     on conflict (sana) do update set kayfiyat = coalesce($2, kundalik.kayfiyat), matn = coalesce($3, kundalik.matn), updated_at = now()`,
    [sana, x.kayfiyat ?? null, x.matn ?? null],
  );
  return { ok: true };
}

// ---------- sohalarni boshqarish ----------
export async function sohaSaqla(id: string | null, x: { nom?: string; rang?: string; ikon?: string; izoh?: string; arxiv?: boolean }) {
  if (id) {
    await q(`update sohalar set nom = coalesce($2, nom), rang = coalesce($3, rang), ikon = coalesce($4, ikon), izoh = coalesce($5, izoh), arxiv = coalesce($6, arxiv) where id = $1`, [id, x.nom ?? null, x.rang ?? null, x.ikon ?? null, x.izoh ?? null, x.arxiv ?? null]);
    return { id };
  }
  if (!x.nom?.trim()) throw new Error("Soha nomini yozing");
  const yangi = "s" + Date.now().toString(36);
  await q(`insert into sohalar (id, nom, rang, ikon, tartib) values ($1, $2, $3, $4, (select coalesce(max(tartib),0)+1 from sohalar))`, [yangi, x.nom.trim(), x.rang ?? "ish", x.ikon ?? "list"]);
  return { id: yangi };
}

// ---------- fayllar ----------
export async function faylQosh(elementId: string, f: { tur: string; nom?: string | null; hajm?: number | null; file_id?: string | null; thumb_id?: string | null; tg_msg?: number | null; tg_bolim?: string | null; url?: string | null }) {
  await q(`insert into fayllar (element_id, tur, nom, hajm, file_id, thumb_id, tg_msg, tg_bolim, url) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [elementId, f.tur, f.nom ?? null, f.hajm ?? null, f.file_id ?? null, f.thumb_id ?? null, f.tg_msg ?? null, f.tg_bolim ?? null, f.url ?? null]);
  await q(`update elementlar set updated_at = now() where id = $1`, [elementId]);
}
export async function faylOchir(id: string) {
  await q(`delete from fayllar where id = $1`, [id]);
  return { ok: true };
}
