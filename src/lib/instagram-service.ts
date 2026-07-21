const GRAPH_API_VERSION = "v21.0";
const MAX_CAPTION_LENGTH = 2200;
const CONTAINER_POLL_ATTEMPTS = 10;
const CONTAINER_POLL_DELAY_MS = 2000;

interface GraphApiError {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

export class InstagramService {
  private static get accessToken(): string {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
    if (!token) {
      throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured");
    }
    return token;
  }

  private static get userId(): string {
    const id = process.env.INSTAGRAM_USER_ID?.trim();
    if (!id) {
      throw new Error("INSTAGRAM_USER_ID is not configured");
    }
    return id;
  }

  static isConfigured(): boolean {
    return Boolean(
      process.env.INSTAGRAM_ACCESS_TOKEN?.trim() &&
        process.env.INSTAGRAM_USER_ID?.trim(),
    );
  }

  static prepareCaption(rawCaption: string): string {
    let caption = rawCaption.trim();

    caption = caption.replace(/\\([_*\[\]()~`>#+\-=|{}.!])/g, "$1");
    caption = caption.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1\n$2");
    caption = caption.replace(/[*_`~]/g, "");
    caption = caption.replace(/\n{3,}/g, "\n\n");

    if (caption.length > MAX_CAPTION_LENGTH) {
      caption = `${caption.slice(0, MAX_CAPTION_LENGTH - 1)}…`;
    }

    return caption;
  }

  static async publishPhoto(
    imageUrl: string,
    caption: string,
  ): Promise<{ mediaId: string }> {
    const creationId = await this.createMediaContainer(imageUrl, caption);
    await this.waitForContainerReady(creationId);
    const mediaId = await this.publishMediaContainer(creationId);
    return { mediaId };
  }

  private static async createMediaContainer(
    imageUrl: string,
    caption: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: this.accessToken,
    });

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.userId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      },
    );

    const data = (await response.json()) as { id?: string } & GraphApiError;

    if (!response.ok || !data.id) {
      throw new Error(
        data.error?.message ??
          `Failed to create Instagram media container (${response.status})`,
      );
    }

    return data.id;
  }

  private static async waitForContainerReady(
    containerId: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt++) {
      const response = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}?fields=status_code&access_token=${encodeURIComponent(this.accessToken)}`,
      );

      const data = (await response.json()) as {
        status_code?: string;
      } & GraphApiError;

      if (!response.ok) {
        throw new Error(
          data.error?.message ??
            `Failed to check Instagram container status (${response.status})`,
        );
      }

      if (data.status_code === "FINISHED") {
        return;
      }

      if (data.status_code === "ERROR") {
        throw new Error("Instagram failed to process the image");
      }

      await new Promise((resolve) =>
        setTimeout(resolve, CONTAINER_POLL_DELAY_MS),
      );
    }

    throw new Error("Instagram image processing timed out");
  }

  private static async publishMediaContainer(
    creationId: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      creation_id: creationId,
      access_token: this.accessToken,
    });

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.userId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      },
    );

    const data = (await response.json()) as { id?: string } & GraphApiError;

    if (!response.ok || !data.id) {
      throw new Error(
        data.error?.message ??
          `Failed to publish Instagram post (${response.status})`,
      );
    }

    return data.id;
  }
}
