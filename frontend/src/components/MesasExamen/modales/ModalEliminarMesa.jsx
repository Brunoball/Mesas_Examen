// src/components/MesasExamen/modales/ModalEliminarMesa.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import BASE_URL from "../../../config/config";

const ModalEliminarMesa = ({ open, mesa, onClose, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);

  // Preferimos numero_mesa; si no viene, probamos id_mesa/id (retrocompat)
  const numeroMesa = Number(
    mesa?.numero_mesa ??
    mesa?.id_mesa ??
    mesa?.id ??
    0
  );

  // Evitar doble submit (StrictMode / doble montaje)
  const sentOnceRef = useRef(false);

  useEffect(() => {
    if (open) sentOnceRef.current = false;
  }, [open]);

  const eliminar = useCallback(async () => {
    if (!numeroMesa) {
      onError?.("Número de mesa inválido.");
      return;
    }
    if (loading) return;

    try {
      setLoading(true);

      if (sentOnceRef.current) return;
      sentOnceRef.current = true;

      const resp = await fetch(`${BASE_URL}/api.php?action=mesa_eliminar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 🔴 El backend debe aceptar { numero_mesa } (recomendado).
        //    Si tu backend todavía espera id_mesa, avisame y te paso ese archivo ajustado.
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
    } catch (e) {
      sentOnceRef.current = false; // permitir reintento
      onError?.(e?.message || "No se pudo eliminar la mesa.");
    } finally {
      setLoading(false);
    }
  }, [numeroMesa, loading, onSuccess, onError]);

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !loading && open) onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loading, open, onClose]);

  if (!open) return null;

  const titulo = mesa?.materia
    ? `¿Eliminar la mesa de "${mesa.materia}"?`
    : "¿Eliminar esta mesa?";

  const detalle = [
    numeroMesa ? `N° mesa: ${numeroMesa}` : null,
    mesa?.curso ? `Curso: ${mesa.curso}` : null,
    mesa?.division ? `División: ${mesa.division}` : null,
    mesa?.fecha ? `Fecha: ${mesa.fecha}` : null,
    mesa?.turno ? `Turno: ${mesa.turno}` : null,
  ].filter(Boolean).join(" • ");

  return (
    <div
      className="glob-modal-backdrop"
      onClick={() => (!loading ? onClose?.() : null)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glob-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="glob-modal-header">
          <h3>Eliminar mesa</h3>
        </div>

        <div className="glob-modal-body">
          <p style={{ marginBottom: 8 }}>{titulo}</p>
          {detalle ? <small>{detalle}</small> : null}
          {!numeroMesa && (
            <small style={{ color: "var(--glob-danger,#c0392b)" }}>
              No se detectó un número de mesa válido.
            </small>
          )}
        </div>

        <div className="glob-modal-footer">
          <button className="glob-btn" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="glob-btn danger"
            onClick={eliminar}
            disabled={loading || !numeroMesa}
            style={{ background: "var(--glob-danger,#c0392b)" }}
          >
            {loading ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalEliminarMesa;
