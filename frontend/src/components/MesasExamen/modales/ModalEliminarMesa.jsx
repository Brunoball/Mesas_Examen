// src/components/MesasExamen/modales/ModalEliminarMesa.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { FaTrash } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalEliminarMesas.css"; // acá metemos los estilos logout-modal

const ModalEliminarMesa = ({ open, mesa, onClose, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const cancelBtnRef = useRef(null);
  const sentOnceRef = useRef(false);

  const numeroMesa = Number(
    mesa?.numero_mesa ?? mesa?.id_mesa ?? mesa?.id ?? 0
  );

  // focus inicial y reset del flag al abrir
  useEffect(() => {
    if (open) {
      sentOnceRef.current = false;
      setTimeout(() => cancelBtnRef.current?.focus(), 0);
    }
  }, [open]);

  const eliminar = useCallback(async () => {
    if (!numeroMesa) {
      onError?.("Número de mesa inválido.");
      return;
    }
    if (loading || sentOnceRef.current) return;

    try {
      setLoading(true);
      sentOnceRef.current = true;

      const resp = await fetch(`${BASE_URL}/api.php?action=mesa_eliminar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_mesa: numeroMesa }),
        cache: "no-store",
      });

      const raw = await resp.text();
      let json = null;
      try { json = JSON.parse(raw); } catch {}

      if (!resp.ok || !json?.exito) {
        const msg = (json && json.mensaje) || (raw ? raw.slice(0, 400) : `HTTP ${resp.status}`);
        throw new Error(msg);
      }

      onSuccess?.();
      onClose?.();
    } catch (e) {
      sentOnceRef.current = false;
      onError?.(e?.message || "No se pudo eliminar la mesa.");
    } finally {
      setLoading(false);
    }
  }, [numeroMesa, loading, onSuccess, onError, onClose]);

  // ESC para cerrar, ENTER para confirmar
  useEffect(() => {
    const onKey = (e) => {
      if (!open) return;
      if (e.key === "Escape" && !loading) onClose?.();
      if ((e.key === "Enter" || e.key === "NumpadEnter") && !loading && numeroMesa) eliminar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, eliminar, onClose, numeroMesa]);

  if (!open) return null;

  const titulo = "Confirmar eliminación";
  const subtitulo = mesa?.materia
    ? `¿Confirmás eliminar la mesa de "${mesa.materia}"?`
    : "¿Estás seguro de eliminar esta mesa?";

  const detalle = [
    numeroMesa ? `N.º mesa: ${numeroMesa}` : null,
    mesa?.curso ? `Curso: ${mesa.curso}` : null,
    mesa?.division ? `División: ${mesa.division}` : null,
    mesa?.fecha ? `Fecha: ${mesa.fecha}` : null,
    mesa?.turno ? `Turno: ${mesa.turno}` : null,
  ].filter(Boolean).join(" • ");

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onMouseDown={() => (!loading ? onClose?.() : null)}
    >
      <div
        className="logout-modal-container logout-modal--danger"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="logout-modal__icon is-danger" aria-hidden="true">
          <FaTrash />
        </div>

        <h3 id="confirm-modal-title" className="logout-modal-title logout-modal-title--danger">
          {titulo}
        </h3>

        <p className="logout-modal-text">{subtitulo}</p>
        {detalle && (
          <div className="prev-modal-item" style={{ marginTop: 10 }}>
            {detalle}
          </div>
        )}

        <div className="logout-modal-buttons">
          <button
            type="button"
            className="logout-btn logout-btn--ghost"
            onClick={onClose}
            disabled={loading}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="logout-btn logout-btn--solid-danger"
            onClick={eliminar}
            disabled={loading || !numeroMesa}
            aria-disabled={loading || !numeroMesa}
          >
            {loading ? "Eliminando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalEliminarMesa;
