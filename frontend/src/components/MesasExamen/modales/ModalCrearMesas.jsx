// src/components/MesasExamen/modales/ModalCrearMesas.jsx
import React, { useState, useCallback } from "react";
import { FaTimes, FaCalendarAlt, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalCrearMesas.css";

/**
 * Modal para crear mesas por RANGO DE FECHAS.
 * 1) mesas_crear  { fecha_inicio, fecha_fin }
 * 2) mesas_armar_grupos { agendar_no_fechadas:1, fecha_inicio, fecha_fin, priorizar_por:"materia" }
 *
 * Expone:
 * - onLoadingChange(v:boolean) -> para FullScreenLoader del padre
 * - onSuccess() / onError(msg)
 */
const ModalCrearMesas = ({ open, onClose, onSuccess, onError, onLoadingChange }) => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [enviando, setEnviando] = useState(false);

  const closeIfOverlay = useCallback(
    (e) => {
      if (e.target.classList.contains("glob-modal-overlay")) onClose?.();
    },
    [onClose]
  );

  if (!open) return null;

  const postJson = async (action, payload = {}) => {
    const resp = await fetch(`${BASE_URL}/api.php?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    return { resp, json };
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    if (!fechaInicio || !fechaFin) {
      onError?.("Seleccioná fecha de inicio y fecha de fin.");
      return;
    }
    if (fechaFin < fechaInicio) {
      onError?.("La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }

    try {
      setEnviando(true);
      onLoadingChange?.(true);

      // 1) Crear mesas
      const { resp: respCrear, json: jsonCrear } = await postJson("mesas_crear", {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      if (!respCrear.ok || !jsonCrear?.exito) {
        const msg =
          jsonCrear?.mensaje || `No se pudieron crear las mesas [HTTP ${respCrear.status}]`;
        onError?.(msg);
        return;
      }

      // 2) Armar grupos + AGENDAR no-fechadas (prio 0)
      const { resp: respGrupos, json: jsonGrupos } = await postJson("mesas_armar_grupos", {
        agendar_no_fechadas: 1,
        priorizar_por: "materia",
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      if (!respGrupos.ok || !jsonGrupos?.exito) {
        const msg =
          jsonGrupos?.mensaje ||
          `Se crearon las mesas, pero falló el armado de grupos [HTTP ${respGrupos.status}]`;
        onError?.(msg);
        onSuccess?.(); // refrescar igual por si se creó algo
        onClose?.();
        return;
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      onError?.("Error de red al crear/armar las mesas.");
    } finally {
      setEnviando(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <div className="glob-modal-overlay" onClick={closeIfOverlay}>
      <div
        className="glob-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-crear-mesas"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glob-modal-header">
          <h3 id="titulo-crear-mesas">Crear mesas (rango de fechas)</h3>
          <button
            className="glob-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
            disabled={enviando}
          >
            <FaTimes />
          </button>
        </div>

        <form className="glob-modal-body" onSubmit={handleSubmit}>
          <p style={{ marginBottom: 12 }}>
            Seleccioná el rango de fechas; distribuiremos automáticamente las previas
            y luego armaremos los grupos (ternas preferentemente).
          </p>

          <div className="glob-form-row">
            <label className="glob-label">
              <FaCalendarAlt style={{ marginRight: 6 }} />
              Fecha de inicio
            </label>
            <input
              type="date"
              className="glob-input"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              required
              disabled={enviando}
            />
          </div>

          <div className="glob-form-row">
            <label className="glob-label">
              <FaCalendarAlt style={{ marginRight: 6 }} />
              Fecha de fin
            </label>
            <input
              type="date"
              className="glob-input"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              required
              disabled={enviando}
            />
          </div>

          <div className="glob-modal-footer">
            <button type="button" className="glob-btn ghost" onClick={onClose} disabled={enviando}>
              Cancelar
            </button>
            <button type="submit" className="glob-btn primary" disabled={enviando}>
              <FaCheck style={{ marginRight: 6 }} />
              {enviando ? "Creando mesas…" : "Crear mesas"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalCrearMesas;
