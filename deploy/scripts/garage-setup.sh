#!/usr/bin/env bash
# ตั้งค่า Garage ของ production ครั้งแรก (รันซ้ำได้): สร้าง key + bucket (private) แล้วเขียน key ลง env/api.env
# ไม่ต้องตั้ง CORS: browser อัปโหลดผ่านโดเมนเดียวกับเว็บ (same-origin)
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

API_ENV="$APP_DIR/env/api.env"
KEY_NAME="msu-club-api"
BUCKET="$(grep -E '^S3_BUCKET=' "$API_ENV" | cut -d= -f2- | tr -d '[:space:]')"
[[ -n "$BUCKET" ]] || { echo "ต้องกำหนด S3_BUCKET ใน $API_ENV" >&2; exit 1; }

garage() { compose exec -T -e RUST_LOG=warn garage /garage "$@"; }

log "รอ Garage พร้อมใช้งาน"
for _ in $(seq 1 30); do garage status >/dev/null 2>&1 && break; sleep 1; done
garage status >/dev/null

garage key info "$KEY_NAME" >/dev/null 2>&1 || garage key create "$KEY_NAME" >/dev/null
garage bucket info "$BUCKET" >/dev/null 2>&1 || garage bucket create "$BUCKET" >/dev/null
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" >/dev/null

KEY_INFO="$(garage key info "$KEY_NAME" --show-secret)"
ACCESS_KEY="$(printf '%s\n' "$KEY_INFO" | awk -F': *' '/^Key ID/ {print $2; exit}' | tr -d '[:space:]')"
SECRET_KEY="$(printf '%s\n' "$KEY_INFO" | awk -F': *' '/^Secret key/ {print $2; exit}' | tr -d '[:space:]')"
[[ -n "$ACCESS_KEY" && -n "$SECRET_KEY" ]] || { echo "อ่านค่า key จาก Garage ไม่ได้" >&2; exit 1; }

TMP_FILE="$(mktemp)"
awk -v ak="$ACCESS_KEY" -v sk="$SECRET_KEY" '
  /^S3_ACCESS_KEY=/ { print "S3_ACCESS_KEY=" ak; next }
  /^S3_SECRET_KEY=/ { print "S3_SECRET_KEY=" sk; next }
  { print }
' "$API_ENV" > "$TMP_FILE"
cat "$TMP_FILE" > "$API_ENV" && rm -f "$TMP_FILE"
chmod 600 "$API_ENV"
log "bucket '$BUCKET' พร้อม และบันทึก key ($ACCESS_KEY) ลง env/api.env แล้ว"
