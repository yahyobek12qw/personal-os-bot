// Yangi bo'limlar: Moliya markazi (byudjet, doimiy to'lovlar, qarzlar, jamg'arma),
// O'qish (TATU), O'rganish va qiziqishlar, O'qitish (texnikum).
// Har bir bo'lim — bitta Notion bazasi; maydonlar shu yerda tasvirlangan va
// ilova bilan oddiy obyektlar ({id, nom, summa, ...}) orqali almashiladi.

import { KATEGORIYALAR, kunQosh } from "./parse";
import { moliyaQosh, oyMoliyasi, sahifaOl, sahifaYarat, sarlavha, sorovHammasi, yangila, ochir, dsId } from "./notion";

type Tur = "title" | "number" | "select" | "date" | "text" | "url" | "checkbox" | "relation";
type Maydon = { n: string; t: Tur; v?: readonly string[] };
type Bolim = { ds: string; f: Record<string, Maydon> };

const KAT = KATEGORIYALAR as readonly string[];
const nom: Maydon = { n: "Nomi", t: "title" };

export const BOLIMLAR: Record<string, Bolim> = {
  moliya: {
    ds: "08950b6d-7fa9-417b-8321-e00881130ad1",
    f: {
      nom,
      summa: { n: "Summa", t: "number" },
      turi: { n: "Turi", t: "select", v: ["Daromad", "Xarajat"] },
      kategoriya: { n: "Kategoriya", t: "select", v: KAT },
      sana: { n: "Sana", t: "date" },
      media: { n: "Media soni", t: "number" },
    },
  },
  yozuv: {
    ds: "eb946a25-9f8f-49bd-adf6-c2059194a6a6",
    f: {
      nom,
      turi: { n: "Turi", t: "select", v: ["Saralanmagan", "Vazifa", "G'oya", "Qayd", "Havola", "Qaror", "Uchrashuv"] },
      holat: { n: "Holat", t: "select", v: ["Kutilmoqda", "Jarayonda", "Bajarildi", "Bekor"] },
      muddat: { n: "Muddat", t: "date" },
      loyiha: { n: "Loyiha", t: "relation" },
      havola: { n: "Havola", t: "url" },
      media: { n: "Media soni", t: "number" },
    },
  },
  byudjet: { ds: "df13fe50-4ff8-494e-868c-5af6cfe9bbe9", f: { nom, limit: { n: "Limit", t: "number" } } },
  doimiy: {
    ds: "b46e3a01-d4b9-49a3-a1da-7ccb86c06f61",
    f: {
      nom,
      summa: { n: "Summa", t: "number" },
      turi: { n: "Turi", t: "select", v: ["Daromad", "Xarajat"] },
      kun: { n: "Kun", t: "number" },
      kategoriya: { n: "Kategoriya", t: "select", v: KAT },
      faol: { n: "Faol", t: "checkbox" },
      oxirgi: { n: "Oxirgi", t: "date" },
    },
  },
  qarz: {
    ds: "1291257f-a274-413e-9854-eca3a47963f9",
    f: {
      nom,
      summa: { n: "Summa", t: "number" },
      yonalish: { n: "Yo'nalish", t: "select", v: ["Men berdim", "Men oldim"] },
      sana: { n: "Sana", t: "date" },
      qaytarish: { n: "Qaytarish", t: "date" },
      holat: { n: "Holat", t: "select", v: ["Ochiq", "Qaytdi"] },
      izoh: { n: "Izoh", t: "text" },
    },
  },
  jamgarma: {
    ds: "ee334872-fa37-40ae-9b35-cfec9b83b5cd",
    f: {
      nom,
      maqsad: { n: "Maqsad", t: "number" },
      yigilgan: { n: "Yig'ilgan", t: "number" },
      muddat: { n: "Muddat", t: "date" },
      holat: { n: "Holat", t: "select", v: ["Faol", "Erishildi"] },
    },
  },
  fan: {
    ds: "f001fd8b-ea47-4088-96fa-0dba3fe21641",
    f: {
      nom,
      semestr: { n: "Semestr", t: "number" },
      oqituvchi: { n: "O'qituvchi", t: "text" },
      holat: { n: "Holat", t: "select", v: ["O'qilmoqda", "Tugagan"] },
      baho: { n: "Baho", t: "text" },
    },
  },
  topshiriq: {
    ds: "8829871c-937c-440a-bcfd-00a94801dfee",
    f: {
      nom,
      fan: { n: "Fan", t: "relation" },
      turi: { n: "Turi", t: "select", v: ["Mustaqil ish", "Amaliy", "Laboratoriya", "Oraliq nazorat", "Yakuniy nazorat", "Boshqa"] },
      muddat: { n: "Muddat", t: "date" },
      holat: { n: "Holat", t: "select", v: ["Qilinmagan", "Jarayonda", "Topshirildi"] },
      ball: { n: "Ball", t: "number" },
    },
  },
  organish: {
    ds: "a5412577-a8cd-4ffa-86bb-c64876c33367",
    f: {
      nom,
      turi: { n: "Turi", t: "select", v: ["Kurs", "Kitob", "Video", "Ko'nikma", "Qiziqish", "Boshqa"] },
      holat: { n: "Holat", t: "select", v: ["Rejada", "Jarayonda", "Tugadi", "To'xtatildi"] },
      progress: { n: "Progress", t: "number" },
      havola: { n: "Havola", t: "url" },
      izoh: { n: "Izoh", t: "text" },
    },
  },
  modul: {
    ds: "f6386529-cf99-440e-8c10-0a1ba865ecf9",
    f: { nom, soat: { n: "Jami soat", t: "number" }, yil: { n: "O'quv yili", t: "text" } },
  },
  dars: {
    ds: "37ede4cd-caf6-4b92-b1e2-a967c1e784e6",
    f: {
      nom,
      modul: { n: "Modul", t: "relation" },
      guruh: { n: "Guruh", t: "text" },
      sana: { n: "Sana", t: "date" },
      soat: { n: "Soat", t: "number" },
      holat: { n: "Holat", t: "select", v: ["Rejada", "O'tildi"] },
      material: { n: "Material", t: "url" },
      bolim: { n: "Bo'lim", t: "text" },
      tartib: { n: "Tartib", t: "number" },
    },
  },
  odars: {
    ds: "04b32c76-af45-4654-b2cc-3d99925874cf",
    f: {
      nom,
      kurs: { n: "Kurs", t: "relation" },
      bolim: { n: "Bo'lim", t: "text" },
      tartib: { n: "Tartib", t: "number" },
      holat: { n: "Holat", t: "select", v: ["Ko'rilmagan", "Ko'rildi"] },
      havola: { n: "Havola", t: "url" },
    },
  },
};

