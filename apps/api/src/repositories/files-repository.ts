import { pool, type Queryable } from '../db/pool.js';

export type FilePurpose = 'advisor_consent' | 'club_logo' | 'achievement_evidence';

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

/**
 * ไฟล์ยังถูกอ้างอิงจากข้อมูลใดอยู่หรือไม่ (ตรวจทุกคอลัมน์ที่อ้างถึง files ก่อนลบ)
 * เช่น คำขอกับชมรมที่ตั้งจากคำขอนั้นใช้ไฟล์ตราเดียวกันได้ — ทุกคอลัมน์มี index รองรับ
 */
export async function isFileInUse(id: string, db: Queryable): Promise<boolean> {
  const result = await db.query<{ inUse: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM clubs WHERE logo_file_id = $1)
         OR EXISTS (SELECT 1 FROM club_applications WHERE logo_file_id = $1)
         OR EXISTS (SELECT 1 FROM club_application_advisors WHERE consent_file_id = $1)
         OR EXISTS (SELECT 1 FROM club_achievement_files WHERE file_id = $1) AS "inUse"`,
    [id],
  );
  return result.rows[0]?.inUse ?? false;
}

// ลบไฟล์แบบ soft delete (เก็บแถวไว้เป็นประวัติ) ส่วน object ใน bucket ลบแยกหลัง commit
export async function softDeleteFile(id: string, db: Queryable): Promise<void> {
  await db.query('UPDATE files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
}
