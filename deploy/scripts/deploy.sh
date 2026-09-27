#!/usr/bin/env bash
# deploy เวอร์ชันที่ระบุ: ./scripts/deploy.sh sha-abc1234
# ขั้นตอน: backup → pull → migrate → สลับ api/web → ตรวจสุขภาพ (ไม่ผ่าน = กลับเวอร์ชันเดิมอัตโนมัติ)
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

TAG="${1:-}"
if [[ ! "$TAG" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "วิธีใช้: $0 sha-<commit>   (ดูแท็กจากหน้า GitHub Actions → release)" >&2
  exit 1
fi
# ไฟล์ env ต้องครบก่อนทำอะไรทั้งสิ้น (deploy สร้าง container ใหม่จากไฟล์เหล่านี้)
check_env_files strict
PREV_TAG="${APP_TAG:-}"
log "deploy $TAG (เดิม: ${PREV_TAG:-ไม่มี})"

log "1/5 สำรองฐานข้อมูลก่อน deploy"
"$APP_DIR/scripts/backup.sh" "pre-$TAG"

log "2/5 ดึง image"
set_tag "$TAG"
if ! compose pull api web; then
  log "ดึง image ไม่สำเร็จ — คงเวอร์ชันเดิม"
  set_tag "$PREV_TAG"
  exit 1
fi

log "3/5 migrate ฐานข้อมูล"
if ! compose --profile tools run --rm migrate; then
  log "migrate ไม่สำเร็จ — เวอร์ชันเดิมยังทำงานอยู่ (ยังไม่ได้สลับ) ตรวจ log ด้านบน"
  set_tag "$PREV_TAG"
  exit 1
fi

log "4/5 สลับ api และ web เป็น $TAG แล้วตรวจสุขภาพ"
# up อาจล้มเอง (web รอ api healthy) — ต้องจับทั้งสองกรณีเพื่อกลับเวอร์ชันเดิม ไม่ปล่อยให้ set -e ออกกลางทาง
if compose up -d --remove-orphans postgres garage api web && wait_healthy; then
  echo "$(date -Iseconds) $TAG" >> deployed.log
  docker image prune -f >/dev/null
  log "5/5 สำเร็จ: $TAG"
else
  log "5/5 ตรวจสุขภาพไม่ผ่าน — กลับไป ${PREV_TAG:-(ไม่มีเวอร์ชันเดิม)}"
  compose logs --tail=50 api web || true
  if [[ -n "$PREV_TAG" ]]; then
    set_tag "$PREV_TAG"
    compose up -d api web
    wait_healthy && log "กลับเป็น $PREV_TAG แล้ว" || log "เวอร์ชันเดิมก็ไม่ผ่าน — ตรวจด้วยตนเองทันที"
  fi
  exit 1
fi
