# 🔑 Configuración de Secrets en GitHub Actions

Para que el workflow de deploy automático funcione, debes configurar
los siguientes **Secrets** en tu repositorio de GitHub.

## Cómo agregar los secrets

1. Ve a https://github.com/jeaariass/intranet_ctglobal
2. Clic en **Settings** → **Secrets and variables** → **Actions**
3. Clic en **New repository secret**

---

## Secrets requeridos

| Secret | Descripción | Ejemplo |
|--------|-------------|---------|
| `SSH_PRIVATE_KEY` | Clave SSH privada para conectar al servidor | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SERVER_HOST` | IP o dominio del servidor | `192.168.1.100` ó `servidor.ctglobal.com.co` |
| `SERVER_USER` | Usuario SSH del servidor | `ubuntu` ó `root` |

---

## Cómo generar la clave SSH para el deploy

### En tu máquina local:
```bash
# Generar par de claves SSH para deploy
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ctglobal_deploy

# Ver la clave privada (esto va en el secret SSH_PRIVATE_KEY)
cat ~/.ssh/ctglobal_deploy

# Ver la clave pública (esto va en el servidor)
cat ~/.ssh/ctglobal_deploy.pub
```

### En el servidor:
```bash
# Agregar la clave pública al servidor
echo "TU_CLAVE_PUBLICA_AQUI" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### En GitHub:
- **`SSH_PRIVATE_KEY`** → contenido de `~/.ssh/ctglobal_deploy` (la privada)
- **`SERVER_HOST`** → IP del servidor (ej: `45.33.32.156`)
- **`SERVER_USER`** → `ubuntu` (o el usuario que uses)

---

## Flujo del CI/CD

```
Push a main
    │
    ▼
[TEST] Verifica sintaxis backend + build frontend
    │
    ▼ (si pasa los tests)
[DEPLOY] Sube archivos al servidor via rsync + SSH
    │
    ▼
Reinicia PM2 + recarga Nginx
    │
    ▼
✅ https://intranet.ctglobal.com.co actualizado
```

---

## Permisos sudo sin contraseña (necesario para nginx reload)

En el servidor, ejecuta:
```bash
echo "$USER ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx, /usr/sbin/nginx" | \
  sudo tee /etc/sudoers.d/deploy-ctglobal
```
