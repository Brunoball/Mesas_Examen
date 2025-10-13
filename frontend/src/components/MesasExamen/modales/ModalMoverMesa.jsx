// src/components/MesasExamen/modales/ModalMoverMesa.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FaTimes, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";

/**
 * MISMA estética que ModalCrearMesas / ModalInfoPrevia:
 * - Reutiliza clases: mi-modal__*, mi-card, mi-input, mi-btn, etc.
 * - Reutiliza el CSS de ModalCrearMesas.css (importado aquí).
 */
import "./ModalCrearMesas.css";      // ⬅️ Reutilizamos todo el theme ya existente
import "./ModalMoverMesa.css";       // ⬅️ (Opcional) pequeños ajustes locales

const ModalMoverMesa = ({
  open,
  onClose,
  numeroMesaOrigen,   // número a mover
  fechaObjetivo,      // YYYY-MM-DD
  idTurnoObjetivo,    // number | null
  onMoved,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [grupos, setGrupos] = useState([]); // grupos incompletos
  const [destino, setDestino] = useState("");

  const closeIfOverlay = useCallback((e) => {
    if (e.target.classList.contains("mi-modal__overlay")) onClose?.();
  }, [onClose]);

  const cargarGrupos = async () => {
    try {
      setLoading(true);
      const body = {
        fecha_mesa: fechaObjetivo || null,
        id_turno: idTurnoObjetivo ?? null,
      };
      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_listar_grupos_incompletos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      const arr = Array.isArray(json.data) ? json.data : [];
      const filtrado = arr.filter(g =>
        ![g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
          .map(n => Number(n || 0))
          .includes(Number(numeroMesaOrigen))
      );
      setGrupos(filtrado);
    } catch (e) {
      onError?.(e.message || "No se pudieron cargar grupos incompletos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) cargarGrupos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, numeroMesaOrigen, fechaObjetivo, idTurnoObjetivo]);

  const puedeMover = useMemo(() => !!destino, [destino]);

  const mover = async () => {
    try {
      if (!destino) return;
      const resp = await fetch(`${BASE_URL}/api.php?action=mesa_mover_de_grupo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_mesa: Number(numeroMesaOrigen),
          id_grupo_destino: Number(destino),
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      onMoved?.();
      onClose?.();
    } catch (e) {
      onError?.(e.message || "No se pudo mover la mesa.");
    }
  };

  if (!open) return null;

  const subTitle = [
    fechaObjetivo ? `Fecha: ${fechaObjetivo}` : null,
    Number.isFinite(Number(idTurnoObjetivo)) ? `Turno: ${idTurnoObjetivo}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="mi-modal__overlay" onClick={closeIfOverlay}>
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-mover-mesa"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con look rojo */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="titulo-mover-mesa" className="mi-modal__title">
              Mover número {numeroMesaOrigen}
            </h2>
            <p className="mi-modal__subtitle">
              {subTitle || "Seleccioná el grupo de destino"}
            </p>
          </div>
          <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <FaTimes />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="mi-modal__content">
          <section className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Grupo destino</h3>

                {loading ? (
                  <p className="mi-help">Cargando grupos…</p>
                ) : grupos.length === 0 ? (
                  <p className="mi-help">
                    No hay grupos con lugar para la fecha/turno seleccionados.
                  </p>
                ) : (
                  <div className="mi-form-grid-2">
                    <div className="mi-form-row">
                      <label className="mi-label-strong">Seleccionar grupo</label>
                      <select
                        className="mi-input"
                        value={destino}
                        onChange={(e) => setDestino(e.target.value)}
                      >
                        <option value="">Seleccionar…</option>
                        {grupos.map((g) => {
                          const numeros = [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
                            .filter((n) => Number(n || 0) > 0)
                            .join(" · ");
                          const libres = 4 - [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
                            .filter((n) => Number(n || 0) > 0).length;
                          return (
                            <option key={g.id_grupo} value={g.id_grupo}>
                              {`Grupo ${g.id_grupo} – ${g.fecha_mesa} (turno ${g.id_turno}) — ocupa: ${numeros || "—"} — libres: ${libres}`}
                            </option>
                          );
                        })}
                      </select>
                      <p className="mi-help">
                        Al mover, la mesa adoptará la fecha/turno del grupo destino.
                      </p>
                    </div>
                  </div>
                )}
              </article>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mi-modal__footer">
          <button type="button" className="mi-btn mi-btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="mi-btn mi-btn--primary"
            onClick={mover}
            disabled={!puedeMover}
            title="Mover al grupo destino"
          >
            <FaCheck style={{ marginRight: 6 }} />
            Mover
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalMoverMesa;
