// Kartochkalar: Notion yozuvini Telegram xabari + tugmalarga aylantirish.

import { qisqa } from "./ids";
import { esc, type Klaviatura } from "./telegram";
import { sahifaOl, sarlavha, dsId, MOLIYA, faolLoyihalar, tgFaylMatn } from "./notion";
import { tgFaylOqi } from "./arxiv";
import { KATEGORIYALAR, kunQosh } from "./parse";

export const TURI_BELGI: Record<string, string> = {
  Saralanmagan: "📥 Inbox",
  Vazifa: "📌 Vazifa",
  "G'oya": "💡 G'oya",
  Qayd: "📝 Qayd",
  Havola: "🔗 Havola",
  Qaror: "⚖️ Qaror",
  Uchrashuv: "🤝 Uchrashuv",
};

const HAFTA = ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];

export function sanaKorinish(iso: string, bugun: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const kun = HAFTA[new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()];
  const asos = `${d}.${m}${y !== bugun.slice(0, 4) ? `.${y}` : ""}, ${kun}`;
  if (iso.slice(0, 10) === bugun) return `Bugun (${asos})`;
  if (iso.slice(0, 10) === kunQosh(bugun, 1)) return `Ertaga (${asos})`;
  if (iso.slice(0, 10) < bugun) return `🔴 Kechikkan: ${asos}`;
  return asos;
}

export const qisqaMatn = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const belgi = (tanlangan: boolean, matn: string) => (tanlangan ? `• ${matn}` : matn);

export type Kartochka = { text: string; kb: Klaviatura };

export async function kartochka(pageId: string, bugun: string, qoshimcha?: string): Promise<Kartochka> {
  const page = await sahifaOl(pageId);
  const id = qisqa(page.id);
  const p = page.properties ?? {};
  const nomi = sarlavha(page);

  const fayllar = tgFaylOqi(tgFaylMatn(page));
  const faylQatori: Klaviatura = fayllar.length
    ? [[{ text: fayllar.length > 1 ? `📤 Fayllarni olish (${fayllar.length})` : "📤 Faylni olish", callback_data: `f:${id}` }]]
    : [];

  let loyiha: string | undefined;
  const loyihaId = p.Loyiha?.relation?.[0]?.id;
  if (loyihaId) loyiha = sarlavha(await sahifaOl(loyihaId).catch(() => null));

  // ----- Moliya -----
  if (dsId(page) === MOLIYA().replace(/-/g, "")) {
    const turi = p.Turi?.select?.name ?? "Xarajat";
    const summa = (p.Summa?.number ?? 0).toLocaleString("ru-RU");
    const kat = p.Kategoriya?.select?.name;
    const sana = p.Sana?.date?.start;
    const qatorlar = [
      `<b>${turi === "Daromad" ? "💰 Daromad" : "💸 Xarajat"}: ${summa} so'm</b>`,
      esc(nomi),
      "",
      `🏷 ${kat ? esc(kat) : "Kategoriya tanlanmagan"}`,
      ...(sana ? [`📅 ${sanaKorinish(sana, bugun).replace("🔴 Kechikkan: ", "")}`] : []),
      ...(loyiha ? [`📁 ${esc(loyiha)}`] : []),
      ...(qoshimcha ? ["", qoshimcha] : []),
    ];
    return {
      text: qatorlar.join("\n"),
      kb: [[
        { text: "🏷 Kategoriya", callback_data: `kl:${id}` },
        { text: "📁 Loyiha", callback_data: `pl:${id}` },
        { text: "🗑", callback_data: `x:${id}` },
      ], ...faylQatori],
    };
  }

  // ----- Yozuv -----
  const turi = p.Turi?.select?.name ?? "Saralanmagan";
  const holat = p.Holat?.select?.name;
  const muddat: string | undefined = p.Muddat?.date?.start;
  const tez = Boolean(p["Tez ish"]?.checkbox);
  const havola: string | undefined = p.Havola?.url ?? undefined;
  const bajarildi = holat === "Bajarildi";

  const malumot = [
    ...(turi === "Vazifa" || muddat ? [`📅 ${muddat ? sanaKorinish(muddat, bugun) : "Muddat qo'yilmagan"}`] : []),
    ...(loyiha ? [`📁 ${esc(loyiha)}`] : []),
    ...(tez ? ["⚡ Tez ish"] : []),
    ...(havola ? [`🔗 ${esc(havola)}`] : []),
  ];
  const bolimlar = [
    `<b>${TURI_BELGI[turi] ?? turi}</b>${bajarildi ? " · ✅ Bajarildi" : ""}\n${bajarildi ? `<s>${esc(nomi)}</s>` : esc(nomi)}`,
    malumot.join("\n"),
    qoshimcha ?? "",
  ].filter(Boolean);

  let kb: Klaviatura;
  if (turi === "Vazifa" && bajarildi) {
    kb = [[
      { text: "↩️ Qayta ochish", callback_data: `u:${id}` },
      { text: "🗑", callback_data: `x:${id}` },
    ]];
  } else if (turi === "Vazifa") {
    const kunlar: Array<[string, number]> = [["Bugun", 0], ["Ertaga", 1], ["Indinga", 2], ["+1 hafta", 7]];
    kb = [
      kunlar.map(([nom, k]) => ({
        text: belgi(muddat === kunQosh(bugun, k), nom),
        callback_data: `m:${id}:${k}`,
      })),
      [
        { text: tez ? "⚡ Tez ish ✓" : "⚡ Tez ish", callback_data: `z:${id}` },
        { text: "📁 Loyiha", callback_data: `pl:${id}` },
        { text: "✅ Bajarildi", callback_data: `d:${id}` },
      ],
      [
        { text: "🔄 Turini o'zgartirish", callback_data: `tl:${id}` },
        { text: "🗑", callback_data: `x:${id}` },
      ],
    ];
  } else {
    kb = [
      [
        { text: belgi(false, "📌 Vazifa"), callback_data: `t:${id}:v` },
        { text: belgi(turi === "G'oya", "💡 G'oya"), callback_data: `t:${id}:g` },
        { text: belgi(turi === "Qayd", "📝 Qayd"), callback_data: `t:${id}:q` },
      ],
      [
        { text: "📁 Loyiha", callback_data: `pl:${id}` },
        { text: "⋯ Boshqa tur", callback_data: `tl:${id}` },
        { text: "🗑", callback_data: `x:${id}` },
      ],
    ];
  }
  return { text: bolimlar.join("\n\n"), kb: [...kb, ...faylQatori] };
}

