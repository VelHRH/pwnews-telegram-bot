const PAUSE_KEY = "cron_pause_until";
const PAUSE_HOURS = 12;
const PAUSE_MS = PAUSE_HOURS * 60 * 60 * 1000;
const MOSCOW_TZ = "Europe/Moscow";

let memoryPauseUntil: number | null = null;

function getKvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function kvGet(key: string): Promise<string | null> {
  const config = getKvConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/get/${key}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("KV get failed:", response.status, await response.text());
    return null;
  }

  const data = (await response.json()) as { result?: string | null };
  return data.result ?? null;
}

async function kvSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<boolean> {
  const config = getKvConfig();
  if (!config) return false;

  const response = await fetch(
    `${config.url}/set/${key}/${value}?ex=${ttlSeconds}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error("KV set failed:", response.status, await response.text());
    return false;
  }

  return true;
}

async function kvDel(key: string): Promise<void> {
  const config = getKvConfig();
  if (!config) return;

  await fetch(`${config.url}/del/${key}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
  });
}

function formatMoscowTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    timeZone: MOSCOW_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRemaining(until: number): string {
  const remainingMs = Math.max(0, until - Date.now());
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}ч ${minutes}м`;
}

export class CronPauseService {
  static readonly PAUSE_BUTTON_LABEL = "⏸ Отключить все задачи на 12ч";
  static readonly RESUME_BUTTON_LABEL = "▶️ Возобновить все задачи";

  static async getPauseUntil(): Promise<number | null> {
    const fromKv = await kvGet(PAUSE_KEY);
    if (fromKv) {
      const until = Number(fromKv);
      if (!Number.isFinite(until)) return null;
      if (Date.now() >= until) {
        await this.clearPause();
        return null;
      }
      return until;
    }

    if (memoryPauseUntil && Date.now() >= memoryPauseUntil) {
      memoryPauseUntil = null;
      return null;
    }

    return memoryPauseUntil;
  }

  static async isPaused(): Promise<boolean> {
    return (await this.getPauseUntil()) !== null;
  }

  static async pauseFor12Hours(): Promise<number> {
    const until = Date.now() + PAUSE_MS;
    const stored = await kvSet(PAUSE_KEY, String(until), PAUSE_HOURS * 60 * 60);

    if (!stored) {
      memoryPauseUntil = until;
      if (!getKvConfig()) {
        console.warn(
          "KV/Redis not configured — cron pause stored in memory only (may not persist across serverless invocations)",
        );
      }
    }

    return until;
  }

  static async clearPause(): Promise<void> {
    await kvDel(PAUSE_KEY);
    memoryPauseUntil = null;
  }

  static getResumedMessage(): string {
    return "Автоматические задачи возобновлены.";
  }

  static getPausedMessage(until: number): string {
    return (
      `Автоматические задачи отключены на ${PAUSE_HOURS} часов.\n` +
      `Включатся ${formatMoscowTime(until)} (МСК) — через ${formatRemaining(until)}.`
    );
  }

  static async getToggleButtonLabel(): Promise<string> {
    return (await this.isPaused())
      ? this.RESUME_BUTTON_LABEL
      : this.PAUSE_BUTTON_LABEL;
  }
}
