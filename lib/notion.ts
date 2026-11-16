// Notion API (2025-09-03, data source'lar bilan).

const NOTION_VERSION = "2025-09-03";

function env(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`${nom} muhit o'zgaruvchisi o'rnatilmagan`);
  return v;
}

export const YOZUVLAR = () => env("YOZUVLAR_DS_ID");
export const MOLIYA = () => env("MOLIYA_DS_ID");
export const LOYIHALAR = () => env("LOYIHALAR_DS_ID");

async function notion(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("NOTION_TOKEN")}`,
      "Notion-Version": NOTION_VERSION,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion ${res.status}: ${data?.message ?? "noma'lum xato"}`);
  return data;
}

const matn = (s: string) => [{ type: "text", text: { content: s.slice(0, 2000) } }];
const paragraf = (s: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: matn(s) } });

export function sarlavha(page: any): string {
  const t = page?.properties?.Nomi?.title ?? [];
  return t.map((x: any) => x.plain_text).join("") || "(nomsiz)";
}

export function dsId(page: any): string {
  return (page?.parent?.data_source_id ?? "").replace(/-/g, "");
}

// ---------- Yaratish ----------

export async function yozuvQosh(p: {
  turi: string;
  nomi: string;
  havola?: string;
  muddat?: string;
  tgGuruh?: string;
  tgFayl?: string;
  manba?: string;
  loyiha?: string;
  bloklar?: any[];
}) {
  const qisqaNom = p.nomi.length > 120 ? p.nomi.slice(0, 117) + "..." : p.nomi;
  const properties: Record<string, unknown> = {
    Nomi: { title: matn(qisqaNom) },
    Turi: { select: { name: p.turi } },
    Manba: { select: { name: p.manba ?? "Telegram" } },
  };
  if (p.turi === "Vazifa") properties.Holat = { select: { name: "Kutilmoqda" } };
  if (p.havola) properties.Havola = { url: p.havola };
  if (p.muddat) properties.Muddat = { date: { start: p.muddat } };
  if (p.tgGuruh) properties["TG guruh"] = { rich_text: matn(p.tgGuruh) };
  if (p.tgFayl) properties["TG fayl"] = { rich_text: bolaklab(p.tgFayl) };
  if (p.loyiha) properties.Loyiha = { relation: [{ id: p.loyiha }] };
  const children = [...(p.nomi.length > 120 ? [paragraf(p.nomi)] : []), ...(p.bloklar ?? [])];
  return notion("POST", "/pages", {
    parent: { type: "data_source_id", data_source_id: YOZUVLAR() },
    properties,
    ...(children.length ? { children } : {}),
  });
}

export async function moliyaQosh(p: {
  turi: string;
  summa: number;
  nomi: string;
  kategoriya?: string;
  sana: string;
  tgFayl?: string;
}) {
  const properties: Record<string, unknown> = {
    Nomi: { title: matn(p.nomi) },
    Summa: { number: p.summa },
    Turi: { select: { name: p.turi } },
    Sana: { date: { start: p.sana } },
  };
  if (p.kategoriya) properties.Kategoriya = { select: { name: p.kategoriya } };
  if (p.tgFayl) properties["TG fayl"] = { rich_text: matn(p.tgFayl) };
  return notion("POST", "/pages", {
    parent: { type: "data_source_id", data_source_id: MOLIYA() },
    properties,
  });
}

export const sahifaYarat = (ds: string, properties: Record<string, unknown>) =>
  notion("POST", "/pages", { parent: { type: "data_source_id", data_source_id: ds }, properties });

// ---------- O'qish / yangilash ----------

export const sahifaOl = (id: string) => notion("GET", `/pages/${id}`);
export const yangila = (id: string, properties: Record<string, unknown>) =>
  notion("PATCH", `/pages/${id}`, { properties });
export const ochir = (id: string) => notion("PATCH", `/pages/${id}`, { in_trash: true });
export const bloklarQosh = (id: string, children: any[]) =>
  notion("PATCH", `/blocks/${id}/children`, { children });
export const paragrafBlok = paragraf;

export function havolaBlok(text: string, url: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: text, link: { url } } }] },
  };
}

export const tgFaylMatn = (page: any): string =>
  (page?.properties?.["TG fayl"]?.rich_text ?? []).map((x: any) => x.plain_text).join("");

// Har bir fayl alohida matn bo'lagi (bitta bo'lak 2000 belgidan oshmasligi uchun)
const bolaklab = (qiymat: string) => {
  const q = qiymat.split(",");
  return q.map((x, i) => ({ type: "text", text: { content: x + (i < q.length - 1 ? "," : "") } }));
};
export const tgFaylYangila = (id: string, qiymat: string) =>
  notion("PATCH", `/pages/${id}`, { properties: { "TG fayl": { rich_text: bolaklab(qiymat) } } });
export const qidir = (query: string) =>
  notion("POST", "/search", { query, filter: { property: "object", value: "page" }, page_size: 30 }).then((d) => d.results as any[]);