// ---------- Notion <-> oddiy obyekt ----------

function qiymat(page: any, m: Maydon): unknown {
  const x = page?.properties?.[m.n];
  if (!x) return null;
  switch (m.t) {
    case "title":
      return sarlavha(page);
    case "number":
      return x.number ?? null;
    case "select":
      return x.select?.name ?? null;
    case "date":
      return x.date?.start?.slice(0, 10) ?? null;
    case "text":
      return (x.rich_text ?? []).map((t: any) => t.plain_text).join("");
    case "url":
      return x.url ?? null;
    case "checkbox":
      return Boolean(x.checkbox);
    case "relation":
      return x.relation?.[0]?.id ?? null;
  }
}

export function oqi(bolim: string, page: any): any {
  const o: Record<string, any> = { id: page.id };
  for (const [k, m] of Object.entries(BOLIMLAR[bolim].f)) o[k] = qiymat(page, m);
  return o;
}

const rt = (s: string) => [{ type: "text", text: { content: s.slice(0, 2000) } }];

function xususiyatlar(bolim: string, q: Record<string, any>) {
  const props: Record<string, unknown> = {};
  for (const [k, m] of Object.entries(BOLIMLAR[bolim].f)) {
    if (!(k in q)) continue;
    const v = q[k];
    const bosh = v === null || v === undefined || v === "";
    switch (m.t) {
      case "title":
        if (bosh || !String(v).trim()) throw new Error("Nomini kiriting");
        props[m.n] = { title: rt(String(v).trim()) };
        break;
      case "number": {
        const n = bosh ? null : Number(String(v).replace(/[^\d.\-]/g, ""));
        props[m.n] = { number: n === null || Number.isNaN(n) ? null : n };
        break;
      }
      case "select":
        if (!bosh && m.v && !m.v.includes(String(v))) throw new Error(`Noto'g'ri qiymat: ${v}`);
        props[m.n] = { select: bosh ? null : { name: String(v) } };
        break;
      case "date":
        if (!bosh && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error("Sana noto'g'ri");
        props[m.n] = { date: bosh ? null : { start: String(v) } };
        break;
      case "text":
        props[m.n] = { rich_text: bosh ? [] : rt(String(v)) };
        break;
      case "url":
        props[m.n] = { url: bosh ? null : String(v).trim() };
        break;
      case "checkbox":
        props[m.n] = { checkbox: Boolean(v) };
        break;
      case "relation":
        props[m.n] = { relation: bosh ? [] : [{ id: String(v) }] };
        break;
    }
  }
  return props;
}

function bolimOl(bolim: string): Bolim {
  const b = BOLIMLAR[bolim];
  if (!b) throw new Error("Noma'lum bo'lim");
  return b;
}

export async function royxat(bolim: string): Promise<any[]> {
  const b = bolimOl(bolim);
  const r = await sorovHammasi(b.ds, { sorts: [{ timestamp: "created_time", direction: "ascending" }] }, 500);
  return r.map((x) => oqi(bolim, x));
}

// Yangi qo'shish yoki tahrirlash
export async function saqla(bolim: string, id: string | undefined, q: Record<string, any>) {
  const b = bolimOl(bolim);
  if (id) {
    await tekshir(bolim, id);
    const page = await yangila(id, xususiyatlar(bolim, q));
    return oqi(bolim, page);
  }
  const boshlangich: Record<string, any> = {};
  if (bolim === "doimiy") boshlangich.faol = true;
  if (bolim === "qarz") boshlangich.holat = "Ochiq";
  if (bolim === "jamgarma") Object.assign(boshlangich, { holat: "Faol", yigilgan: 0 });
  if (bolim === "fan") boshlangich.holat = "O'qilmoqda";
  if (bolim === "topshiriq") boshlangich.holat = "Qilinmagan";
  if (bolim === "organish") Object.assign(boshlangich, { holat: "Rejada", progress: 0 });
  if (bolim === "dars") boshlangich.holat = "Rejada";
  if (bolim === "odars") boshlangich.holat = "Ko'rilmagan";
  const page = await sahifaYarat(b.ds, xususiyatlar(bolim, { ...boshlangich, ...q }));
  return oqi(bolim, page);
}

// Faqat shu bo'limning sahifasini o'zgartirish/o'chirishga ruxsat
async function tekshir(bolim: string, id: string) {
  const page = await sahifaOl(id);
  if (dsId(page) !== bolimOl(bolim).ds.replace(/-/g, "")) throw new Error("Bu yozuv boshqa bo'limga tegishli");
  return page;
}

export async function bittaOl(bolim: string, id: string) {
  return oqi(bolim, await tekshir(bolim, id));
}

export async function olibTashla(bolim: string, id: string) {
  await tekshir(bolim, id);
  await ochir(id);
}

// ---------- Moliya markazi ----------

const oyOxiri = (oy: string) => {
  const [y, m] = oy.split("-").map(Number);
  return `${oy}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const kunlarFarqi = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function doimiyHolat(d: any, bugun: string) {
  const oy = bugun.slice(0, 7);
  const oxiri = oyOxiri(oy);
  const kun = Math.min(Math.max(1, Number(d.kun) || 1), Number(oxiri.slice(8)));
  const muddat = `${oy}-${String(kun).padStart(2, "0")}`;
  const tolangan = Boolean(d.oxirgi && d.oxirgi >= `${oy}-01`);
  const holat = tolangan ? "tolandi" : muddat < bugun ? "kechikdi" : muddat === bugun ? "bugun" : "kutilmoqda";
  return { ...d, muddat, holat, qoldi: kunlarFarqi(bugun, muddat) };
}

export async function oyXulosasi(oy: string) {
  const yozuvlar = await oyMoliyasi(`${oy}-01`, oyOxiri(oy));
  let daromad = 0;
  let xarajat = 0;
  const kat = new Map<string, number>();
  for (const x of yozuvlar) {
    const s = x.properties?.Summa?.number ?? 0;
    if (x.properties?.Turi?.select?.name === "Daromad") daromad += s;
    else {
      xarajat += s;
      const k = x.properties?.Kategoriya?.select?.name ?? "Kategoriyasiz";
      kat.set(k, (kat.get(k) ?? 0) + s);
    }
  }
  return { yozuvlar, daromad, xarajat, kat };
}

export async function moliyaMarkazi(bugun: string) {
  const oy = bugun.slice(0, 7);
  const [xulosa, byudjet, doimiy, qarzlar, jamgarma] = await Promise.all([
    oyXulosasi(oy),
    royxat("byudjet"),
    royxat("doimiy"),
    royxat("qarz"),
    royxat("jamgarma"),
  ]);
  const ochiq = qarzlar.filter((q) => q.holat !== "Qaytdi");
  const tartib = { kechikdi: 0, bugun: 1, kutilmoqda: 2, tolandi: 3 } as Record<string, number>;
  return {
    xulosa,
    byudjet: byudjet
      .map((b) => {
        const sarf = xulosa.kat.get(b.nom) ?? 0;
        return { ...b, sarf, qoldi: b.limit ? b.limit - sarf : null };
      })
      .sort((a, b) => (b.limit ? 1 : 0) - (a.limit ? 1 : 0) || b.sarf - a.sarf),
    doimiy: doimiy
      .filter((d) => d.faol)
      .map((d) => doimiyHolat(d, bugun))
      .sort((a, b) => tartib[a.holat] - tartib[b.holat] || a.muddat.localeCompare(b.muddat)),
    doimiyNofaol: doimiy.filter((d) => !d.faol),
    qarzlar: [...ochiq.sort((a, b) => (a.qaytarish ?? "9999") .localeCompare(b.qaytarish ?? "9999")), ...qarzlar.filter((q) => q.holat === "Qaytdi").reverse().slice(0, 10)],
    menga: ochiq.filter((q) => q.yonalish === "Men berdim").reduce((s, q) => s + (q.summa ?? 0), 0),
    mendan: ochiq.filter((q) => q.yonalish === "Men oldim").reduce((s, q) => s + (q.summa ?? 0), 0),
    jamgarma: jamgarma.sort((a, b) => (a.holat === "Erishildi" ? 1 : 0) - (b.holat === "Erishildi" ? 1 : 0)),
  };
}

// Doimiy to'lov/daromad bajarildi: Moliya'ga yozuv + "Oxirgi" sanasi
export async function tolandi(id: string, bugun: string, summa?: number) {
  const d = oqi("doimiy", await tekshir("doimiy", id));
  const s = summa && summa > 0 ? summa : d.summa;
  if (!s) throw new Error("Summa kiritilmagan");
  await moliyaQosh({ turi: d.turi ?? "Xarajat", summa: s, nomi: d.nom, kategoriya: d.kategoriya ?? undefined, sana: bugun });
  await yangila(id, { Oxirgi: { date: { start: bugun } } });
  return { ok: true };
}

// Jamg'armaga qo'shish (manfiy summa — olish)
export async function jamgarmaQosh(id: string, summa: number) {
  if (!summa) throw new Error("Summani kiriting");
  const j = oqi("jamgarma", await tekshir("jamgarma", id));
  const yangi = Math.max(0, (j.yigilgan ?? 0) + summa);
  const props: Record<string, unknown> = { "Yig'ilgan": { number: yangi } };
  if (j.maqsad) props.Holat = { select: { name: yangi >= j.maqsad ? "Erishildi" : "Faol" } };
  await yangila(id, props);
  return { ok: true, yigilgan: yangi };
}

// ---------- O'qish (TATU) ----------

export async function oqishBolimi(bugun: string) {
  const [fanlar, topshiriqlar] = await Promise.all([royxat("fan"), royxat("topshiriq")]);
  const fanNomi = new Map(fanlar.map((f) => [f.id.replace(/-/g, ""), f.nom]));
  const t = topshiriqlar.map((x) => ({
    ...x,
    fanNomi: x.fan ? fanNomi.get(x.fan.replace(/-/g, "")) ?? null : null,
    kechikkan: Boolean(x.muddat && x.muddat < bugun && x.holat !== "Topshirildi"),
  }));
  const ochiq = t.filter((x) => x.holat !== "Topshirildi").sort((a, b) => (a.muddat ?? "9999").localeCompare(b.muddat ?? "9999"));
  const tugagan = t.filter((x) => x.holat === "Topshirildi").reverse();
  return {
    fanlar: fanlar.map((f) => ({ ...f, ochiq: t.filter((x) => x.fan?.replace(/-/g, "") === f.id.replace(/-/g, "") && x.holat !== "Topshirildi").length })),
    topshiriqlar: [...ochiq, ...tugagan],
  };
}

// ---------- O'rganish ----------

export async function organishBolimi() {
  const r = await royxat("organish");
  const tartib = ["Jarayonda", "Rejada", "Tugadi", "To'xtatildi"];
  return { royxat: r.sort((a, b) => tartib.indexOf(a.holat) - tartib.indexOf(b.holat)) };
}

// ---------- O'qitish ----------

export async function oqitishBolimi(bugun: string) {
  const [modullar, darslar] = await Promise.all([royxat("modul"), royxat("dars")]);
  const k = (s: string | null) => (s ?? "").replace(/-/g, "");
  const modulNomi = new Map(modullar.map((m) => [k(m.id), m.nom]));
  const d = darslar.map((x) => ({ ...x, modulNomi: modulNomi.get(k(x.modul)) ?? null }));
  return {
    modullar: modullar.map((m) => {
      const bu = d.filter((x) => k(x.modul) === k(m.id));
      return {
        ...m,
        otilgan: bu.filter((x) => x.holat === "O'tildi").reduce((s, x) => s + (x.soat ?? 0), 0),
        rejada: bu.filter((x) => x.holat !== "O'tildi").reduce((s, x) => s + (x.soat ?? 0), 0),
        darslar: bu.length,
      };
    }),
    keyingi: d.filter((x) => x.holat !== "O'tildi").sort((a, b) => (a.sana ?? "9999").localeCompare(b.sana ?? "9999")),
    otilgan: d.filter((x) => x.holat === "O'tildi").sort((a, b) => (b.sana ?? "").localeCompare(a.sana ?? "")).slice(0, 20),
  };
}

// ---------- Eslatmalar (Bugun ekrani va kechki xabar) ----------

export type Eslatma = { bolim: string; belgi: string; matn: string; izoh: string; kechikkan: boolean; sana: string | null };

export async function eslatmalar(bugun: string): Promise<Eslatma[]> {
  const [doimiy, qarzlar, topsh, darslar, fanlar] = await Promise.all([
    royxat("doimiy"),
    royxat("qarz"),
    royxat("topshiriq"),
    royxat("dars"),
    royxat("fan"),
  ]);
  const f = (n: number) => n.toLocaleString("ru-RU");
  const fanNomi = new Map(fanlar.map((x) => [x.id.replace(/-/g, ""), x.nom]));
  const r: Eslatma[] = [];
  for (const t of topsh) {
    if (t.holat === "Topshirildi" || !t.muddat || t.muddat > kunQosh(bugun, 7)) continue;
    const fan = t.fan ? fanNomi.get(t.fan.replace(/-/g, "")) : null;
    r.push({ bolim: "oqish", belgi: "🎓", matn: t.nom, izoh: [t.turi, fan].filter(Boolean).join(" · "), kechikkan: t.muddat < bugun, sana: t.muddat });
  }
  for (const d of doimiy.filter((x) => x.faol).map((x) => doimiyHolat(x, bugun))) {
    if (d.holat === "tolandi" || d.qoldi > 3) continue;
    r.push({ bolim: "pul", belgi: d.turi === "Daromad" ? "💰" : "🔁", matn: d.nom, izoh: d.summa ? `${f(d.summa)} so'm` : "", kechikkan: d.holat === "kechikdi", sana: d.muddat });
  }
  for (const q of qarzlar) {
    if (q.holat === "Qaytdi" || !q.qaytarish || q.qaytarish > kunQosh(bugun, 3)) continue;
    const kim = q.yonalish === "Men oldim" ? "Qarzni qaytarish" : "Qarzni olish";
    r.push({ bolim: "pul", belgi: "🤝", matn: `${kim}: ${q.nom}`, izoh: q.summa ? `${f(q.summa)} so'm` : "", kechikkan: q.qaytarish < bugun, sana: q.qaytarish });
  }
  for (const d of darslar) {
    if (d.holat === "O'tildi" || !d.sana || d.sana < bugun || d.sana > kunQosh(bugun, 1)) continue;
    r.push({ bolim: "oqitish", belgi: "👨‍🏫", matn: d.nom, izoh: [d.guruh, d.soat ? `${d.soat} soat` : ""].filter(Boolean).join(" · "), kechikkan: false, sana: d.sana });
  }
  return r.sort((a, b) => (a.sana ?? "").localeCompare(b.sana ?? ""));
}

