import { pool, type Queryable } from '../db/pool.js';

export type FilePurpose = 'advisor_consent';

export interface FileRecord {
  id: string;
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  purpose: FilePurpose;
  status: 'pending' | 'uploaded';
  uploadedBy: string;
  uploadedAt: Date | null;
}

// bigint ของ PostgreSQL ถูกส่งมาเป็นข้อความ จึงแปลงเป็นตัวเลขใน SQL (ไฟล์ ≤ 10 MB ไม่เกินช่วงของ int)
const FILE_COLUMNS = `
  id, bucket, object_key AS "objectKey", original_name AS "originalName", mime_type AS "mimeType",
  size_bytes::int AS "sizeBytes", purpose, status, uploaded_by AS "uploadedBy", uploaded_at AS "uploadedAt"`;

export interface NewFile {
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  purpose: FilePurpose;
  uploadedBy: string;
}

export async function insertFile(input: NewFile, db: Queryable = pool): Promise<FileRecord> {
  const result = await db.query<FileRecord>(
    `INSERT INTO files (bucket, object_key, original_name, mime_type, size_bytes, purpose, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${FILE_COLUMNS}`,
    [input.bucket, input.objectKey, input.originalName, input.mimeType, input.sizeBytes, input.purpose, input.uploadedBy],
  );
  return result.rows[0]!;
}

export async function findFile(id: string, db: Queryable = pool): Promise<FileRecord | null> {
  const result = await db.query<FileRecord>(`SELECT ${FILE_COLUMNS} FROM files WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return result.rows[0] ?? null;
}

// ล็อกแถวไฟล์ระหว่างยืนยันการอัปโหลด (กันยืนยันซ้อนกัน 2 ครั้ง)
export async function lockFile(id: string, db: Queryable): Promise<FileRecord | null> {
  const result = await db.query<FileRecord>(
    `SELECT ${FILE_COLUMNS} FROM files WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function markFileUploaded(id: string, db: Queryable): Promise<void> {
  await db.query(`UPDATE files SET status = 'uploaded', uploaded_at = now() WHERE id = $1`, [id]);
}
