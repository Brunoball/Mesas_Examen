import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../config/config";
import "./ModalAgregar.css";

const normalizar = (s = "") =>
  s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/**
 * ModalAgregar
 * - open: bool
 * - catedra: { id_catedra, materia, nombre_curso, nombre_division, ... }
 * - onClose: fn()
 * - onAsignado: fn()  // callback para refrescar lista tras asignar
 */
const ModalAgregar = ({ open, catedra, onClose, onAsignado }) => {
  const [q, setQ] = useState("");
  const [docentes, setDocentes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [seleccion, setSeleccion] = useState(null);
  const [asignando, setAsignando] = useState(false);

  const fetchDocentes = useCallback(async () => {
    try {
      setCargando(true);
      setError("");
      const url = `${BASE_URL}/api.php?action=docentes_list`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.exito) throw new Error(json.mensaje || "No se pudieron obtener los docentes");

      // Adaptación de shape a {id_docente, nombre}
      const arr = (json.docentes || []).map((d) => {
        const id = d.id_docente ?? d.id ?? d.ID ?? null;
        const nombre =
          d.nombre_completo ??
          d.docente ??
          d.nombre_y_apellido ??
          [d.apellido, d.nombre].filter(Boolean).join(", ");
        return { id_docente: id, nombre: nombre || "(sin nombre)" };
      });
      setDocentes(arr);
    } catch (e) {
      console.error("docentes_list error:", e);
      setError(`No se pudieron cargar los docentes. ${e.message}`);
      setDocentes([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSeleccion(null);
    fetchDocentes();

    // Bloquear scroll del body mientras el modal está abierto (opcional, cómodo)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, fetchDocentes]);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtrados = useMemo(() => {
    if (!q) return docentes;
    const nq = normalizar(q);
    return docentes.filter((d) => normalizar(d.nombre).includes(nq));
  }, [docentes, q]);

  const asignar = useCallback(async () => {
    if (!catedra?.id_catedra || !seleccion) return;
    try {
      setAsignando(true);
      setError("");
      const url = `${BASE_URL}/api.php?action=catedra_asignar_docente`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_catedra: catedra.id_catedra,
          id_docente: seleccion,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.exito) throw new Error(json.mensaje || "No se pudo asignar el docente");

      onAsignado?.(); // refrescar listado arriba
      onClose?.();    // cerrar modal
    } catch (e) {
      console.error("asignar error:", e);
      setError(`No se pudo asignar el docente. ${e.message}`);
    } finally {
      setAsignando(false);
    }
  }, [catedra, seleccion, onAsignado, onClose]);

  if (!open) return null;

  return (
    <div className="ma-overlay" role="dialog" aria-modal="true" aria-label="Asignar docente">
      <div className="ma-card" onClick={(e) => e.stopPropagation()}>
        <div className="ma-header">
          <h2>Asignar / Cambiar docente</h2>
          <button className="ma-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="ma-sub">
          <strong>Materia:</strong> {catedra?.materia ?? "-"} &nbsp;·&nbsp;
          <strong>Curso:</strong> {catedra?.nombre_curso ?? "-"} {catedra?.nombre_division ?? ""}
        </div>

        <div className="ma-search">
          <FontAwesomeIcon icon={faSearch} className="ma-search-icon" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar docente por nombre…"
            aria-label="Buscar docente"
          />
        </div>

        <div className="ma-body">
          {cargando ? (
            <div className="ma-status">Cargando docentes…</div>
          ) : error ? (
            <div className="ma-status ma-error">{error}</div>
          ) : filtrados.length === 0 ? (
            <div className="ma-status">Sin resultados</div>
          ) : (
            <ul className="ma-list">
              {filtrados.map((d) => (
                <li
                  key={d.id_docente}
                  className={seleccion === d.id_docente ? "sel" : ""}
                  onClick={() => setSeleccion(d.id_docente)}
                >
                  <span className="dot">{seleccion === d.id_docente ? "●" : "○"}</span>
                  <span className="name">{d.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ma-actions">
          <button className="ma-btn secondary" onClick={onClose}>Cancelar</button>
          <button
            className="ma-btn primary"
            onClick={asignar}
            disabled={!seleccion || asignando}
          >
            {asignando ? "Asignando…" : "Asignar"}
          </button>
        </div>
      </div>
      {/* Cerrar clickeando fuera */}
      <div className="ma-backdrop" onClick={onClose} />
    </div>
  );
};

export default ModalAgregar;
