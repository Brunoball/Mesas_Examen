import React, { useEffect, useState, useCallback } from "react";
import { FaTimes, FaCalendarAlt, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalCrearMesas.css";

/**
 * Modal para crear mesas en lote por RANGO de fechas.
 * onCreate(payload) -> delega al padre
 * Legacy: hace POST a mesas_crear_todas y llama onSuccess (sin alert de éxito)
 */
const ModalCrearMesas = ({ open, onClose, onCreate, onSuccess }) => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setFechaInicio((v) => v || "");
      setFechaFin((v) => v || "");
      setEnviando(false);
    }
  }, [open]);

  const validar = useCallback(() => {
    if (!fechaInicio || !fechaFin) {
      alert("Completá ambas fechas (desde y hasta).");
      return false;
    }
    if (fechaInicio > fechaFin) {
      alert("La fecha 'desde' no puede ser mayor que la fecha 'hasta'.");
      return false;
    }
    return true;
  }, [fechaInicio, fechaFin]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validar()) return;

    const payload = { fecha_inicio: fechaInicio, fecha_fin: fechaFin };

    // ── Modo nuevo: delega al padre ───────────────────────────────
    if (typeof onCreate === "function") {
      setEnviando(true);
      try {
        onCreate(payload);
        onClose?.(); // cierre inmediato para UX consistente con tus otros modales
      } finally {
        setEnviando(false);
      }
      return;
    }

    // ── Legacy: POST acá, sin alert de éxito ─────────────────────
    try {
      setEnviando(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_crear_todas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json?.exito) {
        const msg = json?.mensaje || `No se pudo crear el lote [HTTP ${resp.status}]`;
        alert(
          msg +
            (json?.detalle ? `\n${json.detalle}` : "") +
            (json?.rango ? `\nRango: ${json.rango.inicio} → ${json.rango.fin}` : "")
        );
        return;
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      console.error("[ModalCrearMesas] error:", err);
      alert("Error de red al crear las mesas.");
    } finally {
      setEnviando(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && onClose?.()}
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mi-modal-title-crear-mesas"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header rojo */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="mi-modal-title-crear-mesas" className="mi-modal__title">
              Crear mesas en lote
            </h2>
            <p className="mi-modal__subtitle">
              Generá todas las mesas entre dos fechas (inclusive)
            </p>
          </div>
          <button
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
          >
            <FaTimes />
          </button>
        </div>

        {/* Cuerpo con la misma estética */}
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

          {/* Footer alineado a tu patrón */}
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
              {enviando ? "Preparando…" : "Crear mesas"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalCrearMesas;
