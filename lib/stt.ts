// Ovozni matnga aylantirish.
// 1) GEMINI_API_KEY bo'lsa — Google Gemini (o'zbek tilini yaxshi taniydi).
// 2) Aks holda yoki Gemini xato bersa — Groq Whisper (STT_API_KEY).

export const geminiBor = () => Boolean(process.env.GEMINI_API_KEY);
export const groqBor = () => Boolean(process.env.STT_API_KEY);
export const sttBor = () => geminiBor() || groqBor();

const XAYOLIY = /^(thank you( for watching)?|thanks for watching|subtitles by|you|txt|продолжение следует|субтитры.*|спасибо за просмотр|редактор субтитров.*)[.!]?$/i;

const KORSATMA = `Bu audio — o'zbek tilidagi qisqa ovozli eslatma (orasida rus yoki ingliz so'zlari bo'lishi mumkin).
Aytilgan gapni so'zma-so'z, o'zbek lotin alifbosida, to'g'ri imlo bilan yoz (o', g', sh, ch, ng; tutuq belgisi ').
Raqamlar, sanalar va summalarni raqam bilan yoz (masalan: 15 ming, 25.11).
Hech narsa qo'shma, tarjima qilma, izoh berma. Tinish belgilarini qo'y.
Avval audioda inson nutqi bor-yo'qligini aniqla. Jimlik, shovqin, signal ovozi yoki musiqa bo'lsa — nutq=false va matn bo'sh.
Hech qachon so'z o'ylab topma yoki taxmin qilma.`;

function geminiMime(mime: string) {
  const m = mime.split(";")[0].toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "audio/aac";
  if (m.includes("mpeg") || m.includes("mp3")) return "audio/mp3";
  if (m.includes("wav")) return "audio/wav";
  if (m.includes("ogg") || m.includes("oga") || m.includes("opus")) return "audio/ogg";
  return m || "audio/webm";
}

function mimeNomdan(nomi: string, blobType: string) {
  if (blobType && blobType !== "application/octet-stream") return blobType;
  const ext = nomi.split(".").pop()?.toLowerCase() ?? "";
  return ({ oga: "audio/ogg", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", webm: "audio/webm" } as Record<string, string>)[ext] ?? "audio/ogg";
}

export async function gemini(audio: Blob, nomi: string, model = "gemini-3.5-flash", sxema = true, ms = 20000): Promise<string> {
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(ms),
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: geminiMime(mimeNomdan(nomi, audio.type)), data } }, { text: KORSATMA }] }],
      generationConfig: {
        temperature: 0,
        ...(sxema ? { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { nutq: { type: "BOOLEAN" }, matn: { type: "STRING" } }, required: ["nutq", "matn"], propertyOrdering: ["nutq", "matn"] } } : {}),
        ...(model.includes("2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${j?.error?.message ?? ""}`);
  const raw = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  let matn = "";
  try {
    const o = JSON.parse(raw);
    matn = o.nutq === false ? "" : String(o.matn ?? "");
  } catch {
    matn = raw;
  }
  return matn.replace(/\s+/g, " ").trim();
}

async function groq(audio: Blob, nomi: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, nomi);
  form.append("model", process.env.STT_MODEL || "whisper-large-v3");
  form.append("language", process.env.STT_LANG || "uz");
  form.append("temperature", "0");
  form.append("response_format", "verbose_json");
  const res = await fetch(process.env.STT_URL || "https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STT_API_KEY}` },
    body: form,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Ovozni matnga aylantirib bo'lmadi: ${data?.error?.message ?? res.status}`);
  const segs: any[] = Array.isArray(data.segments) ? data.segments : [];
  const bolaklar = segs.length
    ? segs.filter((s) => (s.no_speech_prob ?? 0) < 0.6 && (s.avg_logprob ?? 0) > -1.2).map((s) => String(s.text).trim())
    : [String(data.text ?? "").trim()];
  return bolaklar.filter((t) => t && !XAYOLIY.test(t)).join(" ").replace(/\s+/g, " ").trim();
}

const BAND = new Map<string, number>();

export async function transkripsiya(audio: Blob, nomi: string, soniya?: number): Promise<string> {
  // Opus (webm/ogg) jimlikni juda siqadi: soniyasiga ~600 bayt, nutq esa ~5–10 KB.
  // Jim yozuvni modelga yubormaymiz — aks holda u gap o'ylab topadi.
  const opus = /webm|ogg|opus|oga/i.test(`${audio.type} ${nomi}`);
  if (opus && soniya && soniya >= 1 && audio.size / soniya < 1500) {
    console.log("STT", JSON.stringify({ manba: "jimlik", bayt: audio.size, soniya }));
    return "";
  }
  let manba = "groq";
  let matn = "";
  if (geminiBor()) {
    // Asosiy model band bo'lsa (503) yoki javob kechiksa — keyingisiga o'tamiz
    // Bepul tarifda har bir modelga kuniga ~20 so'rov — limiti tugaganini eslab qolamiz.
    const modellar = (process.env.GEMINI_MODELS || "gemini-3.5-flash,gemini-3.7-flash,gemini-3.8-flash").split(",").map((x) => x.trim()).filter(Boolean);
    let ok = false;
    for (const [i, model] of modellar.entries()) {
      if ((BAND.get(model) ?? 0) > Date.now()) continue;
      try {
        matn = await gemini(audio, nomi, model, true, i === 0 ? 15000 : 10000);
        manba = model;
        ok = true;
        break;
      } catch (e: any) {
        const x = String(e?.message ?? e);
        console.error(model, x.slice(0, 160));
        if (x.includes("429")) {
          const m = x.match(/retry in (?:(\d+)h)?(?:(\d+)m)?/);
          const ms = m ? (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + 1) * 60000 : 10 * 60000;
          BAND.set(model, Date.now() + ms);
        }
      }
    }
    if (!ok) {
      if (!groqBor()) throw new Error("Ovozni matnga aylantirib bo'lmadi, qayta urinib ko'ring");
      matn = await groq(audio, nomi);
    }
  } else {
    matn = await groq(audio, nomi);
  }
  if (XAYOLIY.test(matn)) matn = "";
  console.log("STT", JSON.stringify({ manba, bayt: audio.size, uzunlik: matn.length }));
  return matn;
}
