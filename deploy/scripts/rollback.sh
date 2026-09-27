#!/usr/bin/env bash
# กลับไปเวอร์ชันก่อนหน้า (ไม่ย้อน migration): ./scripts/rollback.sh [sha-xxxx]
# ถ้าเวอร์ชันใหม่มี migration ที่โค้ดเก่าใช้ไม่ได้ ให้ restore จาก backup "pre-<tag>" แทน (docs/deployment.md หัวข้อ 8)
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  # แท็กล่าสุดใน deployed.log ที่ไม่ใช่แท็กปัจจุบัน
  TARGET="$(awk '{print $2}' deployed.log 2>/dev/null | grep -vx "${APP_TAG:-}" | tail -1 || true)"
fi
if [[ -z "$TARGET" ]]; then
  echo "ไม่พบเวอร์ชันก่อนหน้าใน deployed.log — ระบุแท็กเอง: $0 sha-xxxx" >&2
  exit 1
fi

log "rollback ${APP_TAG:-?} → $TARGET"
set_tag "$TARGET"
compose pull api web
if compose up -d api web && wait_healthy; then
  echo "$(date -Iseconds) $TARGET rollback" >> deployed.log
  log "สำเร็จ"
else
  log "ตรวจสุขภาพไม่ผ่าน — ตรวจ: docker compose logs api web"
  exit 1
fi
