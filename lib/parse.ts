// Telegram xabarini Notion yozuviga aylantirish qoidalari. Tarmoqsiz, sof funksiyalar.

export type Turi = "Saralanmagan" | "Vazifa" | "G'oya" | "Qayd" | "Havola";

export type Parsed =
  | { kind: "yozuv"; turi: Turi; nomi: string; havola?: string; muddat?: string }
  | { kind: "moliya"; turi: "Daromad" | "Xarajat"; summa: number; nomi: string; kategoriya?: string }
  | { kind: "buyruq"; nomi: "bugun" | "inbox" | "hafta" | "pul" | "fayllar" | "ilova" | "yordam" | "hisobot" | "tatu" }
  | { kind: "bosh" };

export const KATEGORIYALAR = [
  "Maosh",
  "Loyiha daromadi",
  "Oziq-ovqat",
  "Transport",
  "Kommunal",
  "Internet va servislar",
  "O'qish",
  "Boshqa",
] as const;

const KATEGORIYA_SOZLAR: Array<[RegExp, string]> = [
  [/\b(maosh|oylik|avans)\b/i, "Maosh"],
  [/\b(taksi|taxi|avtobus|metro|benzin|yo'l ?kira)\b/i, "Transport"],
  [/\b(ovqat|non|bozor|tushlik|kafe|oziq)\b/i, "Oziq-ovqat"],
  [/\b(internet|server|vercel|neon|domen|hosting|obuna)\b/i, "Internet va servislar"],
  [/\b(svet|gaz|suv|kommunal)\b/i, "Kommunal"],
  [/\b(kontrakt|kurs|kitob|tatu)\b/i, "O'qish"],
];

function kategoriyaTop(matn: string): string | undefined {
  for (const [re, nom] of KATEGORIYA_SOZLAR) if (re.test(matn)) return nom;
  return undefined;
}

function summaniOqi(son: string, birlik?: string): number | null {
  const minglik = /^\d{1,3}(?:[ ,]\d{3})+$/.test(son);
  const n = Number(minglik ? son.replace(/[ ,]/g, "") : son.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const b = (birlik || "").toLowerCase();
  if (b === "k" || b === "ming") return Math.round(n * 1_000);
  if (b === "mln" || b === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

// ---------- Sanalar (Toshkent vaqti) ----------

export function bugunToshkent(sana: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sana);
}

export function kunQosh(iso: string, kun: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + kun);
  return d.toISOString().slice(0, 10);
}

const HAFTA_KUNLARI: Record<string, number> = {
  yakshanba: 0,
  dushanba: 1,
  seshanba: 2,
  chorshanba: 3,
  payshanba: 4,
  juma: 5,
  shanba: 6,
};
const HARF = "a-zA-Z'‘ʻ’";

// Matndan muddatni topadi: bugun, ertaga, indinga, hafta kunlari, 15.11, 15.11.2026
export function muddatTop(matn: string, bugun: string): string | undefined {
  const soz = (s: string) => new RegExp(`(?:^|[^${HARF}])(${s})(?=$|[^${HARF}])`, "i");
  if (soz("indinga").test(matn)) return kunQosh(bugun, 2);
  if (soz("ertaga").test(matn)) return kunQosh(bugun, 1);
  if (soz("bugun").test(matn)) return bugun;

  const hk = matn.match(soz("yakshanba|dushanba|seshanba|chorshanba|payshanba|shanba|juma"));
  if (hk) {
    const kerak = HAFTA_KUNLARI[hk[1].toLowerCase()];
    const hozir = new Date(`${bugun}T00:00:00Z`).getUTCDay();
    return kunQosh(bugun, (kerak - hozir + 7) % 7);
  }

  const sana = matn.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?=$|\s|[,.!?])/);
  if (sana) {
    const kun = Number(sana[1]);
    const oy = Number(sana[2]);
    if (kun >= 1 && kun <= 31 && oy >= 1 && oy <= 12) {
      let yil = sana[3] ? Number(sana[3]) : Number(bugun.slice(0, 4));
      let iso = `${yil}-${String(oy).padStart(2, "0")}-${String(kun).padStart(2, "0")}`;
      if (!sana[3] && iso < bugun) {
        yil += 1;
        iso = `${yil}-${iso.slice(5)}`;
      }
      return iso;
    }
  }
  return undefined;
}

// ---------- Asosiy tahlil ----------

const URL_RE = /https?:\/\/\S+/i;

export function parse(matnXom: string | undefined, bugun: string = bugunToshkent()): Parsed {
  const matn = (matnXom || "").trim();
  if (!matn) return { kind: "bosh" };

  const buyruq = matn.match(/^\/(\w+)/);
  if (buyruq) {
    const b = buyruq[1].toLowerCase();
    if (b === "bugun") return { kind: "buyruq", nomi: "bugun" };
    if (b === "inbox") return { kind: "buyruq", nomi: "inbox" };
    if (b === "hafta") return { kind: "buyruq", nomi: "hafta" };
    if (b === "pul") return { kind: "buyruq", nomi: "pul" };
    if (b === "fayllar") return { kind: "buyruq", nomi: "fayllar" };
    if (b === "hisobot") return { kind: "buyruq", nomi: "hisobot" };
    if (b === "tatu" || b === "oqish") return { kind: "buyruq", nomi: "tatu" };
    if (b === "app" || b === "ilova") return { kind: "buyruq", nomi: "ilova" };
    return { kind: "buyruq", nomi: "yordam" }; // /start, /yordam, /help va noma'lumlar
  }

  const pul = matn.match(/^([+-])\s*(\d{1,3}(?:[ ,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|ming|mln|m)?(?:\s+(.*))?$/is);
  if (pul) {
    const summa = summaniOqi(pul[2], pul[3]);
    if (summa !== null) {
      const izoh = (pul[4] || "").trim();
      const turi = pul[1] === "+" ? "Daromad" : "Xarajat";
      return { kind: "moliya", turi, summa, nomi: izoh || turi, kategoriya: kategoriyaTop(izoh) };
    }
  }

  const muddat = muddatTop(matn, bugun);

  const pref = matn.match(/^([vgq])\s*:\s*(.+)$/is);
  if (pref) {
    const harf = pref[1].toLowerCase();
    const turi: Turi = harf === "v" ? "Vazifa" : harf === "g" ? "G'oya" : "Qayd";
    return { kind: "yozuv", turi, nomi: pref[2].trim(), muddat };
  }

  const url = matn.match(URL_RE);
  if (url) {
    const qolgan = matn.replace(url[0], "").trim();
    return { kind: "yozuv", turi: "Havola", nomi: qolgan || url[0], havola: url[0], muddat };
  }

  return { kind: "yozuv", turi: "Saralanmagan", nomi: matn, muddat };
}
