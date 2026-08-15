import { S3Client } from "@aws-sdk/client-s3";
import type { ChartStorage } from "./chart-storage.js";
import { S3ChartStorage } from "./s3-chart-storage.js";

export interface S3Config {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  /**
   * MinIO local exige path-style; buckets novos do Railway usam virtual-hosted.
   * Por isso é variável de ambiente, não constante (research R6).
   */
  readonly forcePathStyle: boolean;
}

/**
 * Armazenamento com ciclo de vida próprio. O chamador é dono do fechamento —
 * o SDK do S3 não vaza para fora deste pacote (Princípio I).
 */
export interface ManagedChartStorage extends ChartStorage {
  close(): void;
}

export function createChartStorage(config: S3Config): ManagedChartStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const storage = new S3ChartStorage({ client, bucket: config.bucket });

  return {
    buildKey: (icao, procedureId) => storage.buildKey(icao, procedureId),
    exists: (key) => storage.exists(key),
    put: (key, content) => storage.put(key, content),
    delete: (key) => storage.delete(key),
    presignGetUrl: (key, expiresInSeconds) => storage.presignGetUrl(key, expiresInSeconds),
    close: () => client.destroy(),
  };
}
