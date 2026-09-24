#!/usr/bin/env bash
# สร้าง access key และ bucket ของ Garage สำหรับ dev (รันซ้ำได้ ไม่สร้างซ้ำ)
# แล้วเขียน S3_ACCESS_KEY / S3_SECRET_KEY ลง apps/api/.env ให้อัตโนมัติ (ไม่พิมพ์ secret ออกหน้าจอ)
# วิธีใช้: bash docker/garage/setup.sh   (หลัง docker compose up -d)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
API_ENV="$ROOT_DIR/apps/api/.env"
KEY_NAME="msu-club-api"

if [[ ! -f "$API_ENV" ]]; then
  echo "ไม่พบ $API_ENV (คัดลอกจาก apps/api/.env.example ก่อน)" >&2
  exit 1
fi

BUCKET="$(grep -E '^S3_BUCKET=' "$API_ENV" | cut -d= -f2- | tr -d '[:space:]')"
if [[ -z "$BUCKET" ]]; then
  echo "ต้องกำหนด S3_BUCKET ใน $API_ENV" >&2
  exit 1
fi

garage() {
  docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T -e RUST_LOG=warn garage /garage "$@"
}

echo "รอ Garage พร้อมใช้งาน..."
for _ in $(seq 1 30); do
  if garage status >/dev/null 2>&1; then break; fi
  sleep 1
done
garage status >/dev/null

if garage key info "$KEY_NAME" >/dev/null 2>&1; then
  echo "มี access key '$KEY_NAME' อยู่แล้ว"
else
  garage key create "$KEY_NAME" >/dev/null
  echo "สร้าง access key '$KEY_NAME' แล้ว"
fi

if garage bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "มี bucket '$BUCKET' อยู่แล้ว"
else
  garage bucket create "$BUCKET" >/dev/null
  echo "สร้าง bucket '$BUCKET' แล้ว"
fi

# ให้ key อ่าน/เขียน/เป็นเจ้าของ bucket (bucket ยังเป็น private ไม่เปิดสาธารณะ)
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" >/dev/null

KEY_INFO="$(garage key info "$KEY_NAME" --show-secret)"
ACCESS_KEY="$(printf '%s\n' "$KEY_INFO" | awk -F': *' '/^Key ID/ {print $2; exit}' | tr -d '[:space:]')"
SECRET_KEY="$(printf '%s\n' "$KEY_INFO" | awk -F': *' '/^Secret key/ {print $2; exit}' | tr -d '[:space:]')"
if [[ -z "$ACCESS_KEY" || -z "$SECRET_KEY" ]]; then
  echo "อ่านค่า key จาก Garage ไม่ได้ (รูปแบบผลลัพธ์อาจเปลี่ยนตามเวอร์ชัน)" >&2
  exit 1
fi

# แทนค่าเดิมใน .env (ใช้ temp file เพื่อให้ทำงานได้ทั้ง macOS และ Linux)
TMP_FILE="$(mktemp)"
awk -v ak="$ACCESS_KEY" -v sk="$SECRET_KEY" '
  /^S3_ACCESS_KEY=/ { print "S3_ACCESS_KEY=" ak; next }
  /^S3_SECRET_KEY=/ { print "S3_SECRET_KEY=" sk; next }
  { print }
' "$API_ENV" > "$TMP_FILE"
mv "$TMP_FILE" "$API_ENV"

echo "บันทึก S3_ACCESS_KEY ($ACCESS_KEY) และ S3_SECRET_KEY ลง apps/api/.env แล้ว"
