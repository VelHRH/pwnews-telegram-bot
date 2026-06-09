import { Markup } from "telegraf";
import type { Context } from "@/types/telegram";

function loadAdminUsernames(): Set<string> {
  const raw = process.env.ADMINS_LIST?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
  );
}

const adminUsernames = loadAdminUsernames();

export function isAdmin(ctx: Context): boolean {
  const username = ctx.from?.username;
  if (!username) return false;
  return adminUsernames.has(username.toLowerCase());
}

function isStartCommand(ctx: Context): boolean {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || typeof msg.text !== "string") return false;
  return msg.text.startsWith("/start");
}

export async function adminOnlyMiddleware(
  ctx: Context,
  next: () => Promise<void>,
): Promise<void> {
  if (isAdmin(ctx)) {
    await next();
    return;
  }

  if (isStartCommand(ctx)) {
    await ctx.reply("Доступ запрещён.", Markup.removeKeyboard());
    if (ctx.chat?.id) {
      await ctx.telegram.setMyCommands([], {
        scope: { type: "chat", chat_id: ctx.chat.id },
      });
    }
  }
}
