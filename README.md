# Personal OS — Telegram bot

Telegram'ga yozgan har bir xabaringiz Notion'dagi **Yozuvlar** (Inbox) yoki **Moliya** bazasiga tushadi. Bot har kuni 19:00 da bugungi vazifalar haqida eslatma yuboradi.

## Botga nima yozish mumkin

| Yozasiz | Natija |
| --- | --- |
| `ertaga 3-guruhga test` | Yozuvlar → Saralanmagan (Inbox) |
| `v: EduFlow login bugini tuzatish` | Yozuvlar → Vazifa |
| `g: Textile uchun demo video` | Yozuvlar → G'oya |
| `https://... izoh` | Yozuvlar → Havola |
| `+500000 maosh` | Moliya → Daromad (Maosh) |
| `-30k taksi`, `-200 ming bozor`, `-1.5mln noutbuk` | Moliya → Xarajat |
| `/bugun` | Bugungi va kechikkan vazifalar |

## O'rnatish (taxminan 20 daqiqa)

1. **Bot yarating.** Telegram'da @BotFather → `/newbot`. Bergan tokenni `TELEGRAM_BOT_TOKEN` sifatida saqlang.
2. **Telegram ID'ingizni oling.** @userinfobot'ga yozing, `Id` raqamini `ALLOWED_CHAT_ID` ga qo'ying. Bot faqat shu ID'dan kelgan xabarlarni qabul qiladi.
3. **Notion integratsiyasi.** https://www.notion.so/my-integrations → *New integration* → Internal. Tokenni `NOTION_TOKEN` ga qo'ying.
   Keyin Notion'da **Personal OS** sahifasini oching → `•••` → *Connections* → integratsiyangizni qo'shing. Busiz bot bazalarga yoza olmaydi.
4. **Vercel'ga deploy.** Papkani GitHub'ga yuklang va Vercel'da import qiling (yoki `npx vercel deploy --prod`).
   *Settings → Environment Variables* ga `.env.example` dagi barcha o'zgaruvchilarni kiriting. `TELEGRAM_SECRET` va `CRON_SECRET` uchun istalgan uzun tasodifiy matn yozing.
5. **Webhook'ni ulang** (bir marta):

   ```
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<loyiha>.vercel.app/api/telegram&secret_token=<TELEGRAM_SECRET>"
   ```

6. **Sinab ko'ring.** Botga `salom test` yozing → "✅ Inbox'ga tushdi" javobi kelishi va yozuv Notion Inbox'da ko'rinishi kerak.

## Eslatmalar

- 19:00 eslatmasi Vercel Cron orqali ishlaydi (`vercel.json`, 14:00 UTC). Bepul Hobby tarifida cron vaqti bir soat ichida o'zgarishi mumkin, ya'ni eslatma 19:00–19:59 oralig'ida keladi.
- Notion'ga yozib bo'lmasa, bot "⚠️" bilan javob beradi. Xabaringiz yo'qolmasligi uchun uni qayta yuboring.
- Hozircha faqat matnli xabarlar qabul qilinadi. Ovozli xabarlarni keyinroq qo'shish mumkin.

## Tekshiruv

```
npm install
npm test        # xabarlarni tahlil qilish qoidalari
npx tsc -p .    # turlarni tekshirish
```
