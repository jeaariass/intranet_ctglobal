#!/bin/bash
# deploy.sh
# Despliegue continuo — se ejecuta después de cada `git pull` en producción.
#
# Uso:
#   bash deploy.sh                      # backend + (build frontend si cambió) + reload pm2
#   bash deploy.sh --skip-frontend      # solo backend (más rápido para hotfix de API)
#   bash deploy.sh --skip-deps          # no corre npm install (cuando sabes que no cambió package.json)
#   bash deploy.sh --frontend-only      # solo recompila el frontend; no toca pm2 ni migra
#   bash deploy.sh --no-migrations      # ignora migraciones nuevas (raro — usar si la migración va aparte)
#   bash deploy.sh --reload-nginx       # también valida y recarga nginx al final
#
# Asume que setup.sh ya se corrió una vez (estructura, .env, nginx, pm2 OK).
# Asume que la rama actual está limpia (sin cambios sin commitear) — git pull
# fallará si hay conflictos locales.

set -e

APP_DIR="/var/www/intranet"
APP_NAME="intranet-ctglobal"

# ── Flags ────────────────────────────────────────────────────
SKIP_FRONTEND=false
SKIP_DEPS=false
FRONTEND_ONLY=false
NO_MIGRATIONS=false
RELOAD_NGINX=false
for arg in "$@"; do
  case $arg in
    --skip-frontend)  SKIP_FRONTEND=true ;;
    --skip-deps)      SKIP_DEPS=true ;;
    --frontend-only)  FRONTEND_ONLY=true ;;
    --no-migrations)  NO_MIGRATIONS=true ;;
    --reload-nginx)   RELOAD_NGINX=true ;;
    -h|--help)
      grep -E '^#( |!|$)' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "❌ Flag desconocida: $arg"
      echo "   Usa --help para ver opciones."
      exit 1
      ;;
  esac
done

cd "$APP_DIR"

# ── Detectar rama actual y hacer pull de ella ────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   Deploy — Intranet CTGlobal               ║"
echo "║   rama: $BRANCH"
echo "╚════════════════════════════════════════════╝"
echo ""

# ── 1. Obtener últimos cambios ────────────────────────────────
echo "📥 [1/6] git pull origin $BRANCH …"
git pull origin "$BRANCH"

# Detectar qué cambió para saltar pasos cuando no es necesario.
# HEAD@{1} = commit donde estabas ANTES del pull (Git reflog).
# Si es el primer pull del día sin commits nuevos, CHANGED queda vacío y
# todos los grep devuelven "" — los pasos se saltan correctamente.
CHANGED=$(git diff --name-only HEAD@{1} HEAD 2>/dev/null || echo "")
echo ""
echo "Archivos modificados: $(echo "$CHANGED" | wc -l)"

CHANGED_BACKEND_DEPS=$(echo "$CHANGED" | grep -E '^backend/(package(-lock)?\.json)$' || true)
CHANGED_FRONTEND_DEPS=$(echo "$CHANGED" | grep -E '^frontend/(package(-lock)?\.json)$' || true)
CHANGED_FRONTEND_SRC=$(echo "$CHANGED" | grep -E '^frontend/(src|public|index\.html|vite\.config)' || true)
CHANGED_MIGRATIONS=$(echo "$CHANGED" | grep -E '^backend/prisma/migrations/' || true)
CHANGED_SCHEMA=$(echo "$CHANGED" | grep -E '^backend/prisma/schema\.prisma$' || true)
CHANGED_NGINX=$(echo "$CHANGED" | grep -E '^nginx\.conf$' || true)

# ── Modo solo-frontend (atajo) ───────────────────────────────
if $FRONTEND_ONLY; then
  echo "🎨 Modo --frontend-only (no toca pm2, no migra)"
  cd "$APP_DIR/frontend"
  if ! $SKIP_DEPS && [ -n "$CHANGED_FRONTEND_DEPS" ]; then
    echo "  npm install (deps frontend cambiaron)…"
    npm install --silent
  fi
  npm run build
  echo ""
  echo "✅ Frontend recompilado."
  echo "   Nginx ya sirve /frontend/dist/ — no requiere reload."
  exit 0
fi

# ── 2. Backend deps ───────────────────────────────────────────
cd "$APP_DIR/backend"
if ! $SKIP_DEPS && [ -n "$CHANGED_BACKEND_DEPS" ]; then
  echo "🔧 [2/6] Backend deps cambiaron — npm install…"
  npm install --silent
else
  echo "⏭️  [2/6] Sin cambios en deps de backend (saltando npm install)"
fi

# ── 3. Prisma generate (si schema cambió) ────────────────────
if [ -n "$CHANGED_SCHEMA" ]; then
  echo "🧩 [3/6] schema.prisma cambió — npx prisma generate…"
  npx prisma generate
else
  echo "⏭️  [3/6] Sin cambios en schema.prisma (saltando prisma generate)"
fi

# ── 4. Migraciones de BD ─────────────────────────────────────
# El runner es idempotente: registra en _migrations y salta las ya ejecutadas.
# Aun así, solo lo invocamos si detectamos archivos nuevos en migrations/
# para evitar arrancar Postgres en cada deploy sin razón.
if ! $NO_MIGRATIONS && [ -n "$CHANGED_MIGRATIONS" ]; then
  echo "🗄️  [4/6] Migraciones nuevas detectadas — corriendo run-migrations…"
  node prisma/run-migrations.js
else
  echo "⏭️  [4/6] Sin migraciones nuevas (saltando)"
fi

# ── 5. Frontend build ────────────────────────────────────────
if $SKIP_FRONTEND; then
  echo "⏭️  [5/6] Frontend saltado (--skip-frontend)"
elif [ -z "$CHANGED_FRONTEND_DEPS" ] && [ -z "$CHANGED_FRONTEND_SRC" ]; then
  echo "⏭️  [5/6] Sin cambios en frontend (saltando build)"
else
  echo "🎨 [5/6] Frontend — build…"
  cd "$APP_DIR/frontend"
  if ! $SKIP_DEPS && [ -n "$CHANGED_FRONTEND_DEPS" ]; then
    npm install --silent
  fi
  npm run build
fi

# ── 6. Reiniciar PM2 leyendo .env actualizado ────────────────
# IMPORTANTE: restart por NOMBRE — en este VPS conviven gv-carmen,
# tumina-backend y tramites-ctglobal en el mismo PM2. `pm2 restart all`
# los tumbaría a todos.
echo "🔄 [6/6] pm2 restart $APP_NAME --update-env…"
pm2 restart "$APP_NAME" --update-env
pm2 save --silent

# ── Extra: reload nginx si se solicita o si cambió nginx.conf ─
if $RELOAD_NGINX || [ -n "$CHANGED_NGINX" ]; then
  if [ -n "$CHANGED_NGINX" ]; then
    echo ""
    echo "🌐 nginx.conf cambió — copiando a /etc/nginx/sites-available/…"
    # Ajusta el nombre del site si tu archivo en sites-available se llama distinto
    sudo cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/intranet.ctglobal.com.co
  fi
  echo "🌐 Validando nginx…"
  sudo nginx -t
  echo "🌐 Recargando nginx…"
  sudo systemctl reload nginx
fi

echo ""
echo "✅ Deploy completo — $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
pm2 status "$APP_NAME"
echo ""
echo "  Logs en vivo:    pm2 logs $APP_NAME"
echo "  Health check:    curl -I https://intranet.ctglobal.com.co/api/health"
echo ""
