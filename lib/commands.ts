// /bugun, /inbox, /hafta, /pul buyruqlari va 19:00 eslatmasi.

import { qisqa } from "./ids";
import { esc, ilovaTugma, type Klaviatura } from "./telegram";
import { bugungiVazifalar, haftaVazifalari, inboxYozuvlari, oyMoliyasi, sarlavha, fayllilar, tgFaylMatn } from "./notion";
import { tgFaylOqi, BOLIM_NOMI } from "./arxiv";
import { kunQosh } from "./parse";
import { eslatmalar, oqishBolimi } from "./bolimlar";
import { TURI_BELGI, sanaKorinish, qisqaMatn, type Kartochka } from "./cards";

export const YORDAM = [
  "<b>Personal OS bot</b>",
  "",
  "Menga istalgan narsani yuboring — matn, rasm, video, fayl yoki ovozli xabar. Hammasi Notion'ga tushadi, keyin tugmalar bilan saralaysiz.",
  "",
  "<b>Tezkor yozish</b> (majburiy emas)",
  "<code>v: ...</code> vazifa · <code>g: ...</code> g'oya · <code>q: ...</code> qayd",
  "<code>v: hisobot ertaga</code> → muddat ertaga",
  "Sana so'zlari: bugun, ertaga, indinga, dushanba…yakshanba, 15.11",
  "",
  "<b>Pul</b>",
  "<code>+500000 maosh</code> · <code>-30k taksi</code> · <code>-1.5mln noutbuk</code>",
  "",
  "<b>Buyruqlar</b>",
  "/bugun — bugungi vazifalar (bajarildi tugmasi bilan)",
  "/inbox — saralanmagan yozuvlar",
  "/hafta — keyingi 7 kun",
  "/pul — shu oy daromad va xarajat",
  "/hisobot — oylik hisobot (byudjet, qarzlar, jamg'arma)",
  "/tatu — TATU topshiriqlari va muddatlari",
  "/fayllar — oxirgi saqlangan fayllar",
  "/ilova — Personal OS ilovasini ochish",
  "",
  "<b>Ilovada</b>",
  "Byudjet, doimiy to'lovlar, qarzlar, jamg'arma, O'qish (TATU), O'rganish va O'qitish bo'limlari — 📱 ilovani oching. Muddati yaqinlarini kechki xabarda eslataman.",
  "",
  "<b>Fayllar</b>",
  "5 MB gacha fayl Notion'ga, kattasi fayllar guruhiga saqlanadi (Notion'da havolasi qoladi). Kartochkadagi 📤 tugmasi faylni qaytarib yuboradi.",
  "Mavjud yozuvga rasm, video yoki ovoz qo'shish: uning kartochkasiga javob (Reply) qilib yuboring. Ilovada ham har bir kartochkada «Media» bo'limi bor.",
].join("\n");

export async function fayllarXabari(): Promise<Kartochka> {
  const yozuvlar = await fayllilar();
  if (!yozuvlar.length) return { text: "📁 <b>Saqlangan fayllar yo'q</b>\n\nBotga rasm, video yoki fayl yuboring.", kb: [] };
  const kb: Klaviatura = yozuvlar.map((p) => {
    const f = tgFaylOqi(tgFaylMatn(p));
    const belgi = f[0] ? BOLIM_NOMI[f[0].bolim].split(" ")[0] : "📎";
    const son = f.length > 1 ? ` (${f.length})` : "";
    return [{ text: `${belgi} ${qisqaMatn(sarlavha(p), 32)}${son}`, callback_data: `f:${qisqa(p.id)}` }];
  });
  return { text: "📁 <b>Oxirgi fayllar</b>\n\nBossangiz, fayl sizga qayta yuboriladi.", kb };
}

export async function bugunXabari(bugun: string, sarlavhaQator = "☀️ <b>Bugun</b>"): Promise<Kartochka> {
  const [vazifalar, inbox, esl] = await Promise.all([
    bugungiVazifalar(bugun),
    inboxYozuvlari(),
    eslatmalar(bugun).catch((e) => (console.error(e), [])),
  ]);
  const muddatsiz = inbox.filter((p) => p.properties?.Turi?.select?.name === "Vazifa");
  const qatorlar: string[] = [sarlavhaQator, ""];

  if (vazifalar.length) {
    vazifalar.forEach((v, i) => {
      const m = v.properties?.Muddat?.date?.start as string | undefined;
      const kechikkan = m && m < bugun;
      qatorlar.push(`${i + 1}. ${kechikkan ? "🔴 " : ""}${esc(sarlavha(v))}${kechikkan ? ` <i>(${sanaKorinish(m!, bugun).replace("🔴 Kechikkan: ", "")})</i>` : ""}`);
    });
  } else {
    qatorlar.push("Bugunga muddatli vazifa yo'q. 🎉");
  }
  if (esl.length) {
    qatorlar.push("", "<b>Eslatmalar:</b>");
    for (const e of esl) {
      const vaqt = e.kechikkan ? " 🔴 kechikdi" : e.sana ? ` · ${sanaKorinish(e.sana, bugun).replace(/^[^\p{L}\d]+/u, "")}` : "";
      qatorlar.push(`${e.belgi} ${esc(e.matn)}${e.izoh ? ` <i>(${esc(e.izoh)})</i>` : ""}${vaqt}`);
    }
  }
  if (muddatsiz.length) qatorlar.push("", `⚪ Muddati qo'yilmagan vazifalar: ${muddatsiz.length} ta → /inbox`);
  const boshqa = inbox.length - muddatsiz.length;
  if (boshqa > 0) qatorlar.push(`📥 Saralanmagan yozuvlar: ${boshqa} ta → /inbox`);
  if (vazifalar.length) qatorlar.push("", "<i>Bajarilganini bosing:</i>");

  const kb: Klaviatura = vazifalar.slice(0, 10).map((v, i) => [
    { text: `✅ ${i + 1}. ${qisqaMatn(sarlavha(v), 30)}`, callback_data: `bd:${qisqa(v.id)}` },
  ]);
  kb.push([{ text: "🔄 Yangilash", callback_data: "bugun" }, ilovaTugma("📱 Ilova")]);
  return { text: qatorlar.join("\n"), kb };
}

