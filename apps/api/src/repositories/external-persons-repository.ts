import { pool, type Queryable } from '../db/pool.js';

export interface ExternalPersonInput {
  prefixTh: string | null;
  firstNameTh: string;
  lastNameTh: string;
  organization: string;
  position: string | null;
  email: string | null;
  phone: string | null;
}

export interface ExternalPersonRecord extends ExternalPersonInput {
  id: string;
  createdBy: string;
}

const COLUMNS = `
  id, prefix_th AS "prefixTh", first_name_th AS "firstNameTh", last_name_th AS "lastNameTh",
  organization, position, email, phone, created_by AS "createdBy"`;

export async function insertExternalPerson(input: ExternalPersonInput, createdBy: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO external_persons (prefix_th, first_name_th, last_name_th, organization, position, email, phone, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [input.prefixTh, input.firstNameTh, input.lastNameTh, input.organization, input.position, input.email, input.phone, createdBy],
  );
  return result.rows[0]!.id;
}

export async function findExternalPerson(id: string, db: Queryable = pool): Promise<ExternalPersonRecord | null> {
  const result = await db.query<ExternalPersonRecord>(
    `SELECT ${COLUMNS} FROM external_persons WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateExternalPerson(id: string, input: ExternalPersonInput, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE external_persons
        SET prefix_th = $2, first_name_th = $3, last_name_th = $4, organization = $5,
            position = $6, email = $7, phone = $8
      WHERE id = $1`,
    [id, input.prefixTh, input.firstNameTh, input.lastNameTh, input.organization, input.position, input.email, input.phone],
  );
}
