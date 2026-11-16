import { q } from "./db";

// Cloudflare Workers AI (FLUX.1 schnell) — bepul kunlik limit ichida fon/illyustratsiya rasmlari
const KUNLIK_CHEK = 30;
const MODEL = "@cf/black-forest-labs/flux-1-schnell";

const ID = () => String(process.env.CF_ACCOUNT_ID ?? "").trim();
const KALIT = () => String(process.env.CF_AI_TOKEN ?? "").trim().replace(/^Bearer\s+/i, "");
export const rasmBor = () => Boolean(ID() && KALIT());

// Diagnostika: kalit va akkaunt to'g'rimi (maxfiy qiymatlar qaytarilmaydi)
export async function rasmTekshir() {
  const h = { Authorization: `Bearer ${KALIT()}` };
  const j = async (u: string) => { const r = await fetch(u, { headers: h }); const d: any = await r.json().catch(() => ({})); return { http: r.status, ok: d?.success ?? false, xato: d?.errors?.[0]?.message ?? null, holat: d?.result?.status ?? null }; };
  return {
    id_uzunligi: ID().length, id_hex32: /^[0-9a-f]{32}$/i.test(ID()), kalit_uzunligi: KALIT().length,
    user_token: await j("https://api.cloudflare.com/client/v4/user/tokens/verify"),
    account_token: await j(`https://api.cloudflare.com/client/v4/accounts/${ID()}/tokens/verify`),
    modellar: await j(`https://api.cloudflare.com/client/v4/accounts/${ID()}/ai/models/search?per_page=1`),
  };
}

async function hisobla(): Promise<number> {
  const kun = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const r = await q(`insert into agent_sozlama (kalit, qiymat) values ('rasm_hisob', jsonb_build_object('kun', $1::text, 'soni', 1))
    on conflict (kalit) do update set qiymat = jsonb_build_object('kun', $1::text,
      'soni', case when agent_sozlama.qiymat->>'kun' = $1 then coalesce((agent_sozlama.qiymat->>'soni')::int, 0) + 1 else 1 end)
    returning (qiymat->>'soni')::int soni`, [kun]);
  return r[0].soni as number;
}

export async function rasmYasa(prompt: string, qadam = 6): Promise<{ base64: string; mime: string; bugun: number; qoldi: number }> {
  if (!rasmBor()) throw new Error("Cloudflare kaliti (CF_ACCOUNT_ID, CF_AI_TOKEN) o'rnatilmagan");
  if (!prompt?.trim()) throw new Error("prompt kerak");
  const soni = await hisobla();
  if (soni > KUNLIK_CHEK) throw new Error(`Bugungi rasm limiti (${KUNLIK_CHEK}) tugadi`);
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ID()}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KALIT()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: Math.min(8, Math.max(1, qadam)) }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.result?.image) throw new Error(`Cloudflare: ${j?.errors?.[0]?.message ?? r.status}`);
  return { base64: j.result.image, mime: "image/jpeg", bugun: soni, qoldi: Math.max(0, KUNLIK_CHEK - soni) };
}
