/**
 * CTGlobal Geovisor SDK v1.0
 * Añade autenticación y analytics a tus geovisores HTML/JS existentes.
 *
 * USO:
 *   <script src="ctglobal-sdk.js"></script>
 *   <script>
 *     const ctg = new CTGlobalSDK({
 *       projectKey: 'GV-001',
 *       apiKey: 'ctg_live_xxxxx',
 *       apiUrl: 'https://intranet.ctglobal.com.co/api'
 *     });
 *     await ctg.requireAuth();
 *   </script>
 */

(function (global) {
  "use strict";

  const TOKEN_KEY = "ctg_token";
  const SESSION_KEY = "ctg_session";

  class CTGlobalSDK {
    constructor({ projectKey, apiKey, apiUrl, loginTitle }) {
      this.projectKey = projectKey;
      this.apiKey = apiKey;
      this.apiUrl = apiUrl.replace(/\/$/, "");
      this.loginTitle = loginTitle || "Acceso Restringido";
      this.token = localStorage.getItem(TOKEN_KEY);
      this._heartbeatInterval = null;
    }

    // ── API privada ────────────────────────────────────────────

    async _post(endpoint, body, useToken = false) {
      const headers = { "Content-Type": "application/json" };
      if (this.apiKey && !useToken) headers["x-api-key"] = this.apiKey;
      if (useToken && this.token) headers["Authorization"] = `Bearer ${this.token}`;

      const res = await fetch(`${this.apiUrl}/geoauth/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return res.json();
    }

    async _get(endpoint) {
      const headers = {};
      if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
      const res = await fetch(`${this.apiUrl}/geoauth/${endpoint}`, { headers });
      return res.json();
    }

    // ── Autenticación ─────────────────────────────────────────

    /**
     * Verifica si hay sesión activa, si no muestra el login.
     * Bloquea la carga del mapa hasta que el usuario se autentique.
     */
    async requireAuth() {
      // Si hay token, verificar que sigue siendo válido
      if (this.token) {
        const result = await this._get("verify");
        if (result.valid) {
          this._startHeartbeat();
          this._registerUnload();
          return result.user;
        }
        // Token inválido, limpiar
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
        this.token = null;
      }

      // Mostrar pantalla de login y esperar
      return new Promise((resolve) => {
        this._showLogin((user) => {
          this._startHeartbeat();
          this._registerUnload();
          resolve(user);
        });
      });
    }

    async _login(email, password) {
      const data = await this._post("login", { email, password });
      if (data.token) {
        this.token = data.token;
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(SESSION_KEY, data.sessionId);
        return { ok: true, user: data.user, project: data.project };
      }
      return { ok: false, error: data.error };
    }

    logout() {
      this._post("session-end", {}, true);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_KEY);
      this.token = null;
      if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
      location.reload();
    }

    // ── Logging de capas ──────────────────────────────────────

    /**
     * Registrar que el usuario activó una capa.
     * Llamar cada vez que se muestra/oculta una capa.
     *
     * @param {string} layerName - nombre interno de la capa
     * @param {string} layerTitle - nombre visible al usuario
     */
    logLayer(layerName, layerTitle = "") {
      if (!this.token) return;
      this._post("layer-view", { layerName, layerTitle }, true).catch(() => {});
    }

    /**
     * Integración automática con OpenLayers.
     * Pasa el mapa OL y el SDK rastreará las capas automáticamente.
     *
     * @param {ol.Map} olMap - instancia del mapa de OpenLayers
     */
    trackOpenLayersMap(olMap) {
      if (!olMap) return;
      // Rastrear cambios de visibilidad en todas las capas
      olMap.getLayers().forEach((layer) => this._trackLayer(layer));
      // Rastrear capas que se añadan después
      olMap.getLayers().on("add", (e) => this._trackLayer(e.element));
    }

    _trackLayer(layer) {
      if (!layer) return;
      // Grupos de capas (LayerGroup)
      if (layer.getLayers) {
        layer.getLayers().forEach((l) => this._trackLayer(l));
        return;
      }
      layer.on("change:visible", (e) => {
        if (e.target.getVisible()) {
          const name = e.target.get("name") || e.target.get("id") || "capa_sin_nombre";
          const title = e.target.get("title") || name;
          this.logLayer(name, title);
        }
      });
    }

    // ── Heartbeat (mantener sesión activa) ────────────────────

    _startHeartbeat() {
      // Verificar token cada 5 minutos, cerrar sesión si expiró
      this._heartbeatInterval = setInterval(async () => {
        const result = await this._get("verify");
        if (!result.valid) {
          clearInterval(this._heartbeatInterval);
          this._showExpiredMessage();
        }
      }, 5 * 60 * 1000);
    }

    _registerUnload() {
      // Registrar cierre de sesión cuando el usuario cierra la pestaña
      window.addEventListener("beforeunload", () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
          // sendBeacon es más confiable que fetch en beforeunload
          navigator.sendBeacon(
            `${this.apiUrl}/geoauth/session-end`,
            new Blob(
              [JSON.stringify({ token })],
              { type: "application/json" }
            )
          );
        }
      });
    }

    // ── UI de login ───────────────────────────────────────────

    _showLogin(onSuccess) {
      // Bloquear el contenido del mapa
      document.body.style.overflow = "hidden";

      const overlay = document.createElement("div");
      overlay.id = "ctg-login-overlay";
      overlay.innerHTML = `
        <style>
          #ctg-login-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: linear-gradient(135deg, #0f2540 0%, #1a3a5c 60%, #2c5282 100%);
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
          #ctg-login-box {
            background: #fff; border-radius: 16px; padding: 2.5rem;
            width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          #ctg-login-box .ctg-logo {
            text-align: center; margin-bottom: 1.5rem;
          }
          #ctg-login-box .ctg-logo img {
            height: 48px; object-fit: contain;
          }
          #ctg-login-box h2 {
            font-size: 1.4rem; font-weight: 700;
            color: #1a3a5c; margin-bottom: 0.25rem; text-align: center;
          }
          #ctg-login-box p {
            color: #718096; font-size: 0.875rem;
            text-align: center; margin-bottom: 1.5rem;
          }
          #ctg-login-box input {
            width: 100%; padding: 0.7rem 1rem;
            border: 1.5px solid #e2e8f0; border-radius: 8px;
            font-size: 0.95rem; margin-bottom: 0.75rem;
            box-sizing: border-box; outline: none;
            transition: border-color 0.2s;
          }
          #ctg-login-box input:focus { border-color: #1a3a5c; }
          #ctg-login-btn {
            width: 100%; padding: 0.75rem;
            background: #1a3a5c; color: #fff;
            border: none; border-radius: 8px;
            font-size: 0.95rem; font-weight: 600;
            cursor: pointer; transition: background 0.2s;
          }
          #ctg-login-btn:hover { background: #2c5282; }
          #ctg-login-btn:disabled { background: #a0aec0; cursor: not-allowed; }
          #ctg-login-error {
            background: #fee2e2; color: #991b1b;
            border-radius: 8px; padding: 0.6rem 0.9rem;
            font-size: 0.85rem; margin-bottom: 0.75rem;
            display: none;
          }
          #ctg-login-footer {
            text-align: center; margin-top: 1.25rem;
            font-size: 0.75rem; color: #a0aec0;
          }
        </style>

        <div id="ctg-login-box">
          <div class="ctg-logo">
            <img
              src="https://ctglobal.com.co/wp-content/uploads/2024/01/Logo-CTGlobal-05.png"
              alt="CTGlobal"
              onerror="this.style.display='none'"
            />
          </div>
          <h2>${this.loginTitle}</h2>
          <p>Ingresa tus credenciales para acceder al geovisor</p>
          <div id="ctg-login-error"></div>
          <input type="email" id="ctg-email" placeholder="Correo electrónico" autocomplete="email" />
          <input type="password" id="ctg-password" placeholder="Contraseña" autocomplete="current-password" />
          <button id="ctg-login-btn">Ingresar</button>
          <div id="ctg-login-footer">
            CTGlobal · Acceso seguro
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const emailInput = document.getElementById("ctg-email");
      const passwordInput = document.getElementById("ctg-password");
      const btn = document.getElementById("ctg-login-btn");
      const errorDiv = document.getElementById("ctg-login-error");

      const doLogin = async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) return;

        btn.disabled = true;
        btn.textContent = "Verificando...";
        errorDiv.style.display = "none";

        const result = await this._login(email, password);

        if (result.ok) {
          overlay.remove();
          document.body.style.overflow = "";
          onSuccess(result.user);
        } else {
          errorDiv.textContent = result.error || "Credenciales incorrectas";
          errorDiv.style.display = "block";
          btn.disabled = false;
          btn.textContent = "Ingresar";
          passwordInput.value = "";
          passwordInput.focus();
        }
      };

      btn.addEventListener("click", doLogin);
      passwordInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doLogin();
      });
      emailInput.focus();
    }

    _showExpiredMessage() {
      const box = document.createElement("div");
      box.style.cssText = `
        position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.7);
        display:flex; align-items:center; justify-content:center;
        font-family:-apple-system,sans-serif;
      `;
      box.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:2rem;text-align:center;max-width:320px;">
          <div style="font-size:2.5rem;margin-bottom:1rem;">⏱️</div>
          <h3 style="color:#1a3a5c;margin-bottom:0.5rem;">Sesión expirada</h3>
          <p style="color:#718096;font-size:0.875rem;margin-bottom:1.25rem;">
            Tu sesión ha expirado. Por favor vuelve a ingresar.
          </p>
          <button onclick="location.reload()" style="
            background:#1a3a5c;color:#fff;border:none;border-radius:8px;
            padding:0.6rem 1.5rem;font-size:0.9rem;cursor:pointer;
          ">Volver a ingresar</button>
        </div>
      `;
      document.body.appendChild(box);
    }

    // ── Utilidades públicas ───────────────────────────────────

    /** Obtener info del usuario actual desde el token */
    getCurrentUser() {
      if (!this.token) return null;
      try {
        const payload = JSON.parse(atob(this.token.split(".")[1]));
        return { nombre: payload.nombre, email: payload.email, rol: payload.rol };
      } catch { return null; }
    }

    /** Agregar botón de cerrar sesión al mapa */
    addLogoutButton(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const user = this.getCurrentUser();
      const btn = document.createElement("div");
      btn.style.cssText = `
        position:absolute; top:10px; right:10px; z-index:1000;
        background:#fff; border-radius:8px; padding:0.4rem 0.75rem;
        font-family:-apple-system,sans-serif; font-size:0.8rem;
        box-shadow:0 2px 8px rgba(0,0,0,0.15); display:flex;
        align-items:center; gap:0.5rem; cursor:pointer;
      `;
      btn.innerHTML = `
        <span style="color:#1a3a5c;font-weight:600;">
          ${user ? user.nombre : "Usuario"}
        </span>
        <span style="color:#718096;">|</span>
        <span style="color:#c0392b;">Salir</span>
      `;
      btn.addEventListener("click", () => this.logout());
      container.style.position = "relative";
      container.appendChild(btn);
    }
  }

  global.CTGlobalSDK = CTGlobalSDK;
})(typeof window !== "undefined" ? window : global);
