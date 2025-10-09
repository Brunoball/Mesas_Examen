// src/components/MesasExamen/modales/ModalEliminarMesas.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FaTimes, FaTrash, FaCalendarAlt, FaClock } from "react-icons/fa";
import BASE_URL from "../../../config/config";
// Reutilizamos la estética del modal rojo
import "./ModalCrearMesas.css";

/**
 * ModalEliminarMesas — Confirmación para eliminar mesas en lote.
 *
 * Principios SOLID aplicados:
 * - SRP: el componente solo renderiza UI y orquesta acciones; helpers puros aparte.
 * - OCP: endpoint/base pueden inyectarse por props sin modificar el componente.
 * - LSP/ISP: API mínima de props; no obliga a pasar "listas" si no hace falta.
 * - DIP: fetch depende de apiBase/endpointAction recibidos (con defaults).
 */

/* ========================= Helpers puros ========================= */

/**
 * Construye el body a enviar según filtros completados.
 * @param {string} fechaMesa  yyyy-mm-dd | ""
 * @param {string|number} idTurno  id o "" (vacío)
 * @returns {{}} cuerpo listo para JSON.stringify
 */
const buildDeleteBody = (fechaMesa, idTurno) => {
  const body = {};
  if (fechaMesa) body.fecha_mesa = fechaMesa;
  if (idTurno) body.id_turno = Number(idTurno);
  return body;
};

/**
 * Ejecuta el POST de eliminación.
 * @param {string} apiBase
 * @param {string} endpointAction
 * @param {object} body
 * @returns {Promise<{ok:boolean, json:any, status:number}>}
 */
const deleteMesas = async (apiBase, endpointAction, body) => {
  const resp = await fetch(`${apiBase}/api.php?action=${endpointAction}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok && Boolean(json?.exito), json, status: resp.status };
};

/* ========================= Componente ========================= */

const ModalEliminarMesas = ({
  open,
  onClose,
  onSuccess,
  onError,
  listas = {},
  // Dependencias inyectables para OCP/DIP:
  apiBase = BASE_URL,
  endpointAction = "mesas_eliminar_todas",
}) => {
  // Normalizamos turnos una sola vez
  const turnos = useMemo(
    () =>
      (listas?.turnos ?? []).map((t) => ({
        id: Number(t.id_turno ?? t.id ?? 0),
        nombre: String(t.nombre ?? t.turno ?? "").trim(),
      })),
    [listas]
  );

  const [fechaMesa, setFechaMesa] = useState("");
  const [idTurno, setIdTurno] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Limpieza al abrir
  useEffect(() => {
    if (!open) return;
    setEnviando(false);
    // No forzamos limpiar filtros: puede ser útil mantenerlos al reabrir.
  }, [open]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target.classList.contains("mi-modal__overlay")) onClose?.();
    },
    [onClose]
  );

  const handleDelete = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (enviando) return;

      setEnviando(true);
      try {
        const body = buildDeleteBody(fechaMesa, idTurno);
        const { ok, json, status } = await deleteMesas(
          apiBase,
          endpointAction,
          body
        );

        if (!ok) {
          const msg =
            json?.mensaje || `No se pudo eliminar [HTTP ${status}]`;
          onError?.(msg);
          return;
        }

        onSuccess?.(json);
        onClose?.();
      } catch {
        onError?.("Error de red al eliminar las mesas.");
      } finally {
        setEnviando(false);
      }
    },
    [apiBase, endpointAction, fechaMesa, idTurno, enviando, onClose, onSuccess, onError]
  );

  if (!open) return null;

  return (
    <div className="mi-modal__overlay" onClick={handleOverlayClick}>
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mi-modal-title-eliminar-mesas"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header rojo */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="mi-modal-title-eliminar-mesas" className="mi-modal__title">
              Eliminar mesas en lote
            </h2>
            <p className="mi-modal__subtitle">
              Esta acción no se puede deshacer. Podés acotar por fecha y/o turno.
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

        {/* Cuerpo — misma estética que ModalCrearMesas */}
        <form className="mi-modal__content" onSubmit={handleDelete}>
          <section className="mi-tabpanel">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Filtros (opcionales)</h3>

                <div className="mi-form-grid-2">
                  {/* FECHA (nativo) + pista visual */}
                  <div className="mi-form-row">
                    <label className="mi-label-strong">
                      <FaCalendarAlt style={{ marginRight: 6 }} />
                      Fecha <span className="mi-optional">(opcional)</span>
                    </label>
                    <input
                      type="date"
                      className="mi-input"
                      value={fechaMesa}
                      onChange={(e) => setFechaMesa(e.target.value)}
                      title="Formato sugerido: dd/mm/aaaa (según tu región)"
                    />
                    <div className="mi-hint">
                      Ejemplo: <strong>dd/mm/aaaa</strong> (según configuración regional).
                    </div>
                  </div>

                  {/* TURNO (select) + pista visual */}
                  <div className="mi-form-row">
                    <label className="mi-label-strong">
                      <FaClock style={{ marginRight: 6 }} />
                      Turno <span className="mi-optional">(opcional)</span>
                    </label>
                    <select
                      className="mi-input"
                      value={idTurno}
                      onChange={(e) => setIdTurno(e.target.value)}
                      title="Seleccioná un turno o dejá vacío para cualquiera"
                    >
                      <option value="">— Cualquiera —</option>
                      {turnos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre || `Turno ${t.id}`}
                        </option>
                      ))}
                    </select>
                    <div className="mi-hint">
                      Dejalo vacío para aplicar a <strong>todos</strong> los turnos.
                    </div>
                  </div>
                </div>

                <p className="mi-help">
                  Si dejás ambos campos vacíos, se eliminarán <strong>TODAS</strong> las
                  mesas según lo determine tu backend.
                </p>
              </article>
            </div>
          </section>

          {/* Footer — patrón consistente */}
          <div className="mi-modal__footer">
            <button
              type="button"
              className="mi-btn mi-btn--ghost"
              onClick={onClose}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="mi-btn mi-btn--primary"
              disabled={enviando}
              title=""
            >
              <FaTrash style={{ marginRight: 6 }} />
              {enviando ? "Eliminando..." : "Eliminar mesas"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalEliminarMesas;
