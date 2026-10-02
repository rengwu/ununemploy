#!/bin/sh
set -eu
if [ "$(id -u)" = 0 ]; then
  exec gosu "${PUID}:${PGID}" env HOME=/config/home XDG_CONFIG_HOME=/config/home/.config XDG_CACHE_HOME=/config/home/.cache "$@"
fi
exec "$@"
