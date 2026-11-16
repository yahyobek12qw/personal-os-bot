// Telegram arxivi fayllarini ilovaga uzatuvchi proksi.
// Bot tokeni brauzerga chiqmaydi: havola HMAC imzosi bilan himoyalangan va 6 soatda eskiradi.
// Video uchun Range so'rovlari qo'llanadi (bo'laklab, har biri ≤3.5 MB).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { imzoTekshir } from "../lib/media";

const BOLAK = 3.5 * 1024 * 1024;
const YOL = new Map<string, { path: string; size: number; t: number }>();

const TURLAR: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4",
  oga: "audio/ogg", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4",
};

async function faylYoli(token: string, f: string) {
  const k = YOL.get(f);
  if (k && Date.now() - k.t < 50 * 60 * 1000) return k;
  const r = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(f)}`);
  const d: any = await r.json();
  if (!d.ok) return null;
  const v = { path: d.result.file_path as string, size: Number(d.result.file_size ?? 0), t: Date.now() };
  YOL.set(f, v);
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const f = String(req.query.f || "");
  const e = Number(req.query.e || 0);
  const s = String(req.query.s || "");
  if (!f || !imzoTekshir(f, e, s)) return res.status(403).send("forbidden");
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const y = await faylYoli(token, f);
  if (!y) return res.status(413).send("too big or missing");

  const ext = y.path.split(".").pop()?.toLowerCase() ?? "";
  const turi = TURLAR[ext] ?? (y.path.startsWith("photos/") || y.path.startsWith("thumbnails/") ? "image/jpeg" : "application/octet-stream");
  const range = String(req.headers.range || "");
  const m = range.match(/bytes=(\d*)-(\d*)/);
  let bosh = 0;
  let oxir = y.size ? y.size - 1 : 0;
  const qisman = Boolean(m) || (y.size > BOLAK);
  if (m) {
    if (m[1]) bosh = Number(m[1]);
    else if (m[2]) bosh = Math.max(0, y.size - Number(m[2]));
    if (m[1] && m[2]) oxir = Number(m[2]);
  }
  if (y.size) oxir = Math.min(oxir, bosh + BOLAK - 1, y.size - 1);

  const r = await fetch(`https://api.telegram.org/file/bot${token}/${y.path}`, {
    headers: qisman && y.size ? { Range: `bytes=${bosh}-${oxir}` } : {},
  });
  if (!r.ok && r.status !== 206) return res.status(502).send("upstream");
  const buf = Buffer.from(await r.arrayBuffer());
  res.setHeader("Content-Type", turi);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=21600");
  if (qisman && y.size) {
    res.setHeader("Content-Range", `bytes ${bosh}-${bosh + buf.length - 1}/${y.size}`);
    res.setHeader("Content-Length", String(buf.length));
    return res.status(206).end(buf);
  }
  res.setHeader("Content-Length", String(buf.length));
  return res.status(200).end(buf);
}
