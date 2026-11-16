// "Ko'rish va o'rganish" rejimi: kurslar, darslar, Notion sahifalarini o'qish, loyiha sahifasi, qidiruv.
// Kurs manbalari: O'qitish moduli (darslari bilan), TATU fani (topshiriqlari bilan), O'rganish ro'yxati (darslari bilan).

import { BOLIMLAR, royxat, saqla } from "./bolimlar";
import { sahifaOl, bolalarOl, bloklarQosh, sarlavha, dsId, sorovHammasi, qidir, YOZUVLAR, LOYIHALAR } from "./notion";
import { bloklardanMedia, mediaRoyxati, telegram, type MediaItem } from "./media";
import { tgFaylOqi } from "./arxiv";
import { tgFaylMatn } from "./notion";
import { sahifaTekshir } from "./ilova";

const norm = (s: string | null | undefined) => (s ?? "").replace(/-/g, "");

// ---------- Notion bloklarini o'qiladigan ko'rinishga ----------
type Seg = { x: string; b?: 1; i?: 1; c?: 1; s?: 1; u?: 1; h?: string };
export type Blok =
  | { t: "p" | "h1" | "h2" | "h3" | "li" | "oli" | "quote"; r: Seg[]; c?: Blok[] }
  | { t: "todo"; r: Seg[]; done: boolean }
  | { t: "callout"; r: Seg[]; icon?: string; c?: Blok[] }
  | { t: "toggle"; r: Seg[]; c: Blok[] }
  | { t: "code"; x: string; lang?: string }
  | { t: "hr" }
  | { t: "sahifa"; id: string; nom: string }
  | { t: "media"; m: MediaItem };
export type Qayd = { id: string; vaqt: number | null; matn: string };

const segmentlar = (rt: any[] = []): Seg[] =>
  rt.map((t) => {
    const a = t.annotations ?? {};
    const s: Seg = { x: t.plain_text ?? "" };
    if (a.bold) s.b = 1;
    if (a.italic) s.i = 1;
    if (a.code) s.c = 1;
    if (a.strikethrough) s.s = 1;
    if (a.underline) s.u = 1;
    const h = t.href ?? t.text?.link?.url;
    if (h) s.h = h;
    return s;
  });
const matnOl = (rt: any[] = []) => rt.map((t) => t.plain_text ?? "").join("");
const QAYD = /^📝\s*(?:\[(\d+):(\d{2})\]\s*)?/;
const MEDIA_TURLARI = new Set(["image", "video", "audio", "file", "pdf", "embed", "bookmark", "link_preview"]);

