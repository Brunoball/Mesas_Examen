// src/components/MesasExamen/modales/ModalCrearMesas.jsx
import React, { useState } from "react";
import { FaTimes, FaCalendarAlt, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalCrearMesas.css";

/**
 * Modal para crear mesas en lote por RANGO de fechas.
 * 👉 Si recibís `onCreate`, delega al padre (cierra el modal y muestra el loader allí).
 * 👉 Si NO viene `onCreate`, hace el POST como antes y llama a `onSuccess` (modo retrocompatible),
 *    pero sin mostrar alert de éxito.
 *
 * onCreate(payload) -> payload = { fecha_inicio: "YYYY-MM-DD", fecha_fin: "YYYY-MM-DD" }
 */
const ModalCrearMesas = ({ open, onClose, onCreate, onSuccess }) => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    // Validaciones básicas
    if (!fechaInicio || !fechaFin) {
      alert("Completá ambas fechas (desde y hasta).");
      return;
    }
    if (fechaInicio > fechaFin) {
      alert("La fecha 'desde' no puede ser mayor que la fecha 'hasta'.");
      return;
    }

    const payload = { fecha_inicio: fechaInicio, fecha_fin: fechaFin };

    // ── Modo nuevo: delega al padre ────────────────────────────────────────────
    if (typeof onCreate === "function") {
      setEnviando(true);
      try {
        onCreate(payload);
      } finally {
        setEnviando(false);
      }
      return;
    }

    // ── Modo legacy (retrocompatible): hace el POST acá, SIN alert de éxito ───
    try {
      setEnviando(true);

      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_crear_todas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json?.exito) {
        const msg =
          json?.mensaje || `No se pudo crear el lote [HTTP ${resp.status}]`;
        alert(
          msg +
            (json?.detalle ? `\n${json.detalle}` : "") +
            (json?.rango
              ? `\nRango: ${json.rango.inicio} → ${json.rango.fin}`
              : "")
        );
        return;
      }

      // Éxito sin alert. Delegamos a onSuccess y cerramos modal.
      onSuccess?.();
      onClose?.();
    } catch (err) {
      console.error("[ModalCrearMesas] error:", err);
      alert("Error de red al crear las mesas.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="glob-modal-overlay">
      <div
        className="glob-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-crear-mesas"
      >
        <div className="glob-modal-header">
          <h3 id="titulo-crear-mesas">Crear mesas en lote</h3>
          <button
            className="glob-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
          >
            <FaTimes />
          </button>
        </div>

        <form className="glob-modal-body" onSubmit={handleSubmit}>
          <p style={{ marginBottom: 12 }}>
            Elegí el rango de fechas en el que se van a crear las mesas.
          </p>

          <div className="glob-grid-2">
            <div className="glob-form-row">
              <label className="glob-label">
                <FaCalendarAlt style={{ marginRight: 6 }} />
                Desde
              </label>
              <input
                type="date"
                className="glob-input"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                required
              />
            </div>

            <div className="glob-form-row">
              <label className="glob-label">
                <FaCalendarAlt style={{ marginRight: 6 }} />
                Hasta
              </label>
              <input
                type="date"
                className="glob-input"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                required
                min={fechaInicio || undefined}
              />
            </div>
          </div>

          <div className="glob-modal-footer">
            <button type="button" className="glob-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="glob-btn primary"
              disabled={enviando}
            >
              <FaCheck style={{ marginRight: 6 }} />
              {enviando ? "Preparando…" : "Crear mesas"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalCrearMesas;
