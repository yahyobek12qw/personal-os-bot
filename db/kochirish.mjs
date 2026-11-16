// Notion -> Neon bir martalik ko'chirish (qayta ishga tushirilsa, notion_id bo'yicha yangilaydi)
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const sql = neon(process.env.DATABASE_URL_UNPOOLED);
const TOK = process.env.NOTION_TOKEN;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const ARXIV = process.env.FILES_CHAT_ID || "-1004383924552";
const ids = JSON.parse(fs.readFileSync("/tmp/build/ids.json", "utf8"));
const DS = {
  yozuvlar: "eb946a25-9f8f-49bd-adf6-c2059194a6a6",
  loyihalar: "0c6128ef-c91e-4099-a373-1686b2c9f583",
  yonalishlar: "1bb1682a-fc46-4e72-ae93-1b9be2befa53",
  moliya: "08950b6d-7fa9-417b-8321-e00881130ad1",
  ...ids,
};

async function notion(m, p, b) {
  const r = await fetch("https://api.notion.com/v1" + p, { method: m, headers: { Authorization: "Bearer " + TOK, "Notion-Version": "2025-09-03", "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(p + ": " + (j.message || r.status));
  return j;
}
const q = async (ds) => (await notion("POST", `/data_sources/${ds}/query`, { page_size: 100 })).results;
const norm = (s) => (s || "").replace(/-/g, "");
const title = (p) => Object.values(p.properties).find((v) => v.type === "title")?.title.map((t) => t.plain_text).join("") || "Nomsiz";
const sel = (p, k) => p.properties[k]?.select?.name ?? null;
const num = (p, k) => p.properties[k]?.number ?? p.properties[k]?.rollup?.number ?? null;
const date = (p, k) => p.properties[k]?.date?.start ?? null;
const txt = (p, k) => (p.properties[k]?.rich_text ?? []).map((t) => t.plain_text).join("") || null;
const rel = (p, k) => (p.properties[k]?.relation ?? []).map((r) => norm(r.id));
const plain = (rt) => (rt || []).map((t) => t.plain_text).join("");

// Sahifa matni -> oddiy markdown (media alohida)
async function body(id) {
  const out = [];
  const media = [];
  let cursor;
  do {
    const d = await notion("GET", `/blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
    for (const b of d.results) {
      const x = b[b.type] || {};
      const t = plain(x.rich_text);
      if (["image", "video", "audio", "file", "pdf"].includes(b.type) && x.type === "file") media.push({ tur: b.type, url: x.file.url, nom: x.name || plain(x.caption) || b.type });
      else if (b.type === "paragraph" && (x.rich_text || []).some((r) => /t\.me\/c\//.test(r.href || ""))) continue;
      else if (b.type === "paragraph" && t) out.push(t);
      else if (b.type.startsWith("heading_")) out.push("#".repeat(Number(b.type.slice(-1))) + " " + t);
      else if (b.type === "bulleted_list_item") out.push("- " + t);
      else if (b.type === "numbered_list_item") out.push("1. " + t);
      else if (b.type === "to_do") out.push((x.checked ? "- [x] " : "- [ ] ") + t);
      else if (b.type === "quote") out.push("> " + t);
      else if (b.type === "callout") out.push("> " + (x.icon?.emoji ? x.icon.emoji + " " : "") + t);
      else if (b.type === "code") out.push("```\n" + t + "\n```");
      else if (b.type === "toggle") out.push("▸ " + t);
      else if (["bookmark", "embed", "link_preview"].includes(b.type) && x.url) out.push(x.url);
    }
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor);
  return { matn: out.join("\n\n").trim() || null, media };
}

async function upsert(e) {
  const r = await sql`
    insert into elementlar (tur, nom, matn, soha_id, ota_id, holat, inbox, sana, vaqt, summa, kategoriya, progress, havola, meta, tartib, manba, notion_id, bajarildi_at, created_at)
    values (${e.tur}, ${e.nom}, ${e.matn ?? null}, ${e.soha ?? null}, ${e.ota ?? null}, ${e.holat ?? "ochiq"}, ${e.inbox ?? false}, ${e.sana ?? null}, ${e.vaqt ?? null}, ${e.summa ?? null}, ${e.kategoriya ?? null}, ${e.progress ?? null}, ${e.havola ?? null}, ${JSON.stringify(e.meta ?? {})}, ${e.tartib ?? null}, ${e.manba ?? "Notion"}, ${e.notion_id}, ${e.holat === "bajarildi" ? e.created ?? null : null}, ${e.created ?? new Date().toISOString()})
    on conflict (notion_id) do update set tur = excluded.tur, nom = excluded.nom, matn = excluded.matn, soha_id = excluded.soha_id, ota_id = excluded.ota_id, holat = excluded.holat, inbox = excluded.inbox, sana = excluded.sana, summa = excluded.summa, kategoriya = excluded.kategoriya, progress = excluded.progress, havola = excluded.havola, meta = excluded.meta, tartib = excluded.tartib, updated_at = now()
    returning id`;
  return r[0].id;
}

// Notion'da saqlangan faylni Telegram arxiviga qayta yuklash
async function reupload(m) {
  const blob = await (await fetch(m.url)).blob();
  const form = new FormData();
  form.append("chat_id", ARXIV);
  form.append("caption", "Notion'dan ko'chirildi: " + m.nom);
  const method = m.tur === "image" ? "sendPhoto" : m.tur === "video" ? "sendVideo" : m.tur === "audio" ? "sendAudio" : "sendDocument";
  const key = method.slice(4).toLowerCase();
  form.append(key, blob, m.nom.replace(/[^\w.-]+/g, "_").slice(0, 60) || "fayl");
  const d = await (await fetch(`https://api.telegram.org/bot${BOT}/${method}`, { method: "POST", body: form })).json();
  if (!d.ok) throw new Error(d.description);
  const msg = d.result;
  const x = msg.photo ? msg.photo[msg.photo.length - 1] : msg.video || msg.audio || msg.document;
  return { tg_msg: msg.message_id, file_id: x.file_id, hajm: x.file_size, thumb_id: (x.thumbnail || x.thumb)?.file_id ?? null };
}
const TUR_FAYL = { image: "rasm", video: "video", audio: "ovoz", file: "fayl", pdf: "fayl" };
const BOLIM_TUR = { rasm: "rasm", video: "video", ovoz: "ovoz", hujjat: "fayl" };

async function fayllar(elId, page, media) {
  await sql`delete from fayllar where element_id = ${elId}`;
  const tg = (txt(page, "TG fayl") || "").split(",").map((s) => s.trim().split(":")).filter(([b, id]) => b && id !== undefined);
  for (const [bolim, id, f, s, t] of tg) {
    if (!f && !Number(id)) continue;
    await sql`insert into fayllar (element_id, tur, nom, hajm, file_id, thumb_id, tg_msg, tg_bolim) values (${elId}, ${BOLIM_TUR[bolim] ?? "fayl"}, ${null}, ${Number(s) || null}, ${f || null}, ${t || null}, ${Number(id) || null}, ${bolim})`;
  }
  for (const m of media) {
    try {
      const r = await reupload(m);
      await sql`insert into fayllar (element_id, tur, nom, hajm, file_id, thumb_id, tg_msg, tg_bolim) values (${elId}, ${TUR_FAYL[m.tur]}, ${m.nom}, ${r.hajm ?? null}, ${r.file_id}, ${r.thumb_id}, ${r.tg_msg}, ${null})`;
    } catch (e) {
      console.log("  fayl ko'chmadi:", m.nom, e.message);
    }
  }
}

const YON = { "O'qituvchilik": "ish", Moliya: "pul", Qiziqishlar: "qiz", "Dasturlash va biznes": "loy", "O'qish (TATU)": "oqish", Kontent: "loy", "Shaxsiy hayot va rivojlanish": "riv" };
const stat = {};
const sana = (t) => (stat[t] = (stat[t] || 0) + 1);

(async () => {
  const yon = new Map((await q(DS.yonalishlar)).map((p) => [norm(p.id), YON[title(p)] ?? null]));
  const sohaOf = (p) => rel(p, "Yo'nalish").map((r) => yon.get(r)).find(Boolean) ?? null;

  // 1) Loyihalar
  const loyMap = new Map();
  for (const p of await q(DS.loyihalar)) {
    const b = await body(p.id);
    const bosqich = sel(p, "Holat");
    const id = await upsert({
      tur: "loyiha", nom: title(p), matn: b.matn, soha: sohaOf(p) ?? "loy", notion_id: p.id, created: p.created_time,
      holat: bosqich === "Arxiv" || bosqich === "To'xtatilgan" ? "bekor" : "ochiq",
      havola: p.properties.Sayt?.url ?? null,
      meta: { bosqich, tg: num(p, "Telegram obunachi") ?? 0, ig: num(p, "Instagram obunachi") ?? 0, mijoz: num(p, "Real mijozlar") ?? 0, keyingi: txt(p, "Keyingi qadam"), maqsadda: Boolean(p.properties.Maqsadda?.checkbox), reliz: date(p, "Reliz sanasi") },
    });
    loyMap.set(norm(p.id), id);
    await fayllar(id, p, b.media);
    sana("loyiha");
  }

  // 2) Yozuvlar
  const TUR = { Vazifa: "vazifa", "G'oya": "goya", Qayd: "qayd", Havola: "havola", Qaror: "qayd", Uchrashuv: "voqea", Saralanmagan: "qayd" };
  for (const p of await q(DS.yozuvlar)) {
    const b = await body(p.id);
    const turi = sel(p, "Turi") ?? "Saralanmagan";
    const holat = sel(p, "Holat");
    const ota = rel(p, "Loyiha").map((r) => loyMap.get(r)).find(Boolean) ?? null;
    const id = await upsert({
      tur: TUR[turi] ?? "qayd", nom: title(p), matn: b.matn, notion_id: p.id, created: p.created_time,
      soha: ota ? "loy" : sohaOf(p), ota, inbox: turi === "Saralanmagan" && !ota,
      holat: holat === "Bajarildi" ? "bajarildi" : holat === "Bekor" ? "bekor" : holat === "Jarayonda" ? "jarayonda" : "ochiq",
      sana: date(p, "Muddat")?.slice(0, 10) ?? null, havola: p.properties.Havola?.url ?? null,
      meta: { tez: Boolean(p.properties["Tez ish"]?.checkbox), ustuvorlik: sel(p, "Ustuvorlik"), manba: sel(p, "Manba") },
    });
    await fayllar(id, p, b.media);
    sana("yozuv");
  }

  // 3) Moliya
  for (const p of await q(DS.moliya)) {
    const b = await body(p.id);
    const id = await upsert({ tur: sel(p, "Turi") === "Daromad" ? "daromad" : "xarajat", nom: title(p), matn: b.matn, soha: "pul", notion_id: p.id, created: p.created_time, holat: "bajarildi", sana: date(p, "Sana")?.slice(0, 10), summa: num(p, "Summa"), kategoriya: sel(p, "Kategoriya") });
    await fayllar(id, p, b.media);
    sana("moliya");
  }
  // byudjet limitlari -> sozlamalar
  const limit = {};
  for (const p of await q(DS.byudjet)) limit[title(p)] = num(p, "Limit");
  await sql`insert into sozlamalar (kalit, qiymat) values ('byudjet', ${JSON.stringify(limit)}) on conflict (kalit) do update set qiymat = excluded.qiymat`;
  for (const p of await q(DS.doimiy)) { await upsert({ tur: "tolov", nom: title(p), soha: "pul", notion_id: p.id, summa: num(p, "Summa"), kategoriya: sel(p, "Kategoriya"), holat: p.properties.Faol?.checkbox === false ? "bekor" : "ochiq", meta: { turi: sel(p, "Turi"), kun: num(p, "Kun"), oxirgi: date(p, "Oxirgi") } }); sana("tolov"); }
  for (const p of await q(DS.qarzlar)) { await upsert({ tur: "qarz", nom: title(p), soha: "pul", notion_id: p.id, summa: num(p, "Summa"), sana: date(p, "Qaytarish"), holat: sel(p, "Holat") === "Qaytdi" ? "bajarildi" : "ochiq", matn: txt(p, "Izoh"), meta: { yonalish: sel(p, "Yo'nalish"), berilgan: date(p, "Sana") } }); sana("qarz"); }
  for (const p of await q(DS.jamgarma)) { await upsert({ tur: "maqsad", nom: title(p), soha: "pul", notion_id: p.id, summa: num(p, "Maqsad"), sana: date(p, "Muddat"), holat: sel(p, "Holat") === "Erishildi" ? "bajarildi" : "ochiq", meta: { yigilgan: num(p, "Yig'ilgan") ?? 0 } }); sana("maqsad"); }

  // 4) O'qitish: modullar (kurs) + darslar
  const modMap = new Map();
  for (const p of await q(DS.modullar)) {
    const b = await body(p.id);
    const id = await upsert({ tur: "kurs", nom: title(p), matn: b.matn, soha: "ish", notion_id: p.id, created: p.created_time, meta: { soat: num(p, "Jami soat"), yil: txt(p, "O'quv yili"), turi: "modul" } });
    modMap.set(norm(p.id), id); await fayllar(id, p, b.media); sana("modul");
  }
  for (const p of await q(DS.darslar)) {
    const b = await body(p.id);
    const id = await upsert({ tur: "dars", nom: title(p), matn: b.matn, soha: "ish", ota: rel(p, "Modul").map((r) => modMap.get(r)).find(Boolean) ?? null, notion_id: p.id, created: p.created_time, sana: date(p, "Sana")?.slice(0, 10), havola: p.properties.Material?.url ?? null, holat: sel(p, "Holat") === "O'tildi" ? "bajarildi" : "ochiq", tartib: num(p, "Tartib"), davomiylik: null, meta: { soat: num(p, "Soat"), guruh: txt(p, "Guruh"), bolim: txt(p, "Bo'lim") } });
    await fayllar(id, p, b.media); sana("dars");
  }
  // 5) TATU: fanlar (kurs) + topshiriqlar
  const fanMap = new Map();
  for (const p of await q(DS.fanlar)) {
    const b = await body(p.id);
    const id = await upsert({ tur: "kurs", nom: title(p), matn: b.matn, soha: "oqish", notion_id: p.id, created: p.created_time, holat: sel(p, "Holat") === "Tugagan" ? "bajarildi" : "ochiq", meta: { turi: "fan", semestr: num(p, "Semestr"), oqituvchi: txt(p, "O'qituvchi"), baho: txt(p, "Baho") } });
    fanMap.set(norm(p.id), id); await fayllar(id, p, b.media); sana("fan");
  }
  for (const p of await q(DS.topshiriqlar)) {
    const b = await body(p.id);
    const id = await upsert({ tur: "vazifa", nom: title(p), matn: b.matn, soha: "oqish", ota: rel(p, "Fan").map((r) => fanMap.get(r)).find(Boolean) ?? null, notion_id: p.id, created: p.created_time, sana: date(p, "Muddat")?.slice(0, 10), holat: sel(p, "Holat") === "Topshirildi" ? "bajarildi" : sel(p, "Holat") === "Jarayonda" ? "jarayonda" : "ochiq", meta: { turi: sel(p, "Turi"), ball: num(p, "Ball") } });
    await fayllar(id, p, b.media); sana("topshiriq");
  }
  // 6) O'rganish + darslari
  const orgMap = new Map();
  const OT = { Kurs: ["kurs", "riv"], Kitob: ["kitob", "riv"], Video: ["havola", "riv"], "Ko'nikma": ["kurs", "riv"], Qiziqish: ["goya", "qiz"], Boshqa: ["qayd", "riv"] };
  for (const p of await q(DS.organish)) {
    const b = await body(p.id);
    const [tur, soha] = OT[sel(p, "Turi")] ?? ["kurs", "riv"];
    const h = sel(p, "Holat");
    const id = await upsert({ tur, nom: title(p), matn: [txt(p, "Izoh"), b.matn].filter(Boolean).join("\n\n") || null, soha, notion_id: p.id, created: p.created_time, havola: p.properties.Havola?.url ?? null, progress: num(p, "Progress"), holat: h === "Tugadi" ? "bajarildi" : h === "To'xtatildi" ? "bekor" : h === "Jarayonda" ? "jarayonda" : "ochiq" });
    orgMap.set(norm(p.id), id); await fayllar(id, p, b.media); sana("organish");
  }
  for (const p of await q(DS.odars)) {
    const b = await body(p.id);
    const id = await upsert({ tur: "dars", nom: title(p), matn: b.matn, soha: "riv", ota: rel(p, "Kurs").map((r) => orgMap.get(r)).find(Boolean) ?? null, notion_id: p.id, created: p.created_time, havola: p.properties.Havola?.url ?? null, tartib: num(p, "Tartib"), holat: sel(p, "Holat") === "Ko'rildi" ? "bajarildi" : "ochiq", meta: { bolim: txt(p, "Bo'lim") } });
    await fayllar(id, p, b.media); sana("odars");
  }
  console.log("ko'chirildi:", stat);
  console.log(await sql`select tur, soha_id, count(*)::int n from elementlar group by 1,2 order by 1,2`);
  console.log("fayllar:", (await sql`select count(*)::int n from fayllar`)[0].n);
})().catch((e) => { console.error("XATO", e); process.exit(1); });
