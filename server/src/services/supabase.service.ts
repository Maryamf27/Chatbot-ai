import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const DEFAULT_BUCKET = "generated-images";

type UploadCtx = {
  convoId?: string;
  requestId?: string;
};

type UploadResult = {
  url: string;
};

class SupabaseStorageService {
  private client: SupabaseClient | null = null;
  private initError: string | null = null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      this.initError =
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env";
      return;
    }
    try {
      this.client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch (err) {
      this.initError = "Supabase client failed to initialize.";
    }
  }

  private bucketName(): string {
    return process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET;
  }

  private requireClient(): SupabaseClient {
    if (!this.client || this.initError) {
      throw new Error(this.initError ?? "Supabase client unavailable");
    }
    return this.client;
  }

  private static extensionFromMime(contentType: string): string {
    if (contentType.includes("png")) return "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
    if (contentType.includes("webp")) return "webp";
    if (contentType.includes("gif")) return "gif";
    return "png";
  }

  async uploadGeneratedImage(
    buffer: Buffer,
    contentType: string,
    ctx: UploadCtx = {}
  ): Promise<UploadResult> {
    const client = this.requireClient();
    const bucket = this.bucketName();

    const namespace = ctx.convoId ?? ctx.requestId ?? `req-${Date.now()}`;
    const ext = SupabaseStorageService.extensionFromMime(contentType);
    const fileName = `${namespace}/${randomUUID()}.${ext}`;

    try {
      const { error: uploadError } = await client.storage
        .from(bucket)
        .upload(fileName, buffer, {
          contentType: contentType || "image/png",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message || "Upload failed");
      }

      const { data } = client.storage.from(bucket).getPublicUrl(fileName);
      const url = data?.publicUrl;
      if (!url) {
        throw new Error("Could not obtain public URL after upload");
      }
      return { url };
    } catch (err) {
      const safeMessage =
        err instanceof Error && !err.message.includes(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
          ? err.message
          : "Image storage upload failed";
      throw new Error(safeMessage);
    }
  }
}

export const supabaseService = new SupabaseStorageService();

export async function uploadGeneratedImage(
  buffer: Buffer,
  contentType: string,
  ctx?: UploadCtx
): Promise<UploadResult> {
  return supabaseService.uploadGeneratedImage(buffer, contentType, ctx);
}
