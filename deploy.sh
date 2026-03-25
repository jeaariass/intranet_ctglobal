#!/bin/bash
# deploy.sh — Script de despliegue para intranet.ctglobal.com.co
# Ejecutar desde el servidor como: bash deploy.sh

set -e
echo "🚀 Iniciando despliegue Intranet CTGlobal..."

APP_DIR="/var/www/intranet_ctglobal"

# 1. Actualizar código desde Git
echo "📥 Actualizando código..."
cd $APP_DIR
git pull origin main

# 2. Instalar dependencias del backend
echo "📦 Instalando dependencias backend..."
cd $APP_DIR/backend
npm install --production

# 3. Build del frontend
echo "🔨 Construyendo frontend..."
cd $APP_DIR/frontend
npm install
npm run build

# 4. Reiniciar el servidor Node con PM2
echo "♻️  Reiniciando servidor..."
cd $APP_DIR
pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production

# 5. Recargar Nginx
echo "🌐 Recargando Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo "✅ Despliegue completado!"
echo "🌍 https://intranet.ctglobal.com.co"
