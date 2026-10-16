/**
 * Object storage contract. Deliverables and evidence are stored as bytes
 * outside PostgreSQL; only metadata and content hashes live in the database
 * (Component 14: large blobs do not belong in the hot path).
 */
export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface StoredObject {
  key: string;
  sizeBytes: number;
  contentType: string;
}

export interface ObjectStorage {
  readonly name: string;
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /**
   * A URL the browser can use to download the object. For the local driver
   * this is an application route; for S3 it is a presigned URL.
   */
  presignGet(key: string, expiresInSeconds?: number): Promise<string>;
}

/** Build a collision-resistant, human-readable storage key. */
export function buildStorageKey(prefix: string, id: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `${prefix}/${id}/${safeName}`;
}
