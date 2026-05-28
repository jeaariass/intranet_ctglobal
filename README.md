# 🌐 Intranet CTGlobal

Portal interno para colaboradores de **Conexión Territorial Global**.

**URL producción:** https://intranet.ctglobal.com.co  
**Repositorio:** https://github.com/jeaariass/intranet_ctglobal

---

## 📁 Estructura del proyecto

```
intranet_ctglobal/
├── frontend/          # React + Vite (SPA)
│   ├── src/
│   │   ├── components/   # Layout, componentes reutilizables
│   │   ├── pages/        # Login, Dashboard, Comunicados, etc.
│   │   ├── context/      # AuthContext (sesión JWT)
│   │   ├── services/     # axios config
│   │   └── styles/       # CSS global
│   └── vite.config.js
│
├── backend/           # Node.js + Express + PostgreSQL (Prisma)
│   ├── src/
│   │   ├── routes/       # auth, users, announcements, documents, events,
│   │   │                 # wiki, equipment, geoprojects, geoauth, sessions,
│   │   │                 # invoices, reports, reminders
│   │   ├── lib/          # prisma.js, whatsappClient.js, reminderScheduler.js
│   │   └── middleware/   # JWT auth
│   ├── prisma/
│   │   ├── schema.prisma     # modelos + enums
│   │   ├── migrations/       # 011 → reminders
│   │   └── run-migrations.js # runner idempotente
│   └── uploads/          # archivos subidos (auto-creado)
│
├── nginx.conf         # Config Nginx para el subdominio
├── ecosystem.config.js  # Config PM2
├── deploy.sh          # Script de despliegue
└── README.md
```

---

## 🚀 Inicio rápido (desarrollo local)

### 1. Clonar el repositorio
```bash
git clone https://github.com/jeaariass/intranet_ctglobal.git
cd intranet_ctglobal
```

### 2. Backend
```bash
cd backend
cp .env.example .env       # Configura tus variables
npm install
npm run dev
# Servidor en http://localhost:3001
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
# App en http://localhost:5173
```

### 🔑 Credenciales iniciales (admin)
| Campo | Valor |
|-------|-------|
| Email | admin@ctglobal.com.co |
| Contraseña | Admin2024* |

> ⚠️ **Cambia la contraseña del admin en producción antes de lanzar.**

---

## 📦 Variables de entorno

### Backend (`backend/.env`)
```env
PORT=4000
NODE_ENV=production

# Base de datos (compartida con T_INTRANET)
DATABASE_URL=postgresql://gisuser:gispass@200.7.107.14:5432/ctglobal_platform

# Auth (mismo secret en intranet + T_INTRANET para SSO)
JWT_SECRET=una_clave_muy_segura_aqui
JWT_EXPIRES_IN=8h

# Frontend
FRONTEND_URL=https://intranet.ctglobal.com.co

# Recordatorios — endpoint HTTP de T_INTRANET para envíos WhatsApp
# T_INTRANET es dueño de la sesión Baileys. La intranet delega los envíos vía
# POST con header x-service-token. El valor debe coincidir EXACTAMENTE con el
# INTRANET_SERVICE_TOKEN del .env de T_INTRANET.
TRAMITES_NOTIF_URL=https://tramites.ctglobal.com.co/api/notif/whatsapp
TRAMITES_SERVICE_TOKEN=<token de 64 hex compartido con T_INTRANET>

# Zona horaria para el scheduler de recordatorios
TZ=America/Bogota
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=https://intranet.ctglobal.com.co/api
```
> ⚠️ **Sin esta variable, Vite buildea con baseURL relativo `/api` y el visor de documentos Office (Google Docs viewer) falla con URLs `/uploads/...` relativas. Siempre configurar antes del primer `npm run build` en producción.**

---

## 🌍 Despliegue en producción (subdominio)

### Requisitos del servidor
- Ubuntu 20.04+
- Node.js 18+
- Nginx
- PM2 (`npm i -g pm2`)
- Certbot (SSL)

### Pasos

#### 1. DNS — Crear registro A en tu panel de hosting
```
Tipo: A
Nombre: intranet
Valor: [IP del servidor]
```

#### 2. Clonar en el servidor
```bash
sudo mkdir -p /var/www/intranet
sudo chown $USER:$USER /var/www/intranet
git clone https://github.com/jeaariass/intranet_ctglobal.git /var/www/intranet
```

