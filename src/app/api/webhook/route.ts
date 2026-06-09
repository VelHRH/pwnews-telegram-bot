import { NextRequest, NextResponse } from "next/server";
import { getBot } from "@/lib/bot";
import { adminOnlyMiddleware } from "@/lib/admins";
import { CronPauseService } from "@/lib/cron-pause";
import { NewsService } from "@/lib/news-service";
import { KeyboardService } from "@/lib/keyboard";
import { Context } from "@/types/telegram";

let handlersSetup = false;

function setupBotHandlers() {
  const bot = getBot();

  // Only setup handlers once
  if (handlersSetup) {
    return bot;
  }

  bot.use(adminOnlyMiddleware);

  bot.start(async (ctx: Context) => {
    console.log("Start command received from user:", ctx.from?.id);
    await ctx.reply(
      "Добро пожаловать! 👋",
      await KeyboardService.getMainKeyboard(),
    );
  });

  // Review handlers
  bot.hears("📝 Опубликовать обзор", async (ctx: Context) => {
    await NewsService.publishReview(ctx);
  });

  bot.hears("✅ Опубликовать обзор", async (ctx: Context) => {
    await NewsService.handleReviewResponse(ctx, "✅ Опубликовать обзор");
  });

  bot.hears("📝 Изменить текст обзора", async (ctx: Context) => {
    await NewsService.handleReviewResponse(ctx, "📝 Изменить текст обзора");
  });

  bot.hears("❌ Отменить публикацию обзора", async (ctx: Context) => {
    await NewsService.handleReviewResponse(
      ctx,
      "❌ Отменить публикацию обзора",
    );
  });

  // PPV handlers
  bot.hears("🎉 Опубликовать результаты PPV/спецшоу", async (ctx: Context) => {
    await NewsService.publishPPVResults(ctx);
  });

  bot.hears("Сейчас", async (ctx: Context) => {
    await NewsService.handlePPVTimeSelection(ctx, "Сейчас");
  });

  bot.hears("В 7:30", async (ctx: Context) => {
    await NewsService.handlePPVTimeSelection(ctx, "В 7:30");
  });

  bot.hears("В 8:30", async (ctx: Context) => {
    await NewsService.handlePPVTimeSelection(ctx, "В 8:30");
  });

  bot.hears("В 9:00", async (ctx: Context) => {
    await NewsService.handlePPVTimeSelection(ctx, "В 9:00");
  });

  // Weekly results handlers
  bot.hears("Опубликовать результаты еженедельника", async (ctx: Context) => {
    await NewsService.publishWeeklyResults(ctx);
  });

  bot.hears("✅ Да", async (ctx: Context) => {
    await NewsService.handleWeeklyConfirmation(ctx, true);
  });

  bot.hears("❌ Нет", async (ctx: Context) => {
    await NewsService.handleWeeklyConfirmation(ctx, false);
  });

  // Other news handler
  bot.hears("🔗 Опубликовать другое", async (ctx: Context) => {
    await NewsService.publishOtherNews(ctx);
  });

  bot.hears(
    [
      CronPauseService.PAUSE_BUTTON_LABEL,
      CronPauseService.RESUME_BUTTON_LABEL,
    ],
    async (ctx: Context) => {
      const pauseUntil = await CronPauseService.getPauseUntil();

      if (pauseUntil) {
        await CronPauseService.clearPause();
        await ctx.reply(
          CronPauseService.getResumedMessage(),
          await KeyboardService.getMainKeyboard(),
        );
        return;
      }

      const until = await CronPauseService.pauseFor12Hours();
      await ctx.reply(
        CronPauseService.getPausedMessage(until),
        await KeyboardService.getMainKeyboard(),
      );
    },
  );

  // Cancel handler for "other news" process
  bot.hears("❌ Отмена", async (ctx: Context) => {
    await NewsService.cancelOtherNews(ctx);
  });

  // Publish handler for "other news"
  bot.hears("✅ Опубликовать", async (ctx: Context) => {
    await NewsService.publishOtherNewsToChannel(ctx);
  });

  // Text message handler
  bot.on("text", async (ctx: Context) => {
    const text =
      ctx.message && "text" in ctx.message ? ctx.message.text : undefined;

    if (!text) return;

    // First check if user is in "other news" creation process
    const isHandledByOtherNews = await NewsService.handleOtherNewsInput(
      ctx,
      text,
    );
    if (isHandledByOtherNews) return;

    // Check if the message contains a pwnews.net URL
    const urlMatch = text.match(/(https?:\/\/(?:www\.)?pwnews\.net[^\s]+)/);

    if (urlMatch) {
      const url = urlMatch[1];
      await ctx.reply(`Обрабатываю ссылку: ${url}`);
      await NewsService.publishPPVResults(ctx, url);
    } else {
      // Handle potential review text modification
      await NewsService.handleReviewResponse(ctx, text);
    }
  });

  handlersSetup = true;
  return bot;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Received webhook update:", JSON.stringify(body, null, 2));

    // Setup handlers and process the update
    const bot = setupBotHandlers();
    await bot.handleUpdate(body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    console.error(
      "Error details:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: "Telegram bot webhook endpoint" });
}
