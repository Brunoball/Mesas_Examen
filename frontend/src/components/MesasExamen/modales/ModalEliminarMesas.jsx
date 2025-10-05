// src/components/MesasExamen/modales/ModalEliminarMesas.jsx
import React, { useMemo, useState } from "react";
import { FaTimes, FaTrash, FaCalendarAlt, FaClock } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalEliminarMesas.css";

/**
 * Modal de confirmación para eliminar mesas en lote.
 * POST -> api.php?action=mesas_eliminar_todas
 * Body opcional: { fecha_mesa, id_turno }
 * Si body vacío => elimina TODAS (según backend).
 */
const ModalEliminarMesas = ({
  open,
  onClose,
  onSuccess,
  onError,
  listas = {},
}) => {
  const ENDPOINT_ACTION = "mesas_eliminar_todas";

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

  if (!open) return null;

  const handleDelete = async (e) => {
    e?.preventDefault?.();
    if (enviando) return;

    setEnviando(true);
    try {
      const body = {};
      if (fechaMesa) body.fecha_mesa = fechaMesa;
      if (idTurno) body.id_turno = Number(idTurno);

      const resp = await fetch(`${BASE_URL}/api.php?action=${ENDPOINT_ACTION}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json?.exito) {
        const msg = json?.mensaje || `No se pudo eliminar [HTTP ${resp.status}]`;
        onError?.(msg);
        return;
      }

      // Éxito -> delega al padre (mostrar Toast y refrescar)
      onSuccess?.(json);
    } catch {
      onError?.("Error de red al eliminar las mesas.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="glob-modal-overlay">
      <div className="glob-modal">
        <div className="glob-modal-header">
          <h3>Eliminar mesas en lote</h3>
          <button className="glob-modal-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <form className="glob-modal-body" onSubmit={handleDelete}>
          <p style={{ marginBottom: 12 }}>
            Esta acción <strong>no se puede deshacer</strong>. Podés acotar por
            fecha y/o turno. Si dejás ambos vacíos, se eliminarán{" "}
            <strong>TODAS</strong> las mesas (según tu backend).
          </p>

          <div className="glob-form-row">
            <label className="glob-label">
              <FaCalendarAlt style={{ marginRight: 6 }} />
              Fecha (opcional)
            </label>
            <input
              type="date"
              className="glob-input"
              value={fechaMesa}
              onChange={(e) => setFechaMesa(e.target.value)}
            />
          </div>

          <div className="glob-form-row">
            <label className="glob-label">
              <FaClock style={{ marginRight: 6 }} />
              Turno (opcional)
            </label>
            <select
              className="glob-select"
              value={idTurno}
              onChange={(e) => setIdTurno(e.target.value)}
            >
              <option value="">— Cualquiera —</option>
              {turnos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre || `Turno ${t.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="glob-modal-footer">
            <button type="button" className="glob-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="glob-btn danger"
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
