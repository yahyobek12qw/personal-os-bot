// Tez qo'shish matnini tahlil qilish: tur, sana, vaqt, soha, loyiha, summa.
// "ertaga 9:00 TATU mustaqil ish topshirish" -> vazifa · ertaga 09:00 · O'qish

import { parse, muddatTop } from "./parse";

export type Tahlil = {
  tur: string;
  nom: string;
  sana: string | null;
  vaqt: string | null;
  soha_id: string | null;
  ota_id: string | null;
  ota_nom: string | null;
  summa: number | null;
  kategoriya: string | null;
  havola: string | null;
  inbox: boolean;
  belgilar: Array<{ matn: string; tur: "sana" | "vaqt" | "soha" | "loyiha" | "summa" }>;
};

const HARF = "a-zA-Z0-9'‘ʻ’";
const soz = (s: string) => new RegExp(`(?:^|[^${HARF}])(${s})(?=$|[^${HARF}])`, "i");

export const SOHA_SOZLAR: Array<[string, string]> = [
  ["oqish", "tatu|mustaqil ish|sessiya|imtihon|kontrakt|oraliq|yakuniy|laboratoriya|referat|diplom"],
  ["ish", "texnikum|ukm\\.?\\d*|dars ishlanma\\w*|o'quvchi\\w*|guruh\\w*|kafedra|metodik|dars jadval\\w*"],
  ["sog", "sport\\w*|zal\\w*|yugur\\w*|shifokor|doktor|dori|uyqu|trenirovka|mashq\\w*|analiz"],
  ["oila", "oila\\w*|onam\\w*|otam\\w*|akam\\w*|ukam\\w*|opam\\w*|singlim\\w*|xotin\\w*|farzand\\w*|to'y\\w*|mehmon\\w*"],
  ["riv", "kitob\\w*|kurs\\w*|o'rgan\\w*|ingliz\\w*|rivojlan\\w*"],
  ["qiz", "film\\w*|serial\\w*|o'yin\\w*|anime|musiqa"],
  ["pul", "to'lov\\w*|kredit|qarz\\w*|jamg'arma"],
];

const TUR_SOZ: Array<[string, RegExp]> = [
  ["voqea", soz("uchrashuv\\w*|majlis\\w*|yig'ilish\\w*|meeting|tadbir\\w*|to'y")],
  ["goya", soz("g'oya\\w*|fikr")],
];

function vaqtTop(matn: string): { vaqt: string; parcha: string } | null {
  const m = matn.match(/(?:^|\s)(?:soat\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=$|\s|[,.!?])/i) ?? matn.match(/(?:^|\s)soat\s+([01]?\d|2[0-3])(?=$|\s)/i);
  if (!m) return null;
  return { vaqt: `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`, parcha: m[0].trim() };
}

const SANA_PARCHA = soz("bugun|ertaga|indinga|yakshanba|dushanba|seshanba|chorshanba|payshanba|shanba|juma");

export function tahlil(matnXom: string, bugun: string, loyihalar: Array<{ id: string; nom: string; soha_id: string | null }> = []): Tahlil {
  const matn = String(matnXom || "").trim();
  const belgilar: Tahlil["belgilar"] = [];
  const p = parse(matn, bugun);
  if (p.kind === "moliya") {
    return { tur: p.turi === "Daromad" ? "daromad" : "xarajat", nom: p.nomi, sana: bugun, vaqt: null, soha_id: "pul", ota_id: null, ota_nom: null, summa: p.summa, kategoriya: p.kategoriya ?? null, havola: null, inbox: false, belgilar: [{ matn: matn.split(/\s+/)[0], tur: "summa" }] };
  }
  let nom = p.kind === "yozuv" ? p.nomi : matn;
  let tur = "qayd";
  if (p.kind === "yozuv") tur = p.turi === "Vazifa" ? "vazifa" : p.turi === "G'oya" ? "goya" : p.turi === "Havola" ? "havola" : p.turi === "Qayd" ? "qayd" : "";
  const odat = matn.match(/^odat\s*:\s*(.+)$/i);
  if (odat) { tur = "odat"; nom = odat[1].trim(); }

  const sana = muddatTop(matn, bugun) ?? null;
  const sp = matn.match(SANA_PARCHA) ?? matn.match(/(?:^|\s)(\d{1,2}[./]\d{1,2}(?:[./]\d{4})?)(?=$|\s)/);
  if (sana && sp) belgilar.push({ matn: sp[1], tur: "sana" });
  const v = vaqtTop(matn);
  if (v) belgilar.push({ matn: v.parcha, tur: "vaqt" });

  let soha_id: string | null = null;
  for (const [s, re] of SOHA_SOZLAR) {
    const m = matn.match(soz(re));
    if (m) { soha_id = s; belgilar.push({ matn: m[1], tur: "soha" }); break; }
  }
  let ota_id: string | null = null, ota_nom: string | null = null;
  const yaxshi = loyihalar
    .filter((l) => l.nom.length >= 3)
    .map((l) => ({ l, m: matn.match(new RegExp(l.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"), "i")) }))
    .filter((x) => x.m)
    .sort((a, b) => b.l.nom.length - a.l.nom.length)[0];
  if (yaxshi) {
    ota_id = yaxshi.l.id; ota_nom = yaxshi.l.nom;
    soha_id = yaxshi.l.soha_id ?? soha_id ?? "loy";
    belgilar.push({ matn: yaxshi.m![0], tur: "loyiha" });
  }

  if (!tur) {
    // o'zbekcha harakat nomi (-sh bilan tugaydi: borish, topshirish, to'g'irlash) — vazifa
    const harakat = /(?:ish|ash|sh)$/i.test(nom.trim().split(/\s+/).pop() ?? "");
    tur = TUR_SOZ.find(([, re]) => re.test(matn))?.[0] ?? (sana || v || harakat ? "vazifa" : "qayd");
    if (tur === "voqea" && !v && !sana) tur = "vazifa";
  }
  // Nomdan sana va vaqt so'zlarini olib tashlaymiz
  let toza = nom;
  if (sp) toza = toza.replace(sp[1], " ");
  if (v) toza = toza.replace(v.parcha, " ");
  toza = toza.replace(/\s{2,}/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim() || nom;
  toza = toza.charAt(0).toUpperCase() + toza.slice(1);

  return {
    tur, nom: toza, sana: sana ?? (v ? bugun : null), vaqt: v?.vaqt ?? null, soha_id, ota_id, ota_nom,
    summa: null, kategoriya: null, havola: p.kind === "yozuv" ? p.havola ?? null : null,
    inbox: !soha_id && !sana && !v && !ota_id,
    belgilar,
  };
}
