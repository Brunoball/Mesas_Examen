// src/components/MesasExamen/modales/ModalCrearMesas.jsx
import React, { useMemo, useState } from "react";
import { FaTimes, FaCalendarAlt, FaClock, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalCrearMesas.css";


/**
 * Modal para crear mesas en lote.
 * POST -> api.php?action=mesas_crear_todas
 * Body opcional: { fecha_mesa, id_turno, anio, id_materia, id_curso, id_division }
 */
const ModalCrearMesas = ({ open, onClose, onSuccess, listas = {} }) => {
  // ---- Hooks SIEMPRE primero (nada de early-return antes) ----
  const turnos = useMemo(
    () =>
      (listas?.turnos ?? []).map((t) => ({
        id: Number(t.id_turno ?? t.id ?? 0),
        nombre: String(t.nombre ?? t.turno ?? "").trim(),
      })),
    [listas]
  );

  const cursos = useMemo(
    () =>
      (listas?.cursos ?? []).map((c) => ({
        id: Number(c.id_curso ?? c.id ?? 0),
        nombre: String(c.nombre ?? c.nombre_curso ?? "").trim(),
      })),
    [listas]
  );

  const divisiones = useMemo(
    () =>
      (listas?.divisiones ?? []).map((d) => ({
        id: Number(d.id_division ?? d.id ?? 0),
        nombre: String(d.nombre ?? d.nombre_division ?? "").trim(),
      })),
    [listas]
  );

  // form
  const [fechaMesa, setFechaMesa] = useState("");
  const [idTurno, setIdTurno] = useState("");
  const [anio, setAnio] = useState("");
  const [idMateria, setIdMateria] = useState("");
  const [idCurso, setIdCurso] = useState("");
  const [idDivision, setIdDivision] = useState("");
  const [enviando, setEnviando] = useState(false);

  // ---- Ahora sí, si está cerrado, no renderizar ----
  if (!open) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    try {
      setEnviando(true);

      const body = {};
      if (fechaMesa) body.fecha_mesa = fechaMesa;
      if (idTurno) body.id_turno = Number(idTurno);
      if (anio) body.anio = Number(anio);
      if (idMateria) body.id_materia = Number(idMateria);
      if (idCurso) body.id_curso = Number(idCurso);
      if (idDivision) body.id_division = Number(idDivision);

      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_crear_todas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json?.exito) {
        const msg =
          json?.mensaje || `No se pudo crear el lote [HTTP ${resp.status}]`;
        alert(msg + (json?.detalle ? `\n${json.detalle}` : ""));
        return;
      }

      alert(
        [
          json.mensaje || "Mesas creadas",
          `Previas encontradas: ${json.total_previas}`,
          `Mesas creadas OK: ${json.creadas_ok}`,
          `Mesas incompletas: ${json.creadas_incompletas}`,
          `Omitidas (duplicadas): ${json.omitidas_duplicadas}`,
          `Total creadas: ${json.creadas_total}`,
        ].join("\n")
      );

      onSuccess?.();
    } catch (e) {
      console.error("[ModalCrearMesas] error:", e);
      alert("Error de red al crear las mesas.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="glob-modal-overlay">
      <div className="glob-modal">
        <div className="glob-modal-header">
          <h3>Crear mesas en lote</h3>
          <button className="glob-modal-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <form className="glob-modal-body" onSubmit={handleSubmit}>
          <p style={{ marginBottom: 12 }}>
            Podés fijar fecha y turno, y opcionalmente acotar por curso/división/materia/año.
            Si dejás todo vacío, se usa la configuración por defecto del backend.
          </p>

          <div className="glob-form-row">
            <label className="glob-label">
              <FaCalendarAlt style={{ marginRight: 6 }} />
              Fecha de mesa (opcional)
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
              <option value="">— Sin especificar —</option>
              {turnos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre || `Turno ${t.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="glob-grid-2">
            <div className="glob-form-row">
              <label className="glob-label">Curso (opcional)</label>
              <select
                className="glob-select"
                value={idCurso}
                onChange={(e) => setIdCurso(e.target.value)}
              >
                <option value="">— Todos —</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre || `Curso ${c.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="glob-form-row">
              <label className="glob-label">División (opcional)</label>
              <select
                className="glob-select"
                value={idDivision}
                onChange={(e) => setIdDivision(e.target.value)}
              >
                <option value="">— Todas —</option>
                {divisiones.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre || `División ${d.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="glob-grid-2">
            <div className="glob-form-row">
              <label className="glob-label">ID Materia (opcional)</label>
              <input
                className="glob-input"
                type="number"
                min="1"
                value={idMateria}
                onChange={(e) => setIdMateria(e.target.value)}
                placeholder="Ej: 42"
              />
            </div>

            <div className="glob-form-row">
              <label className="glob-label">Año (opcional)</label>
              <input
                className="glob-input"
                type="number"
                min="2000"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                placeholder="Ej: 2025"
              />
            </div>
          </div>

          <div className="glob-modal-footer">
            <button type="button" className="glob-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="glob-btn primary" disabled={enviando}>
              <FaCheck style={{ marginRight: 6 }} />
              {enviando ? "Creando..." : "Crear mesas"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalCrearMesas;
