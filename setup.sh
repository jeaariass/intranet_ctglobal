#!/bin/bash
# setup.sh — Configuración inicial del servidor para intranet.ctglobal.com.co
# Ejecutar UNA SOLA VEZ en el servidor como root o con sudo
# Uso: sudo bash setup.sh

set -e

DOMAIN="intranet.ctglobal.com.co"
APP_DIR="/var/www/intranet_ctglobal"
REPO="https://github.com/jeaariass/intranet_ctglobal.git"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Setup Intranet CTGlobal                ║"
echo "║   $DOMAIN           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Dependencias del sistema ──────────────────────────────
echo "📦 [1/8] Instalando dependencias del sistema..."
apt-get update -q
apt-get install -y -q curl git nginx certbot python3-certbot-nginx build-essential python3

# ── 2. Node.js 20 LTS ────────────────────────────────────────
echo "🟢 [2/8] Instalando Node.js 20..."
if ! command -v node &>/dev/null || [[ $(node -v) != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "   Node: $(node -v) | npm: $(npm -v)"

# ── 3. PM2 ───────────────────────────────────────────────────
echo "⚙️  [3/8] Instalando PM2..."
npm install -g pm2 --silent

# ── 4. Clonar repositorio ────────────────────────────────────
echo "📥 [4/8] Clonando repositorio..."
if [ -d "$APP_DIR/.git" ]; then
  echo "   Repositorio ya existe, haciendo pull..."
  cd $APP_DIR && git pull origin main
else
  git clone $REPO $APP_DIR
fi

# ── 5. Configurar variables de entorno ───────────────────────
echo "🔧 [5/8] Configurando variables de entorno..."

if [ ! -f "$APP_DIR/backend/.env" ]; then
  JWT_SECRET=$(openssl rand -base64 48)
  cat > $APP_DIR/backend/.env << EOF
PORT=3001
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=8h
NODE_ENV=production
FRONTEND_URL=https://$DOMAIN
EOF
  echo "   ✅ backend/.env creado con JWT_SECRET aleatorio"
else
  echo "   ⚠️  backend/.env ya existe, no se sobreescribe"
fi

if [ ! -f "$APP_DIR/frontend/.env" ]; then
  cat > $APP_DIR/frontend/.env << EOF
VITE_API_URL=https://$DOMAIN/api
EOF
  echo "   ✅ frontend/.env creado"
fi

# ── 6. Instalar dependencias y hacer build ───────────────────
echo "🔨 [6/8] Instalando dependencias y construyendo..."

cd $APP_DIR/backend
npm install --production
echo "   ✅ Backend listo"

cd $APP_DIR/frontend
npm install
npm run build
echo "   ✅ Frontend construido"

# ── 7. Nginx ─────────────────────────────────────────────────
echo "🌐 [7/8] Configurando Nginx..."

# Primero configurar sin SSL para que Certbot funcione
cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    server_name $DOMAIN;
    root $APP_DIR/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
    }

    location /uploads/ {
        alias $APP_DIR/backend/uploads/;
    }
}
EOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t && systemctl reload nginx
echo "   ✅ Nginx configurado"

# SSL con Certbot
echo "   🔒 Obteniendo certificado SSL..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m contactenos@ctglobal.com.co || \
  echo "   ⚠️  Certbot falló (DNS no propagado aún). Ejecuta manualmente: certbot --nginx -d $DOMAIN"

# Reemplazar con nginx.conf completo del repo
cp $APP_DIR/nginx.conf /etc/nginx/sites-available/$DOMAIN
nginx -t && systemctl reload nginx 2>/dev/null || true

# ── 8. PM2 ───────────────────────────────────────────────────
echo "🚀 [8/8] Iniciando servidor con PM2..."
cd $APP_DIR
pm2 start ecosystem.config.js --env production || pm2 reload ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

# ── Crear carpetas necesarias ─────────────────────────────────
mkdir -p $APP_DIR/backend/uploads/documents
mkdir -p $APP_DIR/backend/data
mkdir -p /var/log/pm2

# ── Resumen ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅ Setup completado                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  🌍 URL:     https://$DOMAIN"
echo "  📧 Admin:   admin@ctglobal.com.co"
echo "  🔑 Pass:    Admin2024*  (¡cámbiala!)"
echo ""
echo "  Comandos útiles:"
echo "  pm2 status                  → Ver procesos"
echo "  pm2 logs intranet-ctglobal  → Ver logs"
echo "  bash $APP_DIR/deploy.sh     → Actualizar"
echo ""
