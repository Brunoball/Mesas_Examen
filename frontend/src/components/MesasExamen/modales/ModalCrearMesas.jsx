import React, { useState, useCallback, useRef } from "react";
import { FaTimes, FaCalendarAlt, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalCrearMesas.css";

/**
 * MISMA estética que ModalInfoPrevia (clases mi-modal__*)
 * Flujo:
 * 1) mesas_crear
 * 2) mesas_armar_grupos
 * 3) mesas_reoptimizar
 */
const ModalCrearMesas = ({ open, onClose, onSuccess, onError, onLoadingChange }) => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [enviando, setEnviando] = useState(false);

  // 🔧 Refs para abrir el datepicker programáticamente
  const refDesde = useRef(null);
  const refHasta = useRef(null);

  const closeIfOverlay = useCallback(
    (e) => {
      if (e.target.classList.contains("mi-modal__overlay")) onClose?.();
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

      // 2) Armar grupos + agendar no-fechadas
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
        onError?.(msg); // seguimos con reoptimización igualmente
      }

      // 3) Reoptimizar
      const { resp: respReopt, json: jsonReopt } = await postJson("mesas_reoptimizar", {
        max_iter: 7,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dry_run: 0,
      });
      if (!respReopt.ok || !jsonReopt?.exito) {
        const msg =
          jsonReopt?.mensaje ||
          `Se crearon y agruparon las mesas, pero falló la reoptimización [HTTP ${respReopt.status}]`;
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

  const rangoLegible = (fi, ff) => {
    const toDDMMYYYY = (iso) => {
      if (!iso) return "-";
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return iso;
      return `${m[3]}/${m[2]}/${m[1]}`;
    };
    if (!fi || !ff) return null;
    return `${toDDMMYYYY(fi)} — ${toDDMMYYYY(ff)}`;
  };

  // 🧠 Abrir datepicker (con fallback) y evitar perder foco al hacer mousedown
  const openPicker = (ref) => {
    const el = ref?.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <div className="mi-modal__overlay" onClick={closeIfOverlay}>
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-crear-mesas"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header rojo (idéntico look & feel) */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="titulo-crear-mesas" className="mi-modal__title">
              Crear mesas
            </h2>
            <p className="mi-modal__subtitle">
              {rangoLegible(fechaInicio, fechaFin) || "Rango de fechas"}
            </p>
          </div>
          <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <FaTimes />
          </button>
        </div>

        {/* Contenido con scroll */}
        <form className="mi-modal__content" onSubmit={handleSubmit}>
          <section className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Rango de fechas</h3>

                <div className="mi-form-grid-2">
                  {/* DESDE */}
                  <div
                    className="mi-form-row"
                    role="button"
                    tabIndex={0}
                    aria-label="Elegir fecha desde"
                    onMouseDown={(e) => e.preventDefault()} // evita blur que cierra el picker
                    onClick={() => openPicker(refDesde)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") && openPicker(refDesde)
                    }
                  >
                    <label className="mi-label-strong" htmlFor="fecha-desde">
                      <FaCalendarAlt style={{ marginRight: 6 }} /> Desde
                    </label>
                    <input
                      id="fecha-desde"
                      type="date"
                      className="mi-input"
                      ref={refDesde}
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      required
                    />
                  </div>

                  {/* HASTA */}
                  <div
                    className="mi-form-row"
                    role="button"
                    tabIndex={0}
                    aria-label="Elegir fecha hasta"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openPicker(refHasta)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") && openPicker(refHasta)
                    }
                  >
                    <label className="mi-label-strong" htmlFor="fecha-hasta">
                      <FaCalendarAlt style={{ marginRight: 6 }} /> Hasta
                    </label>
                    <input
                      id="fecha-hasta"
                      type="date"
                      className="mi-input"
                      ref={refHasta}
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      required
                      min={fechaInicio || undefined}
                    />
                  </div>
                </div>

                <p className="mi-help">
                  Se crearán mesas para todos los días dentro del rango. Verificá que no se
                  superpongan con mesas ya existentes.
                </p>
              </article>
            </div>
          </section>

          {/* Footer */}
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
