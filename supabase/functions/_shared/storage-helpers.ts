// Storage operation helpers
import { sanitizeInput } from "./validators.ts";
import { formatBytes } from "./formatters.ts";
import { info, warn } from "./logger.ts";
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from "./constants.ts";

export interface UploadResult {
  path: string;
  size: number;
  mimeType: string;
}

export function validateUpload(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large: ${formatBytes(file.size)} (max ${formatBytes(MAX_FILE_SIZE)})` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported type: ${file.type}` };
  }
  return { valid: true };
}

export function generateStoragePath(bucket: string, userId: string, filename: string): string {
  const safe = sanitizeInput(filename, 200).replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = Date.now();
  return `${bucket}/${userId}/${ts}_${safe}`;
}

export function getPublicUrl(bucket: string, path: string, baseUrl: string): string {
  return `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

export function parseContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/filename="?([^"]+)"?/);
  return match?.[1];
}
