#!/usr/bin/env bash
# Daily 09:00 America/Sao_Paulo routine: scan credits, then send the digest.
set -euo pipefail
cd /home/admin/karen/api
node scripts/daily-credit-scan.mjs
node scripts/send-morning-report.mjs