export const bolalarOl = async (id: string, maks = 300) => {
  const r: any[] = [];
  let cursor: string | undefined;
  do {
    const d = await notion("GET", `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    r.push(...d.results);
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor && r.length < maks);
  return r;
};
export const blokOl = (id: string) => notion("GET", `/blocks/${id}`);
export const blokOchir = (id: string) => notion("DELETE", `/blocks/${id}`);
export const bloklarOl = (id: string) => notion("GET", `/blocks/${id}/children?page_size=100`).then((d) => d.results as any[]);

// Barcha sahifalarni (100 tadan ko'p bo'lsa ham) olib keladi
export async function sorovHammasi(ds: string, body: Record<string, unknown> = {}, maks = 1000): Promise<any[]> {
  const natija: any[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion("POST", `/data_sources/${ds}/query`, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    natija.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && natija.length < maks);
  return natija;
}

export async function sorov(ds: string, body: unknown): Promise<any[]> {
  const data = await notion("POST", `/data_sources/${ds}/query`, body);
  return data.results as any[];
}

const OCHIQ = [
  { property: "Holat", select: { does_not_equal: "Bajarildi" } },
  { property: "Holat", select: { does_not_equal: "Bekor" } },
];

export function bugungiVazifalar(bugun: string) {
  return sorov(YOZUVLAR(), {
    filter: {
      and: [
        { property: "Turi", select: { equals: "Vazifa" } },
        ...OCHIQ,
        { property: "Muddat", date: { on_or_before: bugun } },
      ],
    },
    sorts: [{ property: "Muddat", direction: "ascending" }],
    page_size: 30,
  });
}

export function haftaVazifalari(bugun: string, oxiri: string) {
  return sorov(YOZUVLAR(), {
    filter: {
      and: [
        { property: "Turi", select: { equals: "Vazifa" } },
        ...OCHIQ,
        { property: "Muddat", date: { after: bugun } },
        { property: "Muddat", date: { on_or_before: oxiri } },
      ],
    },
    sorts: [{ property: "Muddat", direction: "ascending" }],
    page_size: 50,
  });
}

// Inbox = saralanmagan yozuvlar + muddati qo'yilmagan ochiq vazifalar
export function inboxYozuvlari() {
  return sorov(YOZUVLAR(), {
    filter: {
      or: [
        { property: "Turi", select: { equals: "Saralanmagan" } },
        {
          and: [
            { property: "Turi", select: { equals: "Vazifa" } },
            { property: "Muddat", date: { is_empty: true } },
            ...OCHIQ,
          ],
        },
      ],
    },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
    page_size: 100,
  });
}

export function faolLoyihalar() {
  return sorov(LOYIHALAR(), {
    filter: {
      or: ["Faol", "Relizda", "Ikkinchi darajali"].map((h) => ({ property: "Holat", select: { equals: h } })),
    },
    sorts: [{ property: "Nomi", direction: "ascending" }],
    page_size: 20,
  });
}

// Hammasi: faollar avval, keyin pauza/qiziqish/arxiv
export async function barchaLoyihalar() {
  const r = await sorov(LOYIHALAR(), { sorts: [{ property: "Nomi", direction: "ascending" }], page_size: 50 });
  const tartib = ["Faol", "Relizda", "Ikkinchi darajali", "Pauza", "Qiziqish", "Arxiv"];
  const o = (x: any) => {
    const i = tartib.indexOf(x.properties?.Holat?.select?.name);
    return i < 0 ? 99 : i;
  };
  return r.sort((a, b) => o(a) - o(b));
}

export function oxirgiYozuvlar(soni = 5) {
  return sorov(YOZUVLAR(), { sorts: [{ timestamp: "created_time", direction: "descending" }], page_size: soni });
}

export function albomYozuvi(guruh: string) {
  return sorov(YOZUVLAR(), {
    filter: { property: "TG guruh", rich_text: { equals: guruh } },
    page_size: 1,
  });
}

// Fayli bor oxirgi yozuvlar (Yozuvlar + Moliya)
export async function fayllilar(): Promise<any[]> {
  const body = {
    filter: { property: "TG fayl", rich_text: { is_not_empty: true } },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
    page_size: 10,
  };
  const [a, b] = await Promise.all([sorov(YOZUVLAR(), body), sorov(MOLIYA(), body)]);
  return [...a, ...b].sort((x, y) => (x.created_time < y.created_time ? 1 : -1)).slice(0, 10);
}

export function oyMoliyasi(oyBoshi: string, oyOxiri?: string) {
  return sorovHammasi(MOLIYA(), {
    filter: {
      and: [
        { property: "Sana", date: { on_or_after: oyBoshi } },
        ...(oyOxiri ? [{ property: "Sana", date: { on_or_before: oyOxiri } }] : []),
      ],
    },
  });
}

// ---------- Fayl yuklash ----------

export type FaylTuri = "image" | "video" | "audio" | "file" | "pdf";

export async function faylYukla(fayl: Blob, nomi: string, contentType: string): Promise<string> {
  const yaratildi = await notion("POST", "/file_uploads", {
    mode: "single_part",
    filename: nomi,
    content_type: contentType,
  });
  const form = new FormData();
  form.append("file", new Blob([await fayl.arrayBuffer()], { type: contentType }), nomi);
  const res = await fetch(`https://api.notion.com/v1/file_uploads/${yaratildi.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("NOTION_TOKEN")}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion yuklash ${res.status}: ${data?.message ?? "noma'lum xato"}`);
  return yaratildi.id as string;
}

export function faylBlok(turi: FaylTuri, uploadId: string, izoh?: string) {
  return {
    object: "block",
    type: turi,
    [turi]: { type: "file_upload", file_upload: { id: uploadId }, ...(izoh ? { caption: matn(izoh) } : {}) },
  };
}
