# ตัวช่วยร่วมของสคริปต์ deploy (source เท่านั้น) — ทำงานที่ /opt/msu-club
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
if [[ ! -f .env ]]; then
  echo "ไม่พบ $APP_DIR/.env (คัดลอกจาก deploy/env/deploy.env.example)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# ไฟล์ชั่วคราวเก็บในโฟลเดอร์ระบบ (ไม่ใช่ /tmp ที่ผู้อื่นเห็น) สิทธิ์ 600 และลบเสมอแม้สคริปต์ล้มกลางทาง — บางไฟล์มี secret
umask 077
TMP_PREFIX="$APP_DIR/.tmp.$$"
trap 'rm -f "$TMP_PREFIX".*' EXIT

# ตรวจก่อนเริ่มงาน: ผู้ใช้ปัจจุบันต้องเขียนไฟล์/โฟลเดอร์ที่ระบุได้ ไม่เช่นนั้นหยุดทันทีพร้อมวิธีแก้
require_writable() {
  local p
  for p in "$@"; do
    if [[ -e "$p" && ! -w "$p" ]] || [[ ! -e "$p" && ! -w "$(dirname "$p")" ]]; then
      echo "ผู้ใช้ $(id -un) เขียน $p ไม่ได้ (เจ้าของ: $(stat -c %U "$p" 2>/dev/null || echo '?'))" >&2
      echo "แก้ด้วย: sudo chown -R $(id -un):$(id -gn) $APP_DIR && chmod 600 $APP_DIR/.env $APP_DIR/env/*.env" >&2
      exit 1
    fi
  done
}

if ! docker info >/dev/null 2>&1; then
  echo "ผู้ใช้ $(id -un) ใช้ docker ไม่ได้ — เพิ่มเข้ากลุ่ม docker: sudo usermod -aG docker $(id -un) แล้ว logout/login ใหม่" >&2
  exit 1
fi
require_writable "$APP_DIR" "$APP_DIR/.env"

compose() { docker compose -f "$APP_DIR/compose.yml" "$@"; }
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# เขียน APP_TAG ลง .env (compose อ่านค่านี้ทุกครั้ง)
set_tag() {
  local tmp="$TMP_PREFIX.deploy-env"
  if grep -q '^APP_TAG=' .env; then
    sed "s/^APP_TAG=.*/APP_TAG=$1/" .env > "$tmp"
  else
    { cat .env; echo "APP_TAG=$1"; } > "$tmp"
  fi
  cat "$tmp" > .env
  export APP_TAG="$1"
}

# รอจน api healthy และ web ตอบ 200 (สูงสุด ~90 วินาที)
wait_healthy() {
  for _ in $(seq 1 45); do
    local api web
    api="$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q api)" 2>/dev/null || true)"
    web="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT:-3000}/" || true)"
    if [[ "$api" == "healthy" && "$web" == "200" ]]; then return 0; fi
    sleep 2
  done
  return 1
}
