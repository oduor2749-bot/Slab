#!/usr/bin/env bash
# One-command setup for Ubuntu 22.04/24.04: Node 22, SLAB as a service, automatic HTTPS (Caddy), firewall, daily backups.
# Usage (from the unzipped project folder):  sudo bash deploy/setup.sh your-domain.com
set -euo pipefail
DOMAIN="${1:-}"
[ -n "$DOMAIN" ] || { echo "Usage: sudo bash deploy/setup.sh your-domain.com"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"; APP=/opt/slab
export DEBIAN_FRONTEND=noninteractive

echo "==> Checking that $DOMAIN points to this server"
MYIP="$(curl -fsS https://api.ipify.org || true)"; DIP="$(getent hosts "$DOMAIN" | awk '{print $1; exit}' || true)"
if [ -n "$MYIP" ] && [ "$MYIP" != "$DIP" ]; then
  echo "!! $DOMAIN resolves to '${DIP:-nothing}' but this server is $MYIP."
  echo "   Add a DNS A record: $DOMAIN -> $MYIP, wait a few minutes, then run this again."; exit 1
fi

echo "==> Installing packages"
apt-get update -y
apt-get install -y curl gpg ufw unzip sqlite3 debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> Installing the app to $APP"
id slab >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin slab
mkdir -p "$APP" "$APP/backups"
[ "$SRC" = "$APP" ] || cp -r "$SRC"/. "$APP"/
if [ ! -f "$APP/.env" ]; then
  cp "$APP/.env.example" "$APP/.env"
  rnd() { openssl rand -hex 24; }
  ADMIN_KEY="$(rnd)"
  sed -i "s|^SECRET=.*|SECRET=$(rnd)|; s|^ADMIN_KEY=.*|ADMIN_KEY=$ADMIN_KEY|; s|^CALLBACK_SECRET=.*|CALLBACK_SECRET=$(rnd)|; s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|; s|^INBOX_SECRET=.*|INBOX_SECRET=$(rnd)|" "$APP/.env"
  printf '\nNODE_ENV=production\nTRUST_PROXY=1\n' >> "$APP/.env"
  echo "$ADMIN_KEY" > "$APP/.admin-key-once"; chmod 600 "$APP/.admin-key-once"
fi
chown -R slab:slab "$APP"; chmod 600 "$APP/.env"

echo "==> Service"
cat > /etc/systemd/system/slab.service <<UNIT
[Unit]
Description=SLAB server
After=network.target
[Service]
User=slab
WorkingDirectory=$APP
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$APP
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now slab

echo "==> HTTPS (Caddy gets and renews the certificate by itself)"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl restart caddy

echo "==> Firewall and daily backups"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
cat > /etc/cron.d/slab-backup <<CRON
15 3 * * * root sqlite3 $APP/data.db ".backup '$APP/backups/db-\$(date +\%F).db'" && find $APP/backups -mtime +14 -delete
CRON

sleep 3
echo
echo "================  DONE  ================"
echo "App:        https://$DOMAIN"
echo "Admin page: https://$DOMAIN/admin"
[ -f "$APP/.admin-key-once" ] && echo "Admin key:  $(cat "$APP/.admin-key-once")   (save it, then run: sudo rm $APP/.admin-key-once)"
echo
echo "SMS forwarder URL (set this in the forwarding app on the phone that receives deposits):"
echo "   https://$DOMAIN/api/inbox/$(grep ^INBOX_SECRET= "$APP/.env" | cut -d= -f2)"
echo
echo "Next: put your Daraja keys in $APP/.env (see DEPLOY.md, Buy Goods section), then:  sudo systemctl restart slab"
echo "Logs:       sudo journalctl -u slab -f"
