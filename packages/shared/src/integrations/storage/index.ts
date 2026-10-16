/**
 * Object storage factory. The local driver is the default.
 */
import { resolve } from "node:path";
import { getEnv } from "../../platform/env.js";
import { LocalObjectStorage } from "./local.js";
import { S3ObjectStorage } from "./s3.js";
import type { ObjectStorage } from "./types.js";

let cached: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (cached) return cached;
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    cached = new S3ObjectStorage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      bucket: env.S3_BUCKET,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
    return cached;
  }
  cached = new LocalObjectStorage({
    baseDir: env.STORAGE_LOCAL_DIR,
    publicBaseUrl: env.APP_URL,
  });
  return cached;
}

/** Test helper: inject a specific storage adapter. */
export function setObjectStorage(storage: ObjectStorage | null): void {
  cached = storage;
}

/** Resolve a directory under the repo for the local driver. */
export function defaultLocalStorageDir(): string {
  return resolve(process.cwd(), ".workpay-storage");
}

export * from "./types.js";
export { LocalObjectStorage } from "./local.js";
export { S3ObjectStorage } from "./s3.js";
