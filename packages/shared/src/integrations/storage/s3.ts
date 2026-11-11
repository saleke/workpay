/**
 * S3-compatible object storage. Works with AWS S3, MinIO, Cloudflare R2 and
 * Supabase Storage. Only metadata is kept in PostgreSQL.
 */
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "../../platform/errors.js";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./types.js";

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
  forcePathStyle: boolean;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key: input.key, sizeBytes: input.body.byteLength, contentType: input.contentType };
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) throw new AppError("NOT_FOUND", `Object has no body: ${key}`);
      return bytes;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("NOT_FOUND", `Object not found: ${key}`, { cause: error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private async deleteBatch(objects: Array<{ Key: string; VersionId?: string }>): Promise<number> {
    const response = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: objects, Quiet: true },
      }),
    );
    if ((response.Errors?.length ?? 0) > 0) {
      throw new AppError("EXTERNAL_FAILURE", "Object storage rejected one or more deletions.", {
        details: {
          errors: response.Errors?.map(({ Key, VersionId, Code }) => ({ Key, VersionId, Code })),
        },
      });
    }
    return objects.length;
  }

  async clearAll(): Promise<number> {
    let deleted = 0;
    let passes = 0;
    while (true) {
      if (passes++ > 100_000) {
        throw new AppError("EXTERNAL_FAILURE", "Object storage cleanup did not converge.");
      }
      const page = await this.client.send(
        new ListObjectVersionsCommand({ Bucket: this.bucket, MaxKeys: 1000 }),
      );
      const objects = [
        ...(page.Versions ?? []).flatMap(({ Key, VersionId }) =>
          Key ? [{ Key, ...(VersionId ? { VersionId } : {}) }] : [],
        ),
        ...(page.DeleteMarkers ?? []).flatMap(({ Key, VersionId }) =>
          Key ? [{ Key, ...(VersionId ? { VersionId } : {}) }] : [],
        ),
      ];
      if (objects.length === 0) break;
      deleted += await this.deleteBatch(objects);
    }

    passes = 0;
    while (true) {
      if (passes++ > 100_000) {
        throw new AppError("EXTERNAL_FAILURE", "Object storage cleanup did not converge.");
      }
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          MaxKeys: 1000,
        }),
      );
      const objects = (page.Contents ?? []).flatMap(({ Key }) => (Key ? [{ Key }] : []));
      if (objects.length === 0) break;
      deleted += await this.deleteBatch(objects);
    }
    return deleted;
  }

  async presignGet(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
