import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { jadvalTayyorla, apiNavbat, apiOl, apiJarayon, apiNatija, apiHolat, apiXabar, apiYangi } from "../lib/agent";

// Rejali Claude shu API orqali navbatni o'qiydi va natija yuboradi.
// Kirish: Authorization: Bearer <AGENT_SECRET>
function ruxsat(req: VercelRequest) {
  const s = process.env.AGENT_SECRET || "";
  const h = String(req.headers.authorization || "");
  const k = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!s || k.length !== s.length) return false;
  return crypto.timingSafeEqual(Buffer.from(k), Buffer.from(s));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ruxsat(req)) return res.status(401).json({ xato: "unauthorized" });
  try {
    await jadvalTayyorla();
    if (req.method === "GET") return res.status(200).json({ vazifalar: await apiNavbat() });
    if (req.method !== "POST") return res.status(405).json({ xato: "method" });
    const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    const id = Number(b.id);
    switch (b.amal) {
      case "ol":
        return res.status(200).json({ olindi: await apiOl(id, b.taxmin_daq ? Number(b.taxmin_daq) : undefined, Array.isArray(b.reja) ? b.reja : undefined) });
      case "jarayon":
        return res.status(200).json(await apiJarayon(id, String(b.bosqich ?? ""), b.taxmin_daq ? Number(b.taxmin_daq) : undefined));
      case "natija":
        if (!b.matn) return res.status(400).json({ xato: "matn kerak" });
        return res.status(200).json(await apiNatija(id, { matn: b.matn, media_url: b.media_url, media_tur: b.media_tur, izoh: b.izoh }));
      case "holat":
        return res.status(200).json(await apiHolat(id, String(b.holat), b.izoh, b.havola, Boolean(b.jim)));
      case "yangi":
        if (!b.buyruq) return res.status(400).json({ xato: "buyruq kerak" });
        return res.status(200).json(await apiYangi(b));
      case "xabar":
        return res.status(200).json(await apiXabar(String(b.matn ?? "")));
      default:
        return res.status(400).json({ xato: "amal: ol | jarayon | natija | holat | yangi | xabar" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ xato: String((e as Error).message).slice(0, 300) });
  }
}