async function bloklarniOqi(pageId: string, asos: Omit<MediaItem, "key" | "tur" | "manba">, chuqurlik = 1, qaydlar?: Qayd[]): Promise<Blok[]> {
  const xom = await bolalarOl(pageId).catch(() => []);
  const r: Array<Blok | Promise<Blok | null> | null> = [];
  let ichki = 0;
  const bolalar = async (b: any) => (b.has_children && chuqurlik > 0 && ichki++ < 12 ? bloklarniOqi(b.id, asos, chuqurlik - 1) : undefined);
  for (const b of xom) {
    const x = b[b.type] ?? {};
    const rt = x.rich_text;
    switch (b.type) {
      case "paragraph": {
        const tg = (rt ?? []).some((t: any) => /t\.me\/c\/.+#pos=/.test(t.href ?? t.text?.link?.url ?? ""));
        // eski uslubdagi "Telegram arxivida ochish" havolasi — fayl "TG fayl" maydonidan ko'rsatiladi
        if (!tg && (rt ?? []).length === 1 && /^https:\/\/t\.me\/c\//.test(rt[0].href ?? "")) break;
        if (tg) {
          r.push(bloklardanMedia([b], pageId, asos).then((m) => (m[0] ? { t: "media", m: m[0] } : null)));
          break;
        }
        if (!matnOl(rt).trim()) break;
        r.push({ t: "p", r: segmentlar(rt) });
        break;
      }
      case "heading_1":
      case "heading_2":
      case "heading_3":
        r.push({ t: (["h1", "h2", "h3"] as const)[Number(b.type.slice(-1)) - 1], r: segmentlar(rt) });
        break;
      case "bulleted_list_item":
      case "numbered_list_item":
        r.push(bolalar(b).then((c) => ({ t: b.type[0] === "b" ? "li" : "oli", r: segmentlar(rt), ...(c?.length ? { c } : {}) })));
        break;
      case "to_do":
        r.push({ t: "todo", r: segmentlar(rt), done: Boolean(x.checked) });
        break;
      case "quote":
        r.push({ t: "quote", r: segmentlar(rt) });
        break;
      case "callout": {
        const m = matnOl(rt).match(QAYD);
        if (m && qaydlar) {
          qaydlar.push({ id: b.id, vaqt: m[1] ? Number(m[1]) * 60 + Number(m[2]) : null, matn: matnOl(rt).replace(QAYD, "") });
          break;
        }
        r.push(bolalar(b).then((c) => ({ t: "callout", r: segmentlar(rt), icon: x.icon?.emoji, ...(c?.length ? { c } : {}) })));
        break;
      }
      case "toggle":
        r.push(bolalar(b).then((c) => ({ t: "toggle", r: segmentlar(rt), c: c ?? [] })));
        break;
      case "code":
        r.push({ t: "code", x: matnOl(rt), lang: x.language });
        break;
      case "divider":
        r.push({ t: "hr" });
        break;
      case "child_page":
        r.push({ t: "sahifa", id: b.id, nom: x.title || "Sahifa" });
        break;
      default:
        if (MEDIA_TURLARI.has(b.type)) r.push(bloklardanMedia([b], pageId, asos).then((m) => (m[0] ? { t: "media", m: m[0] } : null)));
    }
  }
  return (await Promise.all(r)).filter(Boolean) as Blok[];
}

export async function kontent(pageId: string, nom: string) {
  const qaydlar: Qayd[] = [];
  const asos = { nom, sana: "", loyihalar: [] as string[], sahifa: pageId };
  const bloklar = await bloklarniOqi(pageId, asos, 1, qaydlar);
  return { bloklar, qaydlar };
}

// ---------- kurslar ----------
type Manba = "modul" | "fan" | "organish";
const DARS_BOLIMI: Record<Manba, string> = { modul: "dars", fan: "topshiriq", organish: "odars" };
type Dars = { id: string; nom: string; bolim: string; tartib: number | null; done: boolean; sana: string | null; soat: number | null; havola: string | null; tur?: string | null };

function darsga(manba: Manba, x: any): Dars {
  if (manba === "modul") return { id: x.id, nom: x.nom, bolim: x.bolim || "Darslar", tartib: x.tartib, done: x.holat === "O'tildi", sana: x.sana, soat: x.soat, havola: x.material, tur: x.guruh };
  if (manba === "fan") return { id: x.id, nom: x.nom, bolim: x.turi || "Topshiriqlar", tartib: null, done: x.holat === "Topshirildi", sana: x.muddat, soat: null, havola: null, tur: x.turi };
  return { id: x.id, nom: x.nom, bolim: x.bolim || "Darslar", tartib: x.tartib, done: x.holat === "Ko'rildi", sana: null, soat: null, havola: x.havola };
}
const tartibla = (a: Dars[]) =>
  a
    .map((d, i) => ({ d, i }))
    .sort((p, q) => (p.d.tartib ?? 1e9) - (q.d.tartib ?? 1e9) || (p.d.sana ?? "9999").localeCompare(q.d.sana ?? "9999") || p.i - q.i)
    .map((x) => x.d);

async function hammaMalumot() {
  const [modullar, darslar, fanlar, topsh, org, odars] = await Promise.all(
    ["modul", "dars", "fan", "topshiriq", "organish", "odars"].map((b) => royxat(b)),
  );
  const guruh = (rows: any[], kalit: string) => {
    const m = new Map<string, any[]>();
    for (const r of rows) {
      const k = norm(r[kalit]);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  };
  return { modullar, fanlar, org, dModul: guruh(darslar, "modul"), dFan: guruh(topsh, "fan"), dOrg: guruh(odars, "kurs") };
}

function kursKarta(manba: Manba, x: any, darslar: Dars[]) {
  const jami = darslar.length;
  const bitgan = darslar.filter((d) => d.done).length;
  if (manba === "modul") {
    const otilgan = darslar.filter((d) => d.done).reduce((s, d) => s + (d.soat ?? 0), 0);
    const [kod, ...qolgan] = String(x.nom).split(" ");
    return { key: `modul:${x.id}`, manba, id: x.id, kod: /\d/.test(kod) ? kod : "Modul", nom: /\d/.test(kod) ? qolgan.join(" ") || x.nom : x.nom, toliqNom: x.nom, meta: `O'qitish${x.soat ? ` · ${x.soat} soat` : ""}${x.yil ? ` · ${x.yil}` : ""}`, progress: x.soat ? Math.round((otilgan / x.soat) * 100) : jami ? Math.round((bitgan / jami) * 100) : 0, progressMatn: x.soat ? `${otilgan} / ${x.soat} soat` : `${bitgan} / ${jami} dars`, jami, bitgan };
  }
  if (manba === "fan")
    return { key: `fan:${x.id}`, manba, id: x.id, kod: "TATU", nom: x.nom, toliqNom: x.nom, meta: `TATU${x.semestr ? ` · ${x.semestr}-semestr` : " · sirtqi"}${x.baho ? ` · baho: ${x.baho}` : ""}`, progress: jami ? Math.round((bitgan / jami) * 100) : 0, progressMatn: `${bitgan} / ${jami} topshiriq`, jami, bitgan };
  const p = jami ? Math.round((bitgan / jami) * 100) : x.progress ?? 0;
  return { key: `organish:${x.id}`, manba, id: x.id, kod: (x.turi || "Kurs").replace(/'/g, "‘"), nom: x.nom, toliqNom: x.nom, meta: `O'rganish · ${x.turi || "Kurs"} · ${x.holat || "Rejada"}`, progress: p, progressMatn: jami ? `${bitgan} / ${jami} dars` : `${p}%`, jami, bitgan, havola: x.havola };
}

export async function kurslar() {
  const h = await hammaMalumot();
  const r = [
    ...h.modullar.map((m) => kursKarta("modul", m, (h.dModul.get(norm(m.id)) ?? []).map((d) => darsga("modul", d)))),
    ...h.fanlar.map((f) => kursKarta("fan", f, (h.dFan.get(norm(f.id)) ?? []).map((d) => darsga("fan", d)))),
    ...h.org.filter((o) => o.holat !== "To'xtatildi").map((o) => kursKarta("organish", o, (h.dOrg.get(norm(o.id)) ?? []).map((d) => darsga("organish", d)))),
  ];
  return r;
}

function kalitOch(key: string): { manba: Manba; id: string } {
  const [manba, id] = String(key).split(":");
  if (!["modul", "fan", "organish"].includes(manba) || !id) throw new Error("Noto'g'ri kurs");
  return { manba: manba as Manba, id };
}

async function kursDarslari(manba: Manba, id: string) {
  const [asosiy, darslar] = await Promise.all([
    royxat(manba === "modul" ? "modul" : manba).then((r) => r.find((x) => norm(x.id) === norm(id))),
    royxat(DARS_BOLIMI[manba]),
  ]);
  if (!asosiy) throw new Error("Kurs topilmadi");
  const kalit = manba === "modul" ? "modul" : manba === "fan" ? "fan" : "kurs";
  const d = tartibla(darslar.filter((x) => norm(x[kalit]) === norm(id)).map((x) => darsga(manba, x)));
  return { asosiy, darslar: d };
}

export async function kurs(key: string) {
  const { manba, id } = kalitOch(key);
  const [{ asosiy, darslar }, tavsif] = await Promise.all([kursDarslari(manba, id), kontent(id, "")]);
  const karta = kursKarta(manba, asosiy, darslar);
  const bolimlar: Array<{ nom: string; darslar: Dars[] }> = [];
  for (const d of darslar) {
    let b = bolimlar.find((x) => x.nom === d.bolim);
    if (!b) bolimlar.push((b = { nom: d.bolim, darslar: [] }));
    b.darslar.push(d);
  }
  return { ...karta, bolimlar, tavsif: tavsif.bloklar, birinchi: darslar.find((d) => !d.done)?.id ?? darslar[0]?.id ?? null };
}

export async function dars(key: string, darsId: string) {
  const { manba, id } = kalitOch(key);
  const { asosiy, darslar } = await kursDarslari(manba, id);
  const i = darslar.findIndex((d) => norm(d.id) === norm(darsId));
  if (i < 0) throw new Error("Dars topilmadi");
  const d = darslar[i];
  const k = await kontent(d.id, d.nom);
  const karta = kursKarta(manba, asosiy, darslar);
  return {
    kurs: { key, nom: karta.toliqNom, kod: karta.kod, manba },
    dars: { ...d, raqam: i + 1, jami: darslar.length },
    oldingi: darslar[i - 1]?.id ?? null,
    keyingi: darslar[i + 1]?.id ?? null,
    bloklar: k.bloklar,
    qaydlar: k.qaydlar,
  };
}

// Dars o'tildi/ko'rildi; O'rganish kursida progress va holat avtomatik
export async function darsHolat(key: string, darsId: string, done: boolean) {
  const { manba, id } = kalitOch(key);
  const holat = manba === "modul" ? (done ? "O'tildi" : "Rejada") : manba === "fan" ? (done ? "Topshirildi" : "Qilinmagan") : done ? "Ko'rildi" : "Ko'rilmagan";
  await saqla(DARS_BOLIMI[manba], darsId, { holat });
  if (manba === "organish") {
    const { darslar } = await kursDarslari(manba, id);
    const bitgan = darslar.filter((d) => (norm(d.id) === norm(darsId) ? done : d.done)).length;
    const p = darslar.length ? Math.round((bitgan / darslar.length) * 100) : 0;
    await saqla("organish", id, { progress: p, holat: p >= 100 ? "Tugadi" : p > 0 ? "Jarayonda" : "Rejada" });
  }
  return { ok: true };
}

// Darsga (yoki istalgan sahifaga) qayd: "📝 [m:ss] matn" callout bloki
export async function qaydQosh(pageId: string, matn: string, vaqt?: number | null) {
  const page = await sahifaTekshir(pageId);
  const t = String(matn || "").trim();
  if (!t) throw new Error("Qayd bo'sh");
  const v = vaqt != null && vaqt >= 0 ? `[${Math.floor(vaqt / 60)}:${String(Math.floor(vaqt % 60)).padStart(2, "0")}] ` : "";
  await bloklarQosh(page.id, [{ object: "block", type: "callout", callout: { rich_text: [{ type: "text", text: { content: `📝 ${v}${t}`.slice(0, 2000) } }], icon: { type: "emoji", emoji: "📝" }, color: "gray_background" } }]);
  return { ok: true };
}

// ---------- umumiy o'qish sahifasi ----------
const BOLIM_NOMI = () => {
  const m = new Map<string, string>([
    [norm(process.env.YOZUVLAR_DS_ID), "Yozuv"],
    [norm(process.env.LOYIHALAR_DS_ID), "Loyiha"],
    [norm(process.env.MOLIYA_DS_ID), "Moliya"],
  ]);
  const nom: Record<string, string> = { organish: "O'rganish", odars: "Dars", fan: "TATU fani", topshiriq: "TATU topshirig'i", modul: "O'qitish moduli", dars: "Dars", qarz: "Qarz", jamgarma: "Jamg'arma", doimiy: "Doimiy to'lov", moliya: "Moliya", yozuv: "Yozuv" };
  for (const [k, b] of Object.entries(BOLIMLAR)) if (!m.has(norm(b.ds))) m.set(norm(b.ds), nom[k] ?? k);
  return m;
};

function xususiyatlar(page: any): Array<[string, string]> {
  const r: Array<[string, string]> = [];
  const SKIP = new Set(["Nomi", "TG fayl", "TG guruh", "Media soni", "Yaratildi", "Vazifa", "Bajarildi", "Ochiq", "Kechikkan"]);
  for (const [k, v] of Object.entries<any>(page.properties ?? {})) {
    if (SKIP.has(k)) continue;
    let s = "";
    if (v.type === "select") s = v.select?.name ?? "";
    else if (v.type === "multi_select") s = (v.multi_select ?? []).map((x: any) => x.name).join(", ");
    else if (v.type === "date") s = v.date?.start?.slice(0, 10) ?? "";
    else if (v.type === "number") s = v.number != null ? v.number.toLocaleString("ru-RU") : "";
    else if (v.type === "url") s = v.url ?? "";
    else if (v.type === "rich_text") s = matnOl(v.rich_text);
    else if (v.type === "checkbox") s = v.checkbox ? "Ha" : "";
    if (s) r.push([k, s]);
  }
  return r.slice(0, 10);
}

export async function sahifa(id: string) {
  const page = await sahifaTekshir(id);
  const nom = sarlavha(page);
  const k = await kontent(page.id, nom);
  // "TG fayl" maydonidagi (Telegram arxividagi) fayllar ham ko'rinsin
  const bor = new Set(k.bloklar.filter((b) => b.t === "media").map((b: any) => b.m.key));
  const asos = { nom, sana: page.created_time, loyihalar: [] as string[], sahifa: page.id };
  const tgM = tgFaylOqi(tgFaylMatn(page)).map((f) => telegram(f, asos)).filter((m): m is MediaItem => Boolean(m) && !bor.has(m!.key));
  k.bloklar.unshift(...tgM.map((m) => ({ t: "media" as const, m })));
  const d = dsId(page);
  const bolimKey = d === norm(LOYIHALAR()) ? "loyiha" : (Object.entries(BOLIMLAR).find(([, b]) => norm(b.ds) === d)?.[0] ?? null);
  return { id: page.id, nom, bolimKey, bolim: BOLIM_NOMI().get(d) ?? "", props: xususiyatlar(page), bloklar: k.bloklar, qaydlar: k.qaydlar, yaratildi: page.created_time };
}

// ---------- loyiha sahifasi ----------
export async function loyihaSahifa(id: string) {
  const page = await sahifaOl(id);
  if (dsId(page) !== norm(LOYIHALAR())) throw new Error("Loyiha topilmadi");
  const nom = sarlavha(page);
  const pr = page.properties ?? {};
  const son = (k: string) => pr[k]?.number ?? pr[k]?.rollup?.number ?? pr[k]?.formula?.number ?? 0;
  const [yozuvlar, k, media] = await Promise.all([
    sorovHammasi(YOZUVLAR(), { filter: { property: "Loyiha", relation: { contains: page.id } }, sorts: [{ timestamp: "created_time", direction: "descending" }] }, 200),
    kontent(page.id, nom),
    mediaRoyxati().then((m) => m.items.filter((x) => x.loyihalar.includes(norm(page.id)))).catch(() => [] as MediaItem[]),
  ]);
  const yoz = yozuvlar.map((y) => ({ id: y.id, nom: sarlavha(y), turi: y.properties?.Turi?.select?.name ?? null, holat: y.properties?.Holat?.select?.name ?? null, muddat: y.properties?.Muddat?.date?.start?.slice(0, 10) ?? null }));
  return {
    id: page.id,
    nom,
    holat: pr.Holat?.select?.name ?? null,
    sayt: pr.Sayt?.url ?? null,
    reliz: pr["Reliz sanasi"]?.date?.start?.slice(0, 10) ?? null,
    obunachi: son("Telegram obunachi") + son("Instagram obunachi"),
    tg: son("Telegram obunachi"),
    ig: son("Instagram obunachi"),
    mijoz: son("Real mijozlar"),
    maqsadda: Boolean(pr.Maqsadda?.checkbox),
    keyingi: matnOl(pr["Keyingi qadam"]?.rich_text),
    vazifalar: yoz.filter((y) => y.turi === "Vazifa"),
    hujjatlar: yoz.filter((y) => y.turi !== "Vazifa"),
    media,
    bloklar: k.bloklar,
  };
}

export async function loyihalarRoyxati() {
  const r = await sorovHammasi(LOYIHALAR(), { sorts: [{ property: "Nomi", direction: "ascending" }] }, 50);
  const tartib = ["Faol", "Relizda", "Ikkinchi darajali", "Pauza", "Qiziqish", "Arxiv"];
  return r
    .map((l) => ({ id: l.id, nom: sarlavha(l), holat: l.properties?.Holat?.select?.name ?? null, media: l.properties?.["Media soni"]?.number ?? 0, sayt: l.properties?.Sayt?.url ?? null }))
    .sort((a, b) => (tartib.indexOf(a.holat ?? "") + 1 || 99) - (tartib.indexOf(b.holat ?? "") + 1 || 99));
}

// ---------- kutubxona (bosh sahifa) ----------
export async function kutubxona() {
  const [k, l, m] = await Promise.all([kurslar(), loyihalarRoyxati(), mediaRoyxati().catch(() => ({ items: [] as MediaItem[], loyihalar: [] }))]);
  return { kurslar: k, loyihalar: l.filter((x) => ["Faol", "Relizda", "Ikkinchi darajali"].includes(x.holat ?? "")), media: m.items.filter((x) => !x.sayt).slice(0, 6), mediaLoyihalar: m.loyihalar };
}

// ---------- qidiruv ----------
export async function qidiruv(q: string) {
  const s = String(q || "").trim();
  if (s.length < 2) return { natija: [] };
  const [natija, darslar, topsh, odars] = await Promise.all([qidir(s), royxat("dars"), royxat("topshiriq"), royxat("odars")]);
  const nomlar = BOLIM_NOMI();
  const ds = (k: string) => norm(BOLIMLAR[k].ds);
  const xarita = new Map<string, string>();
  for (const d of darslar) if (d.modul) xarita.set(norm(d.id), `modul:${d.modul}`);
  for (const t of topsh) if (t.fan) xarita.set(norm(t.id), `fan:${t.fan}`);
  for (const o of odars) if (o.kurs) xarita.set(norm(o.id), `organish:${o.kurs}`);
  return {
    natija: natija
      .filter((p) => nomlar.has(dsId(p)) && !p.in_trash)
      .map((p) => {
        const d = dsId(p);
        const tur = d === norm(LOYIHALAR()) ? "loyiha" : d === ds("modul") ? "kurs:modul" : d === ds("fan") ? "kurs:fan" : d === ds("organish") ? "kurs:organish" : xarita.has(norm(p.id)) ? "dars" : "sahifa";
        return { id: p.id, nom: sarlavha(p), bolim: nomlar.get(d), tur, kurs: xarita.get(norm(p.id)) ?? null };
      }),
  };
}
