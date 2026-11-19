#!/usr/bin/env bash
# Fixed helper used by the KAREN `restart_api` command. No arguments are
# accepted; the delay lets the HTTP response reach the UI before the API dies.
sleep 1
exec /usr/bin/sudo /usr/bin/systemctl restart karen-api
