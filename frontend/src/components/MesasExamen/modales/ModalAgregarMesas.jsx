// src/components/MesasExamen/modales/ModalAgregarMesas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FaTimes, FaPlus, FaSearch } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalAgregarMesas.css";

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const ModalAgregarMesas = ({
  open,
  onClose,
  idGrupo, // puede ser null
  numeroMesaActual,
  fechaObjetivo, // string YYYY-MM-DD
  idTurnoObjetivo, // number | null
  onAdded,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [candidatas, setCandidatas] = useState([]);
  const [busca, setBusca] = useState("");

  const fetchCandidatas = async () => {
    try {
      setLoading(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_no_agrupadas_candidatas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha_objetivo: fechaObjetivo || null,
          id_turno_objetivo: idTurnoObjetivo ?? null,
          numero_mesa_actual: numeroMesaActual,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      setCandidatas(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      onError?.(e.message || "No se pudieron cargar las mesas no agrupadas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchCandidatas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fechaObjetivo, idTurnoObjetivo, numeroMesaActual]);

  const list = useMemo(() => {
    const q = norm(busca);
    return candidatas.filter((c) => {
      if (!q) return true;
      const blob = `${c.numero_mesa} ${c.materia} ${(c.docentes || []).join(" ")} ${(c.alumnos || []).join(" ")}`;
      return norm(blob).includes(q);
    });
  }, [candidatas, busca]);

  const agregar = async (numero) => {
    try {
      setLoading(true);
      const action = "mesa_grupo_agregar_numero";
      const payload = idGrupo
        ? { id_grupo: Number(idGrupo), numero_mesa: Number(numero), fecha_objetivo: fechaObjetivo || null }
        : { numeros_mesa: [Number(numeroMesaActual), Number(numero)], fecha_objetivo: fechaObjetivo || null };

      const url = idGrupo
        ? `${BASE_URL}/api.php?action=${action}`
        : `${BASE_URL}/api.php?action=mesa_grupo_crear`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      onAdded?.();
    } catch (e) {
      onError?.(e.message || "No se pudo agregar la mesa al grupo.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="agmes_backdrop" role="dialog" aria-modal="true" aria-labelledby="agmes_title">
      <div className="agmes_modal">
        {/* HEADER */}
        <div className="agmes_header">
          <h3 id="agmes_title">Agregar número al grupo</h3>
          <button className="agmes_close" onClick={onClose} title="Cerrar" aria-label="Cerrar modal">
            <FaTimes />
          </button>
        </div>

        {/* BODY */}
        <div className="agmes_body">
          {/* BUSCADOR */}
          <div className="agmes_search" style={{ width: "100%" }}>
            <FaSearch />
            <input
              placeholder="Buscar por número, materia, docente, alumno…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* ESTADOS */}
          {loading ? (
            <div className="agmes_nodata">
              <p>Cargando…</p>
            </div>
          ) : list.length === 0 ? (
            <div className="agmes_nodata">
              <p>No hay mesas no agrupadas disponibles.</p>
            </div>
          ) : (
            <div className="agmes_table">
              {/* HEADER TABLA */}
              <div className="agmes_headerrow">
                <div className="agmes_column num">N° Mesa</div>
                <div className="agmes_column materia">Materia</div>
                <div className="agmes_column docentes">Docentes</div>
                <div className="agmes_column elegible">Elegible</div>
                <div className="agmes_column accion">Acción</div>
              </div>

              {/* BODY TABLA */}
              {list.map((c) => (
                <div key={c.numero_mesa} className="agmes_row">
                  <div className="agmes_column num">{c.numero_mesa}</div>
                  <div className="agmes_column materia" title={c.materia || ""}>
                    {c.materia || "—"}
                  </div>
                  <div className="agmes_column docentes">
                    {c.docentes && c.docentes.length ? c.docentes.join(" | ") : "—"}
                  </div>
                  <div className="agmes_column elegible">
                    {c.elegible ? "Sí" : `No (${c.motivo || "regla prioridad-1"})`}
                  </div>
                  <div className="agmes_column accion">
                    <button
                      className="agmes_iconbtn"
                      disabled={!c.elegible}
                      title={c.elegible ? "Agregar a este grupo" : "No elegible"}
                      onClick={() => agregar(c.numero_mesa)}
                      aria-disabled={!c.elegible}
                    >
                      <FaPlus />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="agmes_footer">
          <button className="agmes_btnclose" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalAgregarMesas;