#### 3. Configurar variables de entorno
```bash
cp /var/www/intranet/backend/.env.example /var/www/intranet/backend/.env
nano /var/www/intranet/backend/.env

cp /var/www/intranet/frontend/.env.example /var/www/intranet/frontend/.env
nano /var/www/intranet/frontend/.env
```

#### 4. Build del frontend
```bash
cd /var/www/intranet/frontend
npm install && npm run build
```

#### 5. Instalar dependencias backend
```bash
cd /var/www/intranet/backend
npm install --production
```

#### 6. Configurar Nginx
```bash
sudo cp /var/www/intranet/nginx.conf /etc/nginx/sites-available/intranet.ctglobal.com.co
sudo ln -s /etc/nginx/sites-available/intranet.ctglobal.com.co /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 7. SSL con Certbot
```bash
sudo certbot --nginx -d intranet.ctglobal.com.co
```

#### 8. Iniciar con PM2
```bash
cd /var/www/intranet
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Para que inicie con el sistema
```

#### 9. Despliegues futuros
```bash
cd /var/www/intranet
bash deploy.sh
```

`deploy.sh` es **idempotente**: detecta qué cambió en el último `git pull` y salta los pasos innecesarios (no corre `npm install` si `package.json` no cambió, no corre migraciones si no hay carpeta nueva en `prisma/migrations/`, etc.). Ver flags abajo.

---

## 🚀 Despliegue continuo — `deploy.sh`

> ⚠️ Reinicia siempre `intranet-ctglobal` **por nombre**. En esta VPS conviven `tumina-backend`, `gv-carmen` y `tramites-ctglobal` bajo el mismo PM2; `pm2 reload all` los tumbaría también.

### Premisa

`setup.sh` se corrió una sola vez (Node, PM2, Nginx, Certbot, `.env`, primer build). A partir de ahí, **todo cambio en producción pasa por `deploy.sh`**. Detecta qué archivos cambiaron desde el último pull y salta los pasos que no aplican.

### Flags

```bash
sudo bash deploy.sh                  # flujo completo: deps + prisma + migraciones + build + pm2
sudo bash deploy.sh --skip-frontend  # solo backend (más rápido para hotfix de API)
sudo bash deploy.sh --skip-deps      # no corre npm install (cuando sabes que no cambió package.json)
sudo bash deploy.sh --frontend-only  # solo recompila frontend; no toca pm2, no migra
sudo bash deploy.sh --no-migrations  # ignora migraciones nuevas (raro — usar si la migración va aparte)
sudo bash deploy.sh --reload-nginx   # además valida y recarga nginx al final
sudo bash deploy.sh --help           # imprime esta ayuda desde el propio script
```

### Flujo paso a paso

1. **Pull de la rama actual**. Lee `git rev-parse --abbrev-ref HEAD` y hace `git pull origin <esa rama>`. No fuerza `main` — si estás en `feat/recordatorios` despliega esa.
2. **Detección de cambios** con `git diff --name-only HEAD@{1} HEAD`. Llena 6 variables: `CHANGED_BACKEND_DEPS`, `CHANGED_FRONTEND_DEPS`, `CHANGED_FRONTEND_SRC`, `CHANGED_MIGRATIONS`, `CHANGED_SCHEMA`, `CHANGED_NGINX`.
3. **`npm install` backend** solo si `backend/package*.json` cambió.
4. **`npx prisma generate`** solo si `backend/prisma/schema.prisma` cambió.
5. **`node prisma/run-migrations.js`** solo si hay archivos nuevos en `backend/prisma/migrations/`. El runner es idempotente: registra en la tabla `_migrations` y salta las ya ejecutadas.
6. **Build frontend** (`npm install` + `npm run build`) solo si tocaste `frontend/src`, `frontend/public`, `index.html`, `vite.config.js` o `frontend/package*.json`.
7. **`pm2 restart intranet-ctglobal --update-env`** + `pm2 save`. El `--update-env` recarga variables del `.env`.
8. **(Opcional)** Si pasaste `--reload-nginx` o si `nginx.conf` cambió: copia a `/etc/nginx/sites-available/` y `sudo nginx -t && sudo systemctl reload nginx`.
9. Imprime `pm2 status intranet-ctglobal` final + URL del health check.

### Comportamiento ante errores

`set -e` arriba del script → cualquier comando con exit ≠ 0 corta el deploy. Si falla `npm install` o una migración, **PM2 no se reinicia** — el código viejo sigue corriendo. Investiga y vuelve a lanzar.

### Casos típicos

| Cambió | Comando |
|---|---|
| Solo backend JS (rutas, lógica) | `bash deploy.sh --skip-frontend` |
| Solo frontend (componente, CSS) | `bash deploy.sh --frontend-only` |
| `package.json` backend (nueva dep) | `bash deploy.sh` (detecta automático) |
| `schema.prisma` (sin migración) | `bash deploy.sh` (corre `prisma generate`) |
| Carpeta nueva en `migrations/` | `bash deploy.sh` (corre `run-migrations.js`) |
| `nginx.conf` | `bash deploy.sh --reload-nginx` o `bash deploy.sh` (detecta automático) |
| Solo `.env` editado en VPS | `pm2 restart intranet-ctglobal --update-env` (no requiere deploy.sh) |

### Verificación post-despliegue

```bash
# Estado del proceso (debe estar "online" y el contador "↺" subió en 1)
pm2 status intranet-ctglobal

