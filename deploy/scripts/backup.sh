#!/usr/bin/env bash
# สำรองฐานข้อมูลและไฟล์: ./scripts/backup.sh [ป้ายชื่อ]  (cron รายวัน + deploy.sh เรียกก่อน deploy)
# ผลลัพธ์: $BACKUP_DIR/<เวลา>-<ป้าย>/{db.dump,garage.tgz,env.tgz}  ลบชุดที่เก่ากว่า BACKUP_KEEP_DAYS วัน
# env.tgz มี secret ทั้งหมด (รหัสผ่าน DB, Google, S3, Gmail) — ทุกไฟล์สิทธิ์ 600 และปลายทาง BACKUP_REMOTE ต้องปลอดภัยเท่ากัน
# กู้คืน: docs/deployment.md หัวข้อ 8
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

LABEL="${1:-daily}"
BACKUP_ROOT="${BACKUP_DIR:-$APP_DIR/backups}"
require_writable "$BACKUP_ROOT"
DEST="$BACKUP_ROOT/$(date '+%Y%m%d-%H%M%S')-$LABEL"
mkdir -p "$DEST"
chmod 700 "$(dirname "$DEST")"

log "สำรอง PostgreSQL → $DEST/db.dump"
# -Fc = custom format (บีบอัด, เลือก restore บางตารางได้) ใช้ user/db จาก env ภายใน container
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/db.dump"

log "สำรองไฟล์ (Garage) → $DEST/garage.tgz"
# snapshot metadata ให้สอดคล้องกันก่อน แล้วเก็บ snapshot + data (อ่านอย่างเดียว)
compose exec -T -e RUST_LOG=warn garage /garage meta snapshot >/dev/null
# tar ส่งออกทาง stdout แล้ว host เขียนไฟล์เอง → ไฟล์เป็นของผู้ใช้ที่รันสคริปต์ (container รันเป็น root)
docker run --rm \
  -v "msu-club-prod_garage_meta:/meta:ro" \
  -v "msu-club-prod_garage_data:/data:ro" \
  alpine:3.22 tar czf - -C / meta/snapshots data > "$DEST/garage.tgz"

log "สำรองไฟล์ env → $DEST/env.tgz"
tar czf "$DEST/env.tgz" -C "$APP_DIR" .env env

chmod 600 "$DEST"/*
log "ขนาด: $(du -sh "$DEST" | cut -f1)"

find "$(dirname "$DEST")" -mindepth 1 -maxdepth 1 -type d -mtime "+${BACKUP_KEEP_DAYS:-14}" -exec rm -rf {} +

if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  log "คัดลอกออกนอก VM → $BACKUP_REMOTE"
  rsync -a --delete "$(dirname "$DEST")/" "$BACKUP_REMOTE/"
else
  log "คำเตือน: ยังไม่กำหนด BACKUP_REMOTE — backup อยู่บน VM เดียวกับระบบเท่านั้น"
fi
