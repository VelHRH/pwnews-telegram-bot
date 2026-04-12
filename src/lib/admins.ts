import type { Context } from '@/types/telegram';

function loadAdminUsernames(): Set<string> {
  const raw = process.env.ADMINS_LIST?.trim() ?? '';
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean),
  );
}

const adminUsernames = loadAdminUsernames();

export function isAdmin(ctx: Context): boolean {
  const username = ctx.from?.username;
  if (!username) return false;
  return adminUsernames.has(username.toLowerCase());
}

/** Reject updates from users not listed in ADMINS_LIST. */
export async function adminOnlyMiddleware(
  ctx: Context,
  next: () => Promise<void>,
): Promise<void> {
  if (isAdmin(ctx)) {
    await next();
    return;
  }
  const msg = ctx.message;
  if (msg && 'text' in msg && typeof msg.text === 'string') {
    await ctx.reply('Доступ запрещён.');
  }
}