export async function inboxXabari(): Promise<Kartochka> {
  const yozuvlar = await inboxYozuvlari();
  if (!yozuvlar.length) return { text: "📥 <b>Inbox bo'sh</b>\n\nHammasi saralangan. 👌", kb: [] };
  const korsat = yozuvlar.slice(0, 12);
  const text = [
    `📥 <b>Inbox: ${yozuvlar.length} ta</b>`,
    "",
    "Saralash uchun yozuvni bosing.",
    ...(yozuvlar.length > korsat.length ? [`<i>Eng yangi ${korsat.length} tasi ko'rsatildi.</i>`] : []),
  ].join("\n");
  const kb: Klaviatura = korsat.map((p) => {
    const turi = p.properties?.Turi?.select?.name ?? "Saralanmagan";
    const belgi = (TURI_BELGI[turi] ?? "📥").split(" ")[0];
    return [{ text: `${belgi} ${qisqaMatn(sarlavha(p), 34)}`, callback_data: `cn:${qisqa(p.id)}` }];
  });
  return { text, kb };
}

export async function haftaXabari(bugun: string): Promise<Kartochka> {
  const oxiri = kunQosh(bugun, 7);
  const vazifalar = await haftaVazifalari(bugun, oxiri);
  if (!vazifalar.length) return { text: "📅 <b>Keyingi 7 kun</b>\n\nRejalashtirilgan vazifa yo'q.", kb: [] };
  const guruh = new Map<string, string[]>();
  for (const v of vazifalar) {
    const m = (v.properties?.Muddat?.date?.start as string).slice(0, 10);
    if (!guruh.has(m)) guruh.set(m, []);
    guruh.get(m)!.push(`• ${esc(sarlavha(v))}`);
  }
  const qatorlar = ["📅 <b>Keyingi 7 kun</b>"];
  for (const [m, list] of guruh) qatorlar.push("", `<b>${sanaKorinish(m, bugun)}</b>`, ...list);
  return { text: qatorlar.join("\n"), kb: [] };
}

export async function pulXabari(bugun: string): Promise<Kartochka> {
  const oyBoshi = `${bugun.slice(0, 7)}-01`;
  const yozuvlar = await oyMoliyasi(oyBoshi);
  let daromad = 0;
  let xarajat = 0;
  const kat = new Map<string, number>();
  for (const p of yozuvlar) {
    const s = p.properties?.Summa?.number ?? 0;
    if (p.properties?.Turi?.select?.name === "Daromad") daromad += s;
    else {
      xarajat += s;
      const k = p.properties?.Kategoriya?.select?.name ?? "Kategoriyasiz";
      kat.set(k, (kat.get(k) ?? 0) + s);
    }
  }
  const f = (n: number) => n.toLocaleString("ru-RU");
  const qatorlar = [
    `💰 <b>${bugun.slice(0, 7)} oyi</b>`,
    "",
    `Daromad: <b>${f(daromad)}</b> so'm`,
    `Xarajat: <b>${f(xarajat)}</b> so'm`,
    `Balans: <b>${daromad - xarajat >= 0 ? "+" : ""}${f(daromad - xarajat)}</b> so'm`,
  ];
  if (kat.size) {
    qatorlar.push("", "<b>Xarajatlar:</b>");
    [...kat.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, s]) => qatorlar.push(`• ${esc(k)}: ${f(s)}`));
  }
  if (yozuvlar.length >= 100) qatorlar.push("", "<i>Faqat birinchi 100 ta yozuv hisoblandi.</i>");
  return { text: qatorlar.join("\n"), kb: [] };
}

export async function tatuXabari(bugun: string): Promise<Kartochka> {
  const { fanlar, topshiriqlar } = await oqishBolimi(bugun);
  const ochiq = topshiriqlar.filter((t: any) => t.holat !== "Topshirildi");
  const q = ["🎓 <b>TATU — topshiriqlar</b>", ""];
  if (!ochiq.length) q.push("Ochiq topshiriq yo'q. 🎉");
  for (const t of ochiq.slice(0, 15)) {
    const vaqt = t.muddat ? (t.kechikkan ? "🔴 " : "") + sanaKorinish(t.muddat, bugun).replace(/^[^\p{L}\d]+/u, "") : "muddatsiz";
    q.push(`• ${esc(t.nom)}${t.fanNomi ? ` <i>(${esc(t.fanNomi)})</i>` : ""} — ${vaqt}`);
  }
  q.push("", `Fanlar: ${fanlar.length} ta. Qo'shish va belgilash — ilovada.`);
  return { text: q.join("\n"), kb: [[ilovaTugma("📱 O'qish bo'limi", "oqish")]] };
}
