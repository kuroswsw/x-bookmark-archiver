#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"

Xvfb "$DISPLAY" -screen 0 1440x1000x24 -nolisten tcp &
while [ ! -S "/tmp/.X11-unix/X${DISPLAY#:}" ]; do sleep 0.1; done
fluxbox >/tmp/fluxbox.log 2>&1 &
x11vnc -display "$DISPLAY" -forever -shared -nopw -localhost -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/websockify.log 2>&1 &

echo "Open http://localhost:6080/vnc.html?autoconnect=1&resize=scale through the SSH tunnel."
exec node src/cli.js setup
