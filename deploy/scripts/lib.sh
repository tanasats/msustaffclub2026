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

compose() { docker compose -f "$APP_DIR/compose.yml" "$@"; }
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# เขียน APP_TAG ลง .env (compose อ่านค่านี้ทุกครั้ง)
set_tag() {
  local tmp
  tmp="$(mktemp)"
  if grep -q '^APP_TAG=' .env; then
    sed "s/^APP_TAG=.*/APP_TAG=$1/" .env > "$tmp"
  else
    { cat .env; echo "APP_TAG=$1"; } > "$tmp"
  fi
  cat "$tmp" > .env && rm -f "$tmp"
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
