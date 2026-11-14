#!/usr/bin/env bash
# Kirim pesanan uji ke webhook n8n.
#   WEBHOOK_SECRET=rahasia ./test/kirim-order.sh                     -> jalankan semua skenario
#   WEBHOOK_SECRET=rahasia ./test/kirim-order.sh test/orders/03-mencurigakan.json
# Saat menguji di editor ("Listen for test event"), pakai URL /webhook-test/order:
#   N8N_ORDER_URL=https://n8n.sldev.my.id/webhook-test/order WEBHOOK_SECRET=rahasia ./test/kirim-order.sh

set -euo pipefail
URL="${N8N_ORDER_URL:-https://n8n.sldev.my.id/webhook/order}"
SECRET="${WEBHOOK_SECRET:?Isi dulu WEBHOOK_SECRET}"
DIR="$(cd "$(dirname "$0")" && pwd)/orders"

send() {
  echo "== $(basename "$1")"
  curl -sS -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "X-Webhook-Secret: $SECRET" \
    --data @"$1"
  echo; echo
  sleep 2
}

if [ "$#" -gt 0 ]; then
  for f in "$@"; do send "$f"; done
  exit 0
fi

send "$DIR/01-normal.json"              # LOW    -> APPROVED_AUTO
send "$DIR/02-cod-besar.json"           # MEDIUM -> AI -> otomatis atau review owner
send "$DIR/03-mencurigakan.json"        # HIGH   -> PENDING_REVIEW, tombol muncul di Telegram
send "$DIR/04-invalid.json"             # INVALID (HTTP 422)
send "$DIR/05-shopify.json"             # format Shopify -> APPROVED_AUTO
send "$DIR/01-normal.json"              # kirim ulang -> DUPLICATE
send "$DIR/06-mirip-order-1001.json"    # HP + total sama < 30 menit -> MEDIUM
