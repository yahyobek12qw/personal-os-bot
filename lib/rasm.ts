import { q } from "./db";

// Cloudflare Workers AI (FLUX.1 schnell) — bepul kunlik limit ichida fon/illyustratsiya rasmlari
const KUNLIK_CHEK = 30;
const MODEL = "@cf/black-forest-labs/flux-1-schnell";

export const rasmBor = () => Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_AI_TOKEN);

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
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CF_AI_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: Math.min(8, Math.max(1, qadam)) }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.result?.image) throw new Error(`Cloudflare: ${j?.errors?.[0]?.message ?? r.status}`);
  return { base64: j.result.image, mime: "image/jpeg", bugun: soni, qoldi: Math.max(0, KUNLIK_CHEK - soni) };
}
