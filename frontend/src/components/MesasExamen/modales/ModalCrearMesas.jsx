<<<<<<< HEAD
// src/components/MesasExamen/modales/ModalCrearMesas.jsx
import React, { useState, useCallback } from "react";
=======
import React, { useEffect, useState, useCallback } from "react";
>>>>>>> c0543f46d8e827521e500c697942f82cb095235c
import { FaTimes, FaCalendarAlt, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalCrearMesas.css";

/**
<<<<<<< HEAD
 * Modal para crear mesas por RANGO DE FECHAS.
 * 1) mesas_crear  { fecha_inicio, fecha_fin }
 * 2) mesas_armar_grupos { agendar_no_fechadas:1, fecha_inicio, fecha_fin, priorizar_por:"materia" }
 *
 * Expone:
 * - onLoadingChange(v:boolean) -> para FullScreenLoader del padre
 * - onSuccess() / onError(msg)
=======
 * Modal para crear mesas en lote por RANGO de fechas.
 * onCreate(payload) -> delega al padre
 * Legacy: hace POST a mesas_crear_todas y llama onSuccess (sin alert de éxito)
>>>>>>> c0543f46d8e827521e500c697942f82cb095235c
 */
const ModalCrearMesas = ({ open, onClose, onSuccess, onError, onLoadingChange }) => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [enviando, setEnviando] = useState(false);

<<<<<<< HEAD
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
=======
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
>>>>>>> c0543f46d8e827521e500c697942f82cb095235c
    }
    return true;
  }, [fechaInicio, fechaFin]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validar()) return;

<<<<<<< HEAD
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
=======
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
>>>>>>> c0543f46d8e827521e500c697942f82cb095235c
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

  if (!open) return null;

  return (
<<<<<<< HEAD
    <div className="glob-modal-overlay" onClick={closeIfOverlay}>
=======
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && onClose?.()}
    >
>>>>>>> c0543f46d8e827521e500c697942f82cb095235c
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
<<<<<<< HEAD
        aria-labelledby="titulo-crear-mesas"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glob-modal-header">
          <h3 id="titulo-crear-mesas">Crear mesas (rango de fechas)</h3>
=======
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
>>>>>>> c0543f46d8e827521e500c697942f82cb095235c
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

<<<<<<< HEAD
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
=======
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
>>>>>>> c0543f46d8e827521e500c697942f82cb095235c
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