export function turlarKb(id: string): Klaviatura {
  return [
    [
      { text: "📌 Vazifa", callback_data: `t:${id}:v` },
      { text: "💡 G'oya", callback_data: `t:${id}:g` },
      { text: "📝 Qayd", callback_data: `t:${id}:q` },
    ],
    [
      { text: "🔗 Havola", callback_data: `t:${id}:h` },
      { text: "⚖️ Qaror", callback_data: `t:${id}:r` },
      { text: "📥 Inbox", callback_data: `t:${id}:i` },
    ],
    [{ text: "⬅️ Orqaga", callback_data: `c:${id}` }],
  ];
}

export async function loyihalarKb(id: string, joriy?: string): Promise<Klaviatura> {
  const loyihalar = await faolLoyihalar();
  const kb: Klaviatura = [];
  for (let i = 0; i < loyihalar.length; i += 2) {
    kb.push(
      loyihalar.slice(i, i + 2).map((l) => ({
        text: belgi(l.id === joriy, `📁 ${qisqaMatn(sarlavha(l), 22)}`),
        callback_data: `p:${id}:${qisqa(l.id)}`,
      })),
    );
  }
  kb.push([
    { text: "✖ Loyihasiz", callback_data: `p:${id}:-` },
    { text: "⬅️ Orqaga", callback_data: `c:${id}` },
  ]);
  return kb;
}

export function kategoriyalarKb(id: string, joriy?: string): Klaviatura {
  const kb: Klaviatura = [];
  for (let i = 0; i < KATEGORIYALAR.length; i += 2) {
    kb.push(
      KATEGORIYALAR.slice(i, i + 2).map((k, j) => ({
        text: belgi(k === joriy, k),
        callback_data: `kc:${id}:${i + j}`,
      })),
    );
  }
  kb.push([{ text: "⬅️ Orqaga", callback_data: `c:${id}` }]);
  return kb;
}

export function ochirishKb(id: string): Klaviatura {
  return [[
    { text: "🗑 Ha, o'chirish", callback_data: `xy:${id}` },
    { text: "⬅️ Yo'q", callback_data: `c:${id}` },
  ]];
}
