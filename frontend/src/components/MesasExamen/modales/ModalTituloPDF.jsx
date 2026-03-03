// src/components/MesasExamen/modales/ModalTituloPDF.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FaTimes, FaFilePdf } from "react-icons/fa";

// ✅ Reutilizamos la estética del modal (la misma que ModalEliminarMesas)
import "./ModalCrearMesas.css";

export default function ModalTituloPDF({
  open,
  onClose,
  onConfirm,
  tituloBase = "MESAS DE EXAMEN",
  defaultExtra = "",
}) {
  const [extra, setExtra] = useState(defaultExtra || "");
  const inputRef = useRef(null);

  // Reset cuando abre + focus
  useEffect(() => {
    if (!open) return;
    setExtra((defaultExtra || "").toUpperCase());
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, defaultExtra]);

  // cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tituloFinal = useMemo(() => {
    const base = String(tituloBase || "").trim();
    const ex = String(extra || "").trim();
    return ex ? `${base} ${ex}` : base;
  }, [tituloBase, extra]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target.classList.contains("mi-modal__overlay")) onClose?.();
    },
    [onClose]
  );

  const confirmar = useCallback(
    (e) => {
      e?.preventDefault?.();
      onConfirm?.({
        tituloBase: String(tituloBase || "").trim(),
        tituloExtra: String(extra || "").trim(),
        tituloFinal,
      });
    },
    [onConfirm, tituloBase, extra, tituloFinal]
  );

  if (!open) return null;

  return (
    <div className="mi-modal__overlay" onClick={handleOverlayClick}>
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mi-modal-title-titulo-pdf"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="mi-modal-title-titulo-pdf" className="mi-modal__title">
              Título del PDF
            </h2>
            <p className="mi-modal__subtitle">
              Elegí cómo querés que salga el título en la parte superior del PDF.
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

        {/* Body */}
        <form className="mi-modal__content" onSubmit={confirmar}>
          <section className="mi-tabpanel">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Configuración</h3>

                <div className="mi-form-grid-2">
                  <div className="mi-form-row">
                    <label className="mi-label-strong">Título fijo</label>
                    <input
                      className="mi-input"
                      value={String(tituloBase || "").toUpperCase()}
                      readOnly
                    />
                    <div className="mi-hint">
                      Este texto siempre se mantiene.
                    </div>
                  </div>

                  <div className="mi-form-row">
                    <label className="mi-label-strong">
                      Continuación{" "}
                      <span className="mi-optional">(opcional)</span>
                    </label>
                    <input
                      ref={inputRef}
                      className="mi-input"
                      value={extra}
                      onChange={(e) =>
                        setExtra(e.target.value.toUpperCase())
                      }
                      placeholder="Ej: FEBRERO 2026"
                    />
                    <div className="mi-hint">
                      Podés dejarlo vacío si no querés agregar nada.
                    </div>
                  </div>
                </div>

                <p className="mi-help">
                  <strong>Vista previa:</strong> {tituloFinal}
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
            >
              Cancelar
            </button>

            <button type="submit" className="mi-btn mi-btn--primary">
              <FaFilePdf style={{ marginRight: 6 }} />
              Confirmar y exportar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
