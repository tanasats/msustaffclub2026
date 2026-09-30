#!/usr/bin/env bash
# ปรับปรุงรายการ IP ของ Cloudflare ให้ nginx (realip) — รันบน VM เมื่อ Cloudflare เปลี่ยนช่วง IP (ตรวจปีละ 1–2 ครั้ง)
# วิธีใช้:  ./scripts/update-cloudflare-realip.sh            ติดตั้งลง /etc/nginx/snippets แล้ว nginx -t และ reload
#          ./scripts/update-cloudflare-realip.sh --print    พิมพ์เนื้อไฟล์ออกหน้าจอ (ใช้ปรับไฟล์ใน repo: deploy/nginx/cloudflare-realip.conf)
# ติดตั้งไม่ผ่าน nginx -t → คืนไฟล์เดิมอัตโนมัติ ระบบไม่หยุดทำงาน
# ไม่ใช้ lib.sh เพราะงานนี้ไม่เกี่ยวกับ docker หรือไฟล์ env
set -euo pipefail

TARGET="/etc/nginx/snippets/cloudflare-realip.conf"
CIDR_V4='^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
CIDR_V6='^[0-9a-f:]+/[0-9]{1,3}$'

fetch() {
  curl -fsS --max-time 20 "$1" | tr -d '\r' | sed '/^$/d'
}

V4="$(fetch https://www.cloudflare.com/ips-v4)"
V6="$(fetch https://www.cloudflare.com/ips-v6)"
# กันไฟล์เสีย: ต้องได้รายการ และทุกบรรทัดต้องเป็น CIDR ที่ถูกรูปแบบ
[[ -n "$V4" && -n "$V6" ]] || { echo "ดึงรายการ IP ของ Cloudflare ไม่ได้" >&2; exit 1; }
if grep -Evq "$CIDR_V4" <<<"$V4" || grep -Eivq "$CIDR_V6" <<<"$V6"; then
  echo "รายการ IP ที่ได้มีรูปแบบไม่ถูกต้อง — ไม่เปลี่ยนแปลงอะไร" >&2
  exit 1
fi

render() {
  echo "# nginx realip สำหรับ Cloudflare — สร้างโดย deploy/scripts/update-cloudflare-realip.sh เมื่อ $(date '+%Y-%m-%d')"
  echo "# แหล่งที่มา: https://www.cloudflare.com/ips/"
  echo "# เชื่อ header CF-Connecting-IP เฉพาะคำขอที่มาจากช่วง IP ของ Cloudflare เท่านั้น (ผู้อื่นปลอม header นี้ไม่ได้)"
  echo "# ผล: \$remote_addr = IP จริงของผู้ใช้ → log ของ nginx และ X-Forwarded-For ที่ส่งให้ API (TRUST_PROXY=1) ถูกต้อง"
  echo
  while read -r cidr; do echo "set_real_ip_from $cidr;"; done <<<"$V4"
  while read -r cidr; do echo "set_real_ip_from $cidr;"; done <<<"$V6"
  echo
  echo "real_ip_header CF-Connecting-IP;"
}

if [[ "${1:-}" == "--print" ]]; then
  render
  exit 0
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
render > "$TMP"

BACKUP=""
if sudo test -f "$TARGET"; then
  BACKUP="$TARGET.bak.$(date +%Y%m%d%H%M%S)"
  sudo cp -p "$TARGET" "$BACKUP"
fi
sudo install -m 644 "$TMP" "$TARGET"

if sudo nginx -t; then
  sudo systemctl reload nginx
  echo "ติดตั้ง $(grep -c set_real_ip_from "$TARGET") ช่วง IP ลง $TARGET และ reload nginx แล้ว"
else
  echo "nginx -t ไม่ผ่าน — คืนไฟล์เดิม" >&2
  if [[ -n "$BACKUP" ]]; then sudo cp -p "$BACKUP" "$TARGET"; else sudo rm -f "$TARGET"; fi
  exit 1
fi