// ---------- Oylik hisobot (bot) ----------

export async function oylikHisobot(oy: string) {
  const [x, byudjet, qarzlar, jamgarma] = await Promise.all([oyXulosasi(oy), royxat("byudjet"), royxat("qarz"), royxat("jamgarma")]);
  const f = (n: number) => n.toLocaleString("ru-RU");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const q: string[] = [
    `📊 <b>${oy} oyi hisoboti</b>`,
    "",
    `💰 Daromad: <b>${f(x.daromad)}</b> so'm`,
    `💸 Xarajat: <b>${f(x.xarajat)}</b> so'm`,
    `📈 Balans: <b>${x.daromad - x.xarajat >= 0 ? "+" : ""}${f(x.daromad - x.xarajat)}</b> so'm`,
  ];
  if (x.kat.size) {
    const limit = new Map(byudjet.map((b) => [b.nom, b.limit as number | null]));
    q.push("", "<b>Xarajatlar:</b>");
    for (const [k, s] of [...x.kat.entries()].sort((a, b) => b[1] - a[1])) {
      const l = limit.get(k);
      const belgi = l ? (s > l ? " 🔴" : s > l * 0.8 ? " 🟡" : " 🟢") : "";
      q.push(`• ${esc(k)}: ${f(s)}${l ? ` / ${f(l)}` : ""}${belgi}`);
    }
  }
  const ochiq = qarzlar.filter((z) => z.holat !== "Qaytdi");
  const menga = ochiq.filter((z) => z.yonalish === "Men berdim").reduce((s, z) => s + (z.summa ?? 0), 0);
  const mendan = ochiq.filter((z) => z.yonalish === "Men oldim").reduce((s, z) => s + (z.summa ?? 0), 0);
  if (menga || mendan) q.push("", "<b>Qarzlar:</b>", `• Menga qaytarishlari kerak: ${f(menga)}`, `• Men qaytarishim kerak: ${f(mendan)}`);
  const faol = jamgarma.filter((j) => j.holat !== "Erishildi" && j.maqsad);
  if (faol.length) {
    q.push("", "<b>Jamg'arma:</b>");
    for (const j of faol) q.push(`• ${esc(j.nom)}: ${f(j.yigilgan ?? 0)} / ${f(j.maqsad)} (${Math.round(((j.yigilgan ?? 0) / j.maqsad) * 100)}%)`);
  }
  return q.join("\n");
}

export const oyOxiriSana = oyOxiri;
