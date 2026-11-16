// Telegram callback_data 64 bayt bilan cheklangan, shuning uchun UUID'ni 22 belgiga qisqartiramiz.

export function qisqa(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ""), "hex").toString("base64url");
}

export function toliq(s: string): string {
  const h = Buffer.from(s, "base64url").toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
