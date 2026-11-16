import assert from "node:assert/strict";
import { parse, bugunToshkent, muddatTop, kunQosh } from "../lib/parse.ts";

const B = "2026-11-12"; // payshanba

const cases: Array<[string, Record<string, unknown>]> = [
  ["ertaga 3-guruhga test tayyorlash", { kind: "yozuv", turi: "Saralanmagan", muddat: "2026-11-13" }],
  ["v: EduFlow login bugini tuzatish", { kind: "yozuv", turi: "Vazifa", muddat: undefined }],
  ["v: hisobot juma", { kind: "yozuv", turi: "Vazifa", muddat: "2026-11-13" }],
  ["v: darsga tayyorlanish dushanba", { kind: "yozuv", turi: "Vazifa", muddat: "2026-11-16" }],
  ["v: yakshanba tahlil", { kind: "yozuv", turi: "Vazifa", muddat: "2026-11-15" }],
  ["v: payshanba uchrashuv", { kind: "yozuv", turi: "Vazifa", muddat: "2026-11-12" }],
  ["v: topshirish 20.11", { kind: "yozuv", turi: "Vazifa", muddat: "2026-11-20" }],
  ["v: kontrakt 05.01", { kind: "yozuv", turi: "Vazifa", muddat: "2027-01-05" }],
  ["v: imtihon indinga", { kind: "yozuv", turi: "Vazifa", muddat: "2026-11-14" }],
  ["G: Textile uchun demo video", { kind: "yozuv", turi: "G'oya", nomi: "Textile uchun demo video" }],
  ["q: Notion formula sintaksisi", { kind: "yozuv", turi: "Qayd" }],
  ["https://example.com/maqola zo'r maqola", { kind: "yozuv", turi: "Havola", havola: "https://example.com/maqola" }],
  ["+500000 maosh", { kind: "moliya", turi: "Daromad", summa: 500000, kategoriya: "Maosh" }],
  ["+5 000 000 oylik", { kind: "moliya", turi: "Daromad", summa: 5000000 }],
  ["-30k taksi", { kind: "moliya", turi: "Xarajat", summa: 30000, kategoriya: "Transport" }],
  ["-1.5mln noutbuk", { kind: "moliya", turi: "Xarajat", summa: 1500000, nomi: "noutbuk" }],
  ["-200 ming bozor", { kind: "moliya", turi: "Xarajat", summa: 200000, kategoriya: "Oziq-ovqat" }],
  ["- bu oddiy fikr", { kind: "yozuv", turi: "Saralanmagan" }],
  ["/bugun", { kind: "buyruq", nomi: "bugun" }],
  ["/inbox", { kind: "buyruq", nomi: "inbox" }],
  ["/hafta", { kind: "buyruq", nomi: "hafta" }],
  ["/pul", { kind: "buyruq", nomi: "pul" }],
  ["/start", { kind: "buyruq", nomi: "yordam" }],
  ["", { kind: "bosh" }],
];

for (const [kirish, kutilgan] of cases) {
  const natija = parse(kirish, B) as Record<string, unknown>;
  for (const [k, v] of Object.entries(kutilgan)) {
    assert.equal(natija[k], v, `"${kirish}" -> ${k}: kutilgan ${v}, olindi ${natija[k]}`);
  }
}

// "shanba" so'zi "dushanba" ichidan topilmasligi kerak
assert.equal(muddatTop("dushanba kuni", B), "2026-11-16");
assert.equal(muddatTop("bugungi kayfiyat", B), undefined);
assert.equal(kunQosh("2026-12-31", 1), "2027-01-01");
assert.equal(bugunToshkent(new Date("2026-11-11T20:00:00Z")), "2026-11-12");

console.log(`OK: ${cases.length + 4} ta tekshiruv o'tdi`);
