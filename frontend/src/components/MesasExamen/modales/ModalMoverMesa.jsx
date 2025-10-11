// src/components/MesasExamen/modales/ModalMoverMesa.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FaTimes } from "react-icons/fa";
import BASE_URL from "../../../config/config";

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
      // Evitar ofrecer el grupo que ya contiene al origen (el backend también lo valida)
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
          // Al mover, sincronizamos la fecha/turno de la mesa a los del grupo destino (lo hace el backend).
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      onMoved?.();
    } catch (e) {
      onError?.(e.message || "No se pudo mover la mesa.");
    }
  };

  if (!open) return null;

  return (
    <div className="glob-modal-backdrop">
      <div className="glob-modal">
        <div className="glob-modal-header">
          <h3>Mover número {numeroMesaOrigen} a otro grupo</h3>
          <button className="glob-modal-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="glob-modal-body" style={{ display: "grid", gap: 12 }}>
          <p>Seleccioná un grupo que <b>no esté completo</b> para mover este número.</p>

          {loading ? (
            <div>Cargando grupos…</div>
          ) : grupos.length === 0 ? (
            <div>No hay grupos con lugar para la fecha/turno seleccionados.</div>
          ) : (
            <label className="glob-form-field">
              <span className="glob-form-label">Grupo destino</span>
              <select
                className="glob-search-input"
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
            </label>
          )}
        </div>

        <div className="glob-modal-footer">
          <button className="glob-profesor-button glob-hover-effect" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="glob-profesor-button glob-hover-effect"
            onClick={mover}
            disabled={!puedeMover}
            title="Mover al grupo destino"
          >
            Mover
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalMoverMesa;
