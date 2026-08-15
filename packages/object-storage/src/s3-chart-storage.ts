import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { ChartStorage } from "./chart-storage.js";
import { assertPdfContent } from "./pdf-content.js";

export interface S3ChartStorageOptions {
  /** Recebido pronto: quem monta o cliente é a raiz de composição (Princípio III). */
  readonly client: S3Client;
  readonly bucket: string;
}

export class S3ChartStorage implements ChartStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3ChartStorageOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
  }

  /**
   * Chave determinística — é o que torna o upload idempotente e permite
   * verificar a existência antes de baixar (FR-017, FR-018, FR-024).
   */
  buildKey(icao: string, procedureId: string): string {
    return `${icao.toUpperCase()}/${procedureId}.pdf`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async put(key: string, content: Uint8Array): Promise<void> {
    assertPdfContent(content, key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: "application/pdf",
        ContentLength: content.byteLength,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** O SDK sinaliza objeto ausente por `NotFound`/`NoSuchKey` ou HTTP 404. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (candidate.name === "NotFound" || candidate.name === "NoSuchKey") {
    return true;
  }
  return candidate.$metadata?.httpStatusCode === 404;
}
