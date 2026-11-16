// Bot faqat egasi uchun: buyruqlar menyusi va Mini App tugmasi faqat egasining chatida ko'rinadi.
// Takroriy chaqirish xavfsiz (idempotent).
import { tg } from "./telegram";

let bajarildi = false;

export async function faqatEgasiga(): Promise<Record<string, unknown>> {
  const egasiId = Number(process.env.ALLOWED_CHAT_ID);
  const scope = { type: "chat", chat_id: egasiId };
  const umumiy: any[] = await tg("getMyCommands", {});
  if (umumiy.length) {
    const egasinki: any[] = await tg("getMyCommands", { scope });
    if (!egasinki.length) await tg("setMyCommands", { commands: umumiy, scope });
    await tg("deleteMyCommands", {});
  }
  const tugma = await tg("getChatMenuButton", {});
  if (tugma?.type === "web_app") {
    // egasining chatiga aniq o'rnatiladi (aks holda umumiy sozlamani meros qilib oladi)
    await tg("setChatMenuButton", { chat_id: egasiId, menu_button: tugma });
    await tg("setChatMenuButton", { menu_button: { type: "commands" } });
  }
  bajarildi = true;
  return {
    umumiy_buyruqlar: (await tg("getMyCommands", {})).length,
    egasi_buyruqlar: (await tg("getMyCommands", { scope })).length,
    umumiy_tugma: (await tg("getChatMenuButton", {}))?.type,
    egasi_tugma: (await tg("getChatMenuButton", { chat_id: egasiId }))?.type,
  };
}

// Har ishga tushishda bir marta (egasi yozganda) — xato bo'lsa jim
export function birMartaYashir() {
  if (bajarildi) return Promise.resolve();
  return faqatEgasiga().then(() => {}).catch((e) => console.error("maxfiy", e));
}
