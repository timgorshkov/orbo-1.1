#!/bin/bash
# SSL Certificate Expiry Monitor
# Checks cert expiry and sends Telegram alert if < 14 days remaining
# Runs daily via cron

set -euo pipefail

WARN_DAYS=14
CRIT_DAYS=7
DOMAINS=("app.orbo.ru" "my.orbo.ru")
CERT_BASE="/home/deploy/orbo/data/certbot/conf/live"

source /home/deploy/orbo/.env
BOT_TOKEN="${TELEGRAM_NOTIFICATIONS_BOT_TOKEN}"
CHAT_ID="${TELEGRAM_ADMIN_CHAT_ID}"

send_telegram() {
    local message="$1"
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d chat_id="${CHAT_ID}" \
        -d text="${message}" \
        -d parse_mode="Markdown" > /dev/null 2>&1
}

alerts=""

for domain in "${DOMAINS[@]}"; do
    cert_file="${CERT_BASE}/${domain}/cert.pem"

    if [ ! -f "${cert_file}" ]; then
        alerts+="$(printf '\xe2\x9d\x8c') *${domain}*: certificate file not found!\n"
        continue
    fi

    expiry_date=$(openssl x509 -in "${cert_file}" -noout -enddate | cut -d= -f2)
    expiry_epoch=$(date -d "${expiry_date}" +%s)
    now_epoch=$(date +%s)
    days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [ "${days_left}" -le 0 ]; then
        alerts+="$(printf '\xf0\x9f\x94\xb4') *${domain}*: CERTIFICATE EXPIRED!\n"
    elif [ "${days_left}" -le "${CRIT_DAYS}" ]; then
        alerts+="$(printf '\xf0\x9f\x94\xb4') *${domain}*: ${days_left} days left (critical!)\n"
    elif [ "${days_left}" -le "${WARN_DAYS}" ]; then
        alerts+="$(printf '\xf0\x9f\x9f\xa1') *${domain}*: ${days_left} days left\n"
    fi
done

# Also check if certbot container is running
certbot_running=$(docker ps --filter "name=orbo_certbot" --filter "status=running" -q 2>/dev/null)
if [ -z "${certbot_running}" ]; then
    alerts+="$(printf '\xe2\x9a\xa0\xef\xb8\x8f') Certbot container is NOT running!\n"
fi

if [ -n "${alerts}" ]; then
    message="$(printf '\xf0\x9f\x94\x92') *SSL Monitor* (orbo.ru)

${alerts}
Check: \`docker ps | grep certbot\`"
    send_telegram "${message}"
    echo "[$(date)] ALERT sent"
else
    echo "[$(date)] OK: All certs valid > ${WARN_DAYS} days"
fi
