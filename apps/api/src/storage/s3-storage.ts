import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

/**
 * ตัวครอบการเรียก S3 (Garage) — โค้ดส่วนอื่นเรียกผ่านที่นี่เท่านั้น เปลี่ยนผู้ให้บริการได้ด้วยการแก้ env
 * - client ภายใน (S3_ENDPOINT): server เรียก Garage โดยตรง
 * - client สาธารณะ (S3_PUBLIC_ENDPOINT): ใช้เซ็น presigned URL ด้วย host ที่ browser เข้าถึงได้จริง
 * ปิด checksum อัตโนมัติของ SDK รุ่นใหม่ (ใส่เฉพาะเมื่อจำเป็น) เพราะ browser ส่ง checksum header ใน presigned URL ไม่ได้
 */
function createClient(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.s3.region,
    credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
    forcePathStyle: config.s3.forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

const internalClient = createClient(config.s3.endpoint);
const publicClient = createClient(config.s3.publicEndpoint);

export interface StoredObjectInfo {
  sizeBytes: number;
  contentType: string | null;
}

function isNotFound(err: unknown): boolean {
  return err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === 'NotFound');
}

// ชื่อไฟล์สำหรับ header Content-Disposition (รองรับภาษาไทยด้วย filename*=UTF-8'')
function contentDisposition(fileName: string, disposition: 'inline' | 'attachment'): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export const storage = {
  bucket: config.s3.bucket,

  /**
   * URL สำหรับ browser อัปโหลดด้วย PUT ตรงไปที่ bucket
   * เซ็น Content-Type และ Content-Length ไว้ด้วย: ถ้าไฟล์จริงต่างจากที่ขอไว้ Garage จะปฏิเสธ
   */
  async createUploadUrl(key: string, contentType: string, sizeBytes: number, expiresInSeconds: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(publicClient, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  },

  // URL สำหรับเปิด/ดาวน์โหลดไฟล์ (แสดงในเบราว์เซอร์ได้ พร้อมชื่อไฟล์เดิม)
  async createDownloadUrl(key: string, fileName: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(fileName, 'inline'),
    });
    return getSignedUrl(publicClient, command, { expiresIn: expiresInSeconds });
  },

  // ข้อมูลไฟล์ใน bucket (null = ไม่มีไฟล์นี้)
  async headObject(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await internalClient.send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  },

  async deleteObject(key: string): Promise<void> {
    await internalClient.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  },

  // ตั้ง CORS ของ bucket ให้หน้าเว็บอัปโหลด/ดาวน์โหลดจาก browser ได้ (ใช้ในสคริปต์ตั้งค่า)
  async configureCors(allowedOrigins: string[]): Promise<void> {
    await internalClient.send(
      new PutBucketCorsCommand({
        Bucket: config.s3.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: allowedOrigins,
              AllowedMethods: ['PUT', 'GET', 'HEAD'],
              AllowedHeaders: ['content-type', 'content-length'],
              ExposeHeaders: ['etag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  },
};