# Ver logs recientes (Ctrl+C para salir)
pm2 logs intranet-ctglobal --lines 30

# Salud de la API
curl -I https://intranet.ctglobal.com.co/api/health

# Si aplicaste migraciones, confirmar que se registraron
docker exec -it postgis-db psql -U gisuser -d ctglobal_platform \
  -c "SELECT nombre, ejecutado_at FROM _migrations ORDER BY id DESC LIMIT 5;"
```

Después abre `https://intranet.ctglobal.com.co` en el navegador con **Ctrl+F5** (recarga sin caché) para asegurarte de cargar el nuevo `dist/`.

### Si algo sale mal

- **`git pull` cuelga pidiendo password**: falta la deploy key SSH. Ver sección [Despliegue por git pull con SSH deploy key](#-despliegue-por-git-pull-con-ssh-deploy-key) abajo.
- **`db:migrate` falla con error de conexión**: revisa `backend/.env` → `DATABASE_URL` debe apuntar al Postgres dockerizado, ej. `postgresql://gisuser:gispass@200.7.107.14:5432/ctglobal_platform`.
- **`prisma generate` no encuentra `prisma`**: corriste `npm install --production` antes. Vuelve a correr `npm install` (sin flag) o usa `npx prisma generate`.
- **PM2 muestra `errored` después del restart**: `pm2 logs intranet-ctglobal --lines 100` y busca el stack trace. Lo más común es variable de entorno faltante en `backend/.env` o puerto ocupado (ver "🛠️ Solución de problemas" más abajo).
- **El navegador sigue mostrando la versión vieja**: hard reload (Ctrl+F5) o ventana incógnito; el problema es caché del cliente, no del servidor.
- **PM2 reinicia en bucle (↺ subiendo solo)**: `pm2 logs intranet-ctglobal --err --lines 50`. Suele ser `EADDRINUSE` (puerto 4000 ocupado por otro proceso) o variables de entorno mal escritas.

---

## 🔑 Despliegue por git pull con SSH deploy key

`deploy.sh` hace `git pull` desde el VPS. Sin credenciales, GitHub cuelga pidiendo usuario y password. Hay que registrar una **deploy key** (clave SSH solo-lectura específica de este repo).

### Una sola vez — generar y registrar la clave

**1. En el VPS, generar par de claves SSH (sin passphrase):**

```bash
ssh-keygen -t ed25519 -C "deploy-intranet-ctglobal" -f /root/.ssh/intranet_deploy -N ""
```

Esto crea:
- `/root/.ssh/intranet_deploy`     → clave privada (queda en el VPS, no compartir)
- `/root/.ssh/intranet_deploy.pub` → clave pública (se sube a GitHub)

**2. Copiar la clave pública:**

```bash
cat /root/.ssh/intranet_deploy.pub
```

Copia toda la línea que empieza con `ssh-ed25519 AAAA...`.

**3. Agregar la deploy key en GitHub:**

- Ve a `https://github.com/jeaariass/intranet_ctglobal`
- **Settings** → **Deploy keys** → **Add deploy key**
- Title: `VPS production`
- Key: pega la línea copiada
- **NO marques** "Allow write access" (solo lectura es suficiente para `git pull`)
- Guarda

**4. Decirle a SSH que use esa clave para GitHub:**

Edita (o crea) `/root/.ssh/config`:

```bash
nano /root/.ssh/config
```

Agrega:

```
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/intranet_deploy
  IdentitiesOnly yes
```

Permisos correctos:

```bash
chmod 600 /root/.ssh/config /root/.ssh/intranet_deploy
chmod 644 /root/.ssh/intranet_deploy.pub
```

**5. Verificar conexión:**

```bash
ssh -T git@github.com
```

Esperado: `Hi jeaariass/intranet_ctglobal! You've successfully authenticated, but GitHub does not provide shell access.` (el mensaje "does not provide shell access" es normal — no es un error).

### Cambiar el remote del repo clonado a SSH

Si el repo se clonó por HTTPS (`https://github.com/...`), `git pull` ignorará la clave SSH. Cámbialo:

```bash
cd /var/www/intranet
git remote -v
# Si dice https://github.com/... → cambiar a SSH:
git remote set-url origin git@github.com:jeaariass/intranet_ctglobal.git
git remote -v
# Ahora debe decir: origin  git@github.com:jeaariass/intranet_ctglobal.git
```

### Primer pull de prueba

```bash
cd /var/www/intranet
git pull origin main
# No debe pedir password.
```

Si todo funciona, `bash deploy.sh` ya hace pull autenticado correctamente.

### Si tienes múltiples repos en el mismo VPS

Cada uno con su propia deploy key (no reuses claves entre repos por seguridad). Agrega más bloques `Host github.com-<alias>` en `~/.ssh/config` con `Host`s diferenciados, y cambia el remote del repo a `git@github.com-<alias>:user/repo.git`.

Ejemplo para tener intranet + trámites con keys separadas:

```
Host github.com-intranet
  HostName github.com
  User git
  IdentityFile /root/.ssh/intranet_deploy
  IdentitiesOnly yes

Host github.com-tramites
  HostName github.com
  User git
  IdentityFile /root/.ssh/tramites_deploy
  IdentitiesOnly yes
```

Y los remotes:

```bash
# en /var/www/intranet
git remote set-url origin git@github.com-intranet:jeaariass/intranet_ctglobal.git
# en /var/www/t_intranet
git remote set-url origin git@github.com-tramites:jeaariass/t_intranet.git
```

---

## ✨ Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| 🔐 Login | Autenticación JWT con sesión de 8h (SSO con T_INTRANET — mismo JWT_SECRET) |
| 🏠 Dashboard | Resumen, stats, accesos rápidos, alertas de vencimientos |
| 📢 Comunicados | Publicación y filtrado de anuncios internos |
| 📁 Documentos | Repositorio con carga/descarga + visor PDF/imagen/Office (Google Docs viewer) |
| 📚 Wiki | Buenas prácticas en Markdown con historial de revisiones |
| 🖥️ Inventario | Equipos físicos + licencias + bitácora de movimientos + facturas vinculadas |
| 🗺️ Geovisores | Gestión de proyectos GIS, accesos por cliente, API keys, integración SDK |
| 📊 Reportes | Vista ejecutiva: sesiones activas, top capas, uso de equipos |
| 💰 Facturación | Control de facturas, dual-currency (COP+USD), alertas de vencimiento |
| 🔔 Recordatorios | Mensajes WhatsApp programados (única / diaria / semanal / mensual / cada N días) |
| 👥 Directorio | Tarjetas de empleados con búsqueda |
| 📅 Calendario | Vista mensual con eventos corporativos |
| 👤 Perfil | Edición de datos y cambio de contraseña |
| ⚙️ Admin | Gestión de usuarios + datos de contratistas (read-only de T_INTRANET) |

---

## 🔔 Módulo de Recordatorios — WhatsApp programados

Permite a ADMIN/EDITOR programar mensajes automáticos que se envían por WhatsApp en intervalos definidos (pagos pendientes, entregas de productos, recordatorios de subir documentos, etc.) hasta una fecha de caducidad opcional.

### Arquitectura — por qué pasa por T_INTRANET

WhatsApp Baileys (cliente no oficial) permite **una sola sesión activa por número de teléfono**. T_INTRANET ya tiene esa sesión emparejada y la usa para sus notificaciones de cuentas de cobro. Si la intranet abriera su propia sesión con la misma carpeta de credenciales, WhatsApp expulsaría a una de las dos apps.

Solución: la intranet **delega el envío vía HTTP** al endpoint `POST /api/notif/whatsapp` de T_INTRANET, autenticado con un service token compartido en ambos `.env`.

```
┌─────────────────────────────────────┐
│  INTRANET (puerto 4000)             │
│                                     │
│  Scheduler (node-cron, cada minuto) │
│    ↓ consulta reminders pendientes  │
│  whatsappClient.js                  │
│    ↓ axios.post con x-service-token │
└──────────────┬──────────────────────┘
               │ HTTPS
               ↓
┌─────────────────────────────────────┐
│  T_INTRANET (puerto 4002)           │
│                                     │
│  POST /api/notif/whatsapp           │
│    ↓ valida token                   │
│  enviarWhatsApp() → Baileys → ✅    │
│    ↓ logging unificado en           │
│  tramites.tramites_notificaciones   │
└─────────────────────────────────────┘
```

### Frecuencias soportadas

| Frecuencia | Campos requeridos | Ejemplo |
|---|---|---|
| `UNICA` | `fecha_inicio`, `hora` | "Recordar firma del contrato el 15 de junio a las 09:00" |
| `DIARIA` | `hora` | "Cada día a las 08:30 revisar bandeja de aprobaciones" |
| `SEMANAL` | `dia_semana` (0=Dom..6=Sáb), `hora` | "Cada lunes 09:00 enviar reporte semanal" |
| `MENSUAL` | `dia_mes` (1..31), `hora` | "Día 25 de cada mes pagar factura de servicios" |
| `CADA_N_DIAS` | `intervalo_dias` (≥1), `hora` | "Cada 15 días recordar revisar backup" |

Notas:
- **MENSUAL con día > 28**: si el mes no tiene ese día (ej. 31 de febrero), se ajusta al último día del mes.
- **Hora**: formato `HH:MM` en zona `America/Bogota` (definido por `TZ` en `.env`).
- **Caducidad**: fecha opcional tras la cual el recordatorio se desactiva automáticamente.

### Modelos de datos (schema `public`)

Migration **011_reminders** crea:

```
reminders               → definición del recordatorio
  ├── frecuencia + parámetros (intervalo_dias / dia_semana / dia_mes / hora)
  ├── destinatario_id (FK a users) o telefono_manual
  ├── fecha_inicio + fecha_caducidad
  ├── proximo_envio (calculado por scheduler)
  ├── activo / pausado
  └── CHECK constraints garantizando parámetros según frecuencia

reminder_logs           → bitácora de cada envío
  ├── canal (WHATSAPP)
  ├── destinatario_snapshot (teléfono usado al momento)
  └── exito / error
```

Índice clave para el scheduler:
```sql
CREATE INDEX reminders_scheduler_idx
  ON reminders(proximo_envio)
  WHERE activo = TRUE AND pausado = FALSE;
```

### Endpoints

| Método | Ruta | Permisos | Función |
|---|---|---|---|
| GET    | `/api/reminders` | autenticado | Listar (filtros: `tipo`, `activo`, `destinatarioId`, `q`) |
| GET    | `/api/reminders/:id` | autenticado | Ver detalle |
| GET    | `/api/reminders/:id/logs` | autenticado | Historial de envíos (últimos 100) |
| POST   | `/api/reminders` | ADMIN+EDITOR | Crear |
| PUT    | `/api/reminders/:id` | ADMIN+EDITOR | Editar (recalcula próximo envío si cambia frecuencia/hora) |
| PATCH  | `/api/reminders/:id/toggle-pause` | ADMIN+EDITOR | Pausar/reanudar sin borrar |
| DELETE | `/api/reminders/:id` | ADMIN+EDITOR | Soft delete (marca `activo=false`, conserva logs) |
| POST   | `/api/reminders/:id/test` | ADMIN+EDITOR | Forzar envío inmediato sin afectar el ciclo programado |

### Scheduler

`backend/src/lib/reminderScheduler.js` usa `node-cron` con un tick cada minuto:

```js
cron.schedule("* * * * *", tick, { timezone: TZ });
```

En cada tick:
1. Consulta `reminders` con `proximo_envio <= NOW()` activos y no pausados.
2. Por cada uno: resuelve teléfono (`destinatario.telefono_whatsapp || telefono_manual`).
3. POST a `TRAMITES_NOTIF_URL` con header `x-service-token: TRAMITES_SERVICE_TOKEN`.
4. Crea fila en `reminder_logs` con resultado.
5. Calcula nuevo `proximo_envio` según la frecuencia (o desactiva si es `UNICA` o pasó `fecha_caducidad`).

> ⚠️ PM2 corre con `instances: 1`. Si en el futuro escalas a cluster (varias instancias), añadir un lock (Postgres advisory lock o tabla aparte) para evitar doble disparo.

### UI

`/recordatorios` (sidebar → Gestión → Recordatorios):
- Lista con stats (activos / pausados / inactivos / envíos totales)
- Filtros por tipo, estado activo, búsqueda en título/mensaje
- Modal crear/editar con campos condicionales según frecuencia
- Botón **Enviar prueba** (icono avión) — dispara WhatsApp inmediato sin alterar ciclo
- Botón **Historial** (icono reloj) — modal con últimos 100 logs
- Botón **Pausar/Reanudar** sin borrar
- Soft delete con confirmación

> 💡 El dropdown de destinatario solo muestra usuarios que tienen `telefono_whatsapp` configurado en su perfil. Para destinos externos (no usuarios del sistema), usar el campo "teléfono manual" con formato `+57XXXXXXXXXX`.

### Configuración previa al primer uso

1. **Configurar `telefono_whatsapp` para cada usuario del equipo** que vaya a recibir recordatorios:
   - Admin → Editar usuario → campo "WhatsApp" → formato `+57XXXXXXXXXX`
   - O directamente en BD si es masivo:
     ```sql
     UPDATE users SET telefono_whatsapp = '+57XXXXXXXXXX' WHERE email = 'usuario@ctglobal.com.co';
     ```

2. **Verificar que T_INTRANET tiene el endpoint disponible**:
   ```bash
   curl https://tramites.ctglobal.com.co/api/notif/ping \
     -H "x-service-token: $TRAMITES_SERVICE_TOKEN"
   ```
   Esperado: `{"ok":true,"service":"tramites-ctglobal","ts":"..."}`.

3. **Confirmar variables en `backend/.env` de la intranet**:
   ```bash
   grep -E "TRAMITES_NOTIF_URL|TRAMITES_SERVICE_TOKEN|TZ" /var/www/intranet/backend/.env
   ```
   Si falta alguna, agregarla y `pm2 restart intranet-ctglobal --update-env`.

4. **Verificar que el scheduler arrancó** después del deploy:
   ```bash
   pm2 logs intranet-ctglobal --lines 30 | grep scheduler
   ```
   Debe imprimir: `[scheduler] iniciado (cada minuto, TZ=America/Bogota)`.

### Troubleshooting recordatorios

- **No llega ningún WhatsApp**:
  - `pm2 logs intranet-ctglobal | grep scheduler` — ¿el scheduler está activo?
  - `curl /api/notif/ping` a T_INTRANET — ¿endpoint responde?
  - Verificar `TRAMITES_SERVICE_TOKEN` idéntico en ambos `.env`.
  - Ver `reminder_logs` → columna `error` te dice si falla por red, token o teléfono inválido.

- **Llegan demasiado tarde / a hora equivocada**:
  - Verificar `TZ=America/Bogota` en `backend/.env` (sin esto, el cron interpreta `09:00` como UTC).
  - Servidor debe tener hora correcta: `timedatectl status` en VPS.

- **Día 31 en febrero — qué pasa**:
  - El scheduler ajusta al último día del mes (28 o 29). Comportamiento intencional, ver `calcularProximoEnvio` en `reminderScheduler.js`.

- **Recordatorio "fantasma" que no se borra**:
  - DELETE es soft (marca `activo=false`). Para borrar de la BD:
    ```sql
    DELETE FROM reminders WHERE id = X;
    -- (los reminder_logs se borran en cascada)
    ```

---

---

## 🛠️ Stack tecnológico

| Parte | Tecnología |
|-------|-----------|
| Frontend | React 18 + Vite, React Router v6, axios, date-fns, lucide-react |
| Estilos | CSS puro con variables (sin frameworks) |
| Backend | Node.js 20 + Express |
| Base de datos | PostgreSQL 14 con PostGIS (en Docker, compartida con T_INTRANET y geovisores) |
| ORM | Prisma 5 (cliente JS) |
| Auth | JWT (jsonwebtoken + bcryptjs) — SSO con T_INTRANET (mismo `JWT_SECRET`) |
| Uploads | Multer (documentos hasta 50MB, facturas hasta 20MB) |
| Scheduler | node-cron (recordatorios cada minuto, TZ America/Bogota) |
| WhatsApp | Delegado por HTTP a T_INTRANET (sesión Baileys única) |
| Rate limiting | express-rate-limit (login 20/min, API 300/min) |
| Servidor | Nginx + PM2 (proceso `intranet-ctglobal`) |
| SSL | Let's Encrypt (Certbot) |

---

## 🛠️ Solución de problemas (Servidor / PuTTY)

Conéctate por SSH al servidor con PuTTY antes de ejecutar cualquiera de estos comandos.

### 🐘 pgAdmin no responde / no carga (corre en Docker)

En esta VPS pgAdmin está dentro de un contenedor Docker definido en el stack de GeoServer (**no** corre como servicio de systemd). Por eso `systemctl status pgadmin4` devuelve *Unit could not be found*. El stack vive en `/srv/geoserver/docker-compose.yml` y levanta tres contenedores: `pgadmin`, `postgis-db` y `geoserver`. pgAdmin queda expuesto en el puerto **8081** del host.

```bash
# 1. Ir al stack y ver el estado de los 3 contenedores
cd /srv/geoserver
docker compose ps

# 2. Reinicio rápido SOLO del contenedor pgAdmin (no toca PostGIS ni GeoServer)
docker compose restart pgadmin

# 3. Confirmar que quedó "Up"
docker compose ps pgadmin

# 4. Si sigue sin responder, ver los últimos logs
docker compose logs --tail=100 pgadmin

# 5. Reinicio total del stack (último recurso — tumba también PostGIS y GeoServer)
docker compose down && docker compose up -d
```

> 💡 Si por alguna razón no estás en `/srv/geoserver`, también funciona con el nombre del contenedor: `docker restart pgadmin`. Para entrar al contenedor a depurar: `docker exec -it pgadmin sh`.
> 🌐 La interfaz web queda en `http://200.7.107.14:8081` (o detrás del proxy si está publicado por subdominio).

### 🐘 PostgreSQL / PostGIS caído (errores de conexión a la BD)

PostgreSQL **también corre en Docker** en esta VPS (contenedor `postgis-db` del mismo stack `/srv/geoserver`), no como servicio de systemd. `sudo systemctl restart postgresql` no aplica aquí.

```bash
cd /srv/geoserver
docker compose ps postgis
docker compose restart postgis
docker compose logs --tail=100 postgis

# Probar conexión desde el host (puerto 5432 publicado)
docker exec -it postgis-db psql -U gisuser -d gisdb -c "SELECT 1;"
```

> ⚠️ Reiniciar `postgis` desconecta a pgAdmin y a GeoServer mientras la BD vuelve. Espera unos segundos y refresca.

### ⚙️ El backend / API no responde (PM2)

> ⚠️ En esta VPS **conviven varias apps PM2** (`intranet-ctglobal`, `tumina-backend`, `gv-carmen`). Reinicia siempre por **nombre** para no tumbar las otras. Nunca uses `pm2 restart all` ni `pm2 delete all` salvo que sepas lo que haces.

```bash
# Ver procesos en ejecución
pm2 list

# Ver logs solo de la intranet (Ctrl+C para salir)
pm2 logs intranet-ctglobal

# Reiniciar SOLO la app de la intranet
pm2 restart intranet-ctglobal

# Si quedó en estado errored, recréala desde cero (solo esta app)
cd /var/www/intranet
pm2 delete intranet-ctglobal
pm2 start ecosystem.config.js --env production --only intranet-ctglobal
pm2 save
```

### 🌐 El sitio no carga / 502 Bad Gateway (Nginx)

```bash
# Validar configuración antes de recargar
sudo nginx -t

# Recargar sin downtime
sudo systemctl reload nginx

# Reinicio completo si reload no soluciona
sudo systemctl restart nginx

# Revisar el log de errores
sudo tail -n 50 /var/log/nginx/error.log
```

### 🔒 Renovar certificado SSL (si el navegador marca "no seguro")

```bash
sudo certbot renew --dry-run   # prueba
sudo certbot renew             # renovación real
sudo systemctl reload nginx
```

### 💾 Espacio en disco lleno

```bash
df -h                          # ver espacio libre
sudo journalctl --vacuum-time=7d   # limpiar logs viejos del sistema
pm2 flush                      # limpiar logs de PM2
```

### 🔁 Reinicio de emergencia del servidor

```bash
sudo reboot
```

---


