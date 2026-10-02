#!/bin/sh
set -eu
case "${PUID}:${PGID}" in *[!0-9:]*|:*|*:) echo 'PUID and PGID must be numeric.' >&2; exit 1;; esac
mkdir -p /config /config/codex /config/home
if [ "$(id -u)" = 0 ]; then
  if ! getent group "$PGID" >/dev/null; then groupadd --gid "$PGID" ununemploy; fi
  if ! getent passwd "$PUID" >/dev/null; then
    useradd --uid "$PUID" --gid "$PGID" --home-dir /config/home --no-create-home --shell /usr/sbin/nologin ununemploy
  fi
  chown -R "${PUID}:${PGID}" /config
  export HOME=/config/home
  exec /usr/bin/supervisord -c /etc/ununemploy-supervisord.conf
fi
export HOME=/config/home
exec /usr/bin/supervisord -c /etc/ununemploy-supervisord.conf
