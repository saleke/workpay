/**
 * Local filesystem object storage. The default driver for development, tests
 * and CI. Objects are written under a configurable base directory.
 *
 * Keys are validated so a crafted key cannot escape the base directory.
 */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { AppError, validationError } from "../../platform/errors.js";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./types.js";

export class LocalObjectStorage implements ObjectStorage {
  readonly name = "local";
  private readonly baseDir: string;
  private readonly publicBaseUrl: string;

  constructor(options: { baseDir: string; publicBaseUrl: string }) {
    this.baseDir = resolve(options.baseDir);
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, "");
  }

  private pathFor(key: string): string {
    const normalized = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    const full = resolve(join(this.baseDir, normalized));
    if (!full.startsWith(this.baseDir)) {
      throw validationError("Invalid storage key", { key });
    }
    return full;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const full = this.pathFor(input.key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, input.body);
    return { key: input.key, sizeBytes: input.body.byteLength, contentType: input.contentType };
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      throw new AppError("NOT_FOUND", `Object not found: ${key}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async presignGet(key: string): Promise<string> {
    // The local driver has no signing; the application route enforces access.
    return `${this.publicBaseUrl}/api/v1/storage/${encodeURIComponent(key)}`;
  }
}
