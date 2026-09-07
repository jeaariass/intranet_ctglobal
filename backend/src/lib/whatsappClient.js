// backend/src/lib/whatsappClient.js
// Cliente HTTP para enviar WhatsApp delegando a T_INTRANET.
//
// T_INTRANET (tramites.ctglobal.com.co) es el dueño de la sesión Baileys de
// WhatsApp — solo un proceso puede mantener esa sesión activa. La intranet
// se comunica con T_INTRANET vía endpoint REST autenticado por service token.
//
// Variables .env requeridas:
//   TRAMITES_NOTIF_URL     ej: https://tramites.ctglobal.com.co/api/notif/whatsapp
//   TRAMITES_SERVICE_TOKEN ej: <token compartido configurado en ambas apps>

const axios = require("axios");

const URL   = process.env.TRAMITES_NOTIF_URL;
const TOKEN = process.env.TRAMITES_SERVICE_TOKEN;

if (!URL || !TOKEN) {
  console.warn(
    "[whatsappClient] TRAMITES_NOTIF_URL o TRAMITES_SERVICE_TOKEN no configurados — " +
    "los recordatorios de WhatsApp van a fallar. Configúralos en backend/.env y reinicia."
  );
}

/**
 * Envía un mensaje de WhatsApp delegando al endpoint de T_INTRANET.
 *
 * @param {object} opts
 * @param {string} opts.to            Número con código de país, ej. +573001234567
 * @param {string} opts.mensaje       Texto a enviar (máx 4000 chars)
 * @param {string} [opts.tipo]        Tag descriptivo (ej. "RECORDATORIO_PAGO"). Default: "INTRANET_RECORDATORIO"
 * @param {number} [opts.destinatarioId] ID de users (para log en notificaciones de T_INTRANET)
 *
 * @returns {Promise<{exito:boolean, error?:string, status?:number}>}
 */
async function enviarWhatsApp({ to, mensaje, tipo, destinatarioId }) {
  if (!URL || !TOKEN) {
    return { exito: false, error: "TRAMITES_NOTIF_URL o TRAMITES_SERVICE_TOKEN no configurados" };
  }
  if (!to) return { exito: false, error: "Sin teléfono destino" };

  try {
    const res = await axios.post(
      URL,
      {
        to,
        mensaje,
        tipo: tipo || "INTRANET_RECORDATORIO",
        destinatarioId: destinatarioId || null,
      },
      {
        headers: {
          "Content-Type":    "application/json",
          "x-service-token": TOKEN,
        },
        timeout: 15_000,
      }
    );
    // El endpoint de T_INTRANET devuelve { exito, error } de la función enviarWhatsApp.
    return {
      exito: !!res.data?.exito,
      error: res.data?.error || "",
      status: res.status,
    };
  } catch (e) {
    const msg = e.response?.data?.error || e.message || String(e);
    console.error("[whatsappClient] error enviando WhatsApp:", msg);
    return { exito: false, error: msg, status: e.response?.status };
  }
}

/**
 * Ping al endpoint de T_INTRANET. Útil para health checks.
 */
async function ping() {
  if (!URL || !TOKEN) return { ok: false, error: "config faltante" };
  try {
    const pingUrl = URL.replace(/\/whatsapp$/, "/ping");
    const res = await axios.get(pingUrl, {
      headers: { "x-service-token": TOKEN },
      timeout: 5000,
    });
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Estado de la conexión de WhatsApp en T_INTRANET (sin QR).
 * @returns {Promise<{status:string, since?:string, lastError?:string, error?:string}>}
 *   status: 'open' | 'qr' | 'connecting' | 'close' | 'starting' | 'desconocido'
 */
async function estadoWhatsApp() {
  if (!URL || !TOKEN) return { status: "desconocido", error: "config faltante" };
  try {
    const statusUrl = URL.replace(/\/whatsapp$/, "/wa-status");
    const res = await axios.get(statusUrl, {
      headers: { "x-service-token": TOKEN },
      timeout: 5000,
    });
    return res.data;
  } catch (e) {
    return { status: "desconocido", error: e.message };
  }
}

module.exports = { enviarWhatsApp, ping, estadoWhatsApp };
