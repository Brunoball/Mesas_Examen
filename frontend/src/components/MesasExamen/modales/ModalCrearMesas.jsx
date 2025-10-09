// src/components/MesasExamen/modales/ModalCrearMesas.jsx
import React, { useState, useCallback } from "react";
import { FaTimes, FaCalendarAlt, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalCrearMesas.css";

/**
 * Modal para crear mesas por RANGO DE FECHAS.
 * 1) mesas_crear  { fecha_inicio, fecha_fin }
 * 2) mesas_armar_grupos { agendar_no_fechadas:1, fecha_inicio, fecha_fin, priorizar_por:"materia" }
 * 3) mesas_reoptimizar { max_iter, fecha_inicio, fecha_fin }
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

      // 1) Crear mesas (armar_mesas.php)
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

      // 2) Armar grupos + AGENDAR no-fechadas (prio 0) (armar_mesa_grupo.php)
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
        // avisamos error pero seguimos intentando reoptimizar por si algo se puede mejorar
        onError?.(msg);
      }

      // 3) Reoptimizar (reoptimizar_mesas.php)
      const { resp: respReopt, json: jsonReopt } = await postJson("mesas_reoptimizar", {
        max_iter: 7,             // podés ajustar
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dry_run: 0,
      });

      if (!respReopt.ok || !jsonReopt?.exito) {
        const msg =
          jsonReopt?.mensaje ||
          `Se crearon y agruparon las mesas, pero falló la reoptimización [HTTP ${respReopt.status}]`;
        // informamos, pero igual refrescamos
        onError?.(msg);
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      onError?.("Error de red al crear/armar/reoptimizar las mesas.");
    } finally {
      setEnviando(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <div className="glob-modal-overlay" onClick={closeIfOverlay}>
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-crear-mesas"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glob-modal-header">
          <h3 id="titulo-crear-mesas">Crear mesas (rango de fechas)</h3>
          <button
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
            disabled={enviando}
          >
            <FaTimes />
          </button>
        </div>

        <form className="mi-modal__content" onSubmit={handleSubmit}>
          <section className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-cardd mi-card--full">
                <h3 className="mi-card__title">Rango de fechas</h3>

                <div className="mi-form-grid-2">
                  <div className="mi-form-row">
                    <label className="mi-label-strong">
                      <FaCalendarAlt style={{ marginRight: 6 }} />
                      Desde
                    </label>
                    <input
                      type="date"
                      className="mi-input"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mi-form-row">
                    <label className="mi-label-strong">
                      <FaCalendarAlt style={{ marginRight: 6 }} />
                      Hasta
                    </label>
                    <input
                      type="date"
                      className="mi-input"
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      required
                      min={fechaInicio || undefined}
                    />
                  </div>
                </div>

                <p className="mi-help">
                  Se crearán mesas para todos los días dentro del rango. Verificá que no
                  se superpongan con mesas ya existentes.
                </p>
              </article>
            </div>
          </section>

          <div className="mi-modal__footer">
            <button
              type="button"
              className="mi-btn mi-btn--ghost"
              onClick={onClose}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button type="submit" className="mi-btn mi-btn--primary" disabled={enviando}>
              <FaCheck style={{ marginRight: 6 }} />
              {enviando ? "Creando y optimizando…" : "Crear mesas"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalCrearMesas;
