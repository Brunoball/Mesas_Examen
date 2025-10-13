// src/components/MesasExamen/EditarMesa.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaSave,
  FaTrash,
  FaCalendarAlt,
  FaClock,
  FaExchangeAlt,
  FaPlus,
} from "react-icons/fa";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";

import BASE_URL from "../../config/config";
import "../Global/section-ui.css";
import Toast from "../Global/Toast";
import ModalEliminarMesa from "./modales/ModalEliminarMesa";
import ModalAgregarMesas from "./modales/ModalAgregarMesas";
import ModalMoverMesa from "./modales/ModalMoverMesa";

import "../Previas/AgregarPrevia.css";
import "./EditarMesa.css";

// Calendario inline (asegurate de tenerlo en src/components/Global/InlineCalendar.jsx)
import InlineCalendar from "../Global/InlineCalendar";

/* Utils */
const fmtISO = (d) => {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return "";
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, "0");
  const day = String(dd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const EditarMesa = () => {
  const { id: numeroMesaParam } = useParams();
  const numeroMesa = Number(numeroMesaParam);
  const navigate = useNavigate();

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [mesa, setMesa] = useState(null);
  const [idGrupo, setIdGrupo] = useState(null);
  const [numerosGrupo, setNumerosGrupo] = useState([]);
  const [detalleGrupo, setDetalleGrupo] = useState([]);
  const [turnos, setTurnos] = useState([]);

  const [fecha, setFecha] = useState("");
  const [idTurno, setIdTurno] = useState("");

  const [toast, setToast] = useState(null);
  const notify = useCallback(
    ({ tipo = "info", mensaje = "", duracion = 3500 }) =>
      setToast({ tipo, mensaje, duracion }),
    []
  );

  const [openDelete, setOpenDelete] = useState(false);
  const [openAgregar, setOpenAgregar] = useState(false);
  const [openMover, setOpenMover] = useState(false);
  const [numeroParaMover, setNumeroParaMover] = useState(null);

  const cargarTodo = useCallback(async () => {
    if (!numeroMesa || !Number.isFinite(numeroMesa)) {
      throw new Error("Número de mesa inválido.");
    }

    const resListas = await fetch(`${BASE_URL}/api.php?action=obtener_listas`, { cache: "no-store" });
    const jListas = await resListas.json().catch(() => ({}));
    const ts = (jListas?.listas?.turnos || [])
      .map((t) => ({
        id_turno: Number(t.id_turno ?? t.id ?? 0),
        turno: String(t.turno ?? t.nombre ?? "").trim(),
        _n: norm(t.turno ?? t.nombre ?? ""),
      }))
      .filter((t) => t.id_turno && t.turno);
    setTurnos(ts);

    const rGr = await fetch(`${BASE_URL}/api.php?action=mesas_listar_grupos`, { cache: "no-store" });
    const jGr = await rGr.json().catch(() => ({}));
    if (!rGr.ok || !jGr?.exito) throw new Error(jGr?.mensaje || "No se pudieron obtener los grupos.");
    const grupos = Array.isArray(jGr.data) ? jGr.data : [];
    const filaGrupo = grupos.find((g) =>
      [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
        .map((n) => Number(n || 0))
        .includes(numeroMesa)
    );

    if (!filaGrupo) {
      setIdGrupo(null);
      setNumerosGrupo([numeroMesa]);
    } else {
      setIdGrupo(Number(filaGrupo.id_grupo ?? filaGrupo.id_mesa_grupos ?? 0));
      const arrNums = [
        Number(filaGrupo.numero_mesa_1 || 0),
        Number(filaGrupo.numero_mesa_2 || 0),
        Number(filaGrupo.numero_mesa_3 || 0),
        Number(filaGrupo.numero_mesa_4 || 0),
      ].filter((n) => n > 0);
      setNumerosGrupo(arrNums.length ? arrNums : [numeroMesa]);
    }

    const nums = filaGrupo
      ? [
          Number(filaGrupo.numero_mesa_1 || 0),
          Number(filaGrupo.numero_mesa_2 || 0),
          Number(filaGrupo.numero_mesa_3 || 0),
          Number(filaGrupo.numero_mesa_4 || 0),
        ].filter((n) => n > 0)
      : [numeroMesa];

    const respDetGrupo = await fetch(`${BASE_URL}/api.php?action=mesas_detalle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numeros_mesa: nums }),
    });
    const jDetGrupo = await respDetGrupo.json().catch(() => ({}));
    if (!respDetGrupo.ok || !jDetGrupo?.exito) {
      throw new Error(jDetGrupo?.mensaje || `HTTP ${respDetGrupo.status}`);
    }

    const det = (Array.isArray(jDetGrupo.data) ? jDetGrupo.data : []).map((m) => ({
      numero_mesa: Number(m.numero_mesa || 0),
      materia: m.materia ?? "",
      fecha: m.fecha ?? "",
      id_turno: m.id_turno ?? null,
      turno: m.turno ?? "",
      docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
      alumnos: Array.isArray(m.alumnos) ? m.alumnos : [],
    }));

    const actual = det.find((x) => x.numero_mesa === numeroMesa);
    if (!actual) throw new Error("No se encontró detalle de la mesa.");

    const fechaInicial = fmtISO(actual.fecha);
    let idTurnoInicial = "";
    if (actual.id_turno) {
      idTurnoInicial = String(actual.id_turno);
    } else if (actual.turno) {
      const tObj = ts.find((t) => t._n === norm(actual.turno));
      if (tObj?.id_turno) idTurnoInicial = String(tObj.id_turno);
    }

    setMesa({ numero_mesa: numeroMesa, materia: actual.materia });
    setFecha(fechaInicial);
    setIdTurno(idTurnoInicial);

    det.sort((a, b) => a.numero_mesa - b.numero_mesa);
    setDetalleGrupo(det);
  }, [numeroMesa]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setCargando(true);
        await cargarTodo();
      } catch (e) {
        notify({ tipo: "error", mensaje: e.message || "Error cargando datos" });
      } finally {
        if (alive) setCargando(false);
      }
    })();
    return () => { alive = false; };
  }, [cargarTodo, notify]);

  const materiaTitle = useMemo(() => (mesa?.materia || ""), [mesa]);

  const onSave = async () => {
    try {
      if (!fecha || !idTurno) {
        notify({ tipo: "error", mensaje: "Completá fecha y turno." });
        return;
      }
      setGuardando(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=mesa_actualizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_mesa: numeroMesa,
          fecha_mesa: fecha,
          id_turno: Number(idTurno),
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      notify({ tipo: "exito", mensaje: "Mesa actualizada correctamente." });
      await cargarTodo();
    } catch (e) {
      notify({ tipo: "error", mensaje: e.message || "Error al guardar" });
    } finally {
      setGuardando(false);
    }
  };

  const quitarNumeroDelGrupo = async (n) => {
    if (!window.confirm(`¿Quitar el número ${n} de este grupo? (no se borra la mesa)`)) return;
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=mesa_grupo_quitar_numero`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_mesa: Number(n) }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      notify({ tipo: "exito", mensaje: `Número ${n} quitado del grupo.` });
      await cargarTodo();
    } catch (e) {
      notify({ tipo: "error", mensaje: e.message || "No se pudo quitar el número." });
    }
  };

  if (cargando) {
    return (
      <div className="prev-add-container">
        <div className="prev-add-box">
          <div className="prev-add-header">
            <div className="prev-add-icon-title">
              <FontAwesomeIcon icon={faPenToSquare} className="prev-add-icon" />
              <div>
                <h1>Editar Mesa</h1>
                <p>Cargando…</p>
              </div>
            </div>
            <button type="button" className="prev-add-back-btn" onClick={() => navigate(-1)} title="Volver">
              <FaArrowLeft style={{ marginRight: 8 }} /> Volver
            </button>
          </div>
          <div className="prev-add-form-wrapper" id="form-wrapper">
            <p className="mesa-muted">Cargando mesa…</p>
          </div>
        </div>
      </div>
    );
  }
  if (!mesa) {
    return (
      <div className="prev-add-container">
        <div className="prev-add-box">
          <div className="prev-add-header">
            <div className="prev-add-icon-title">
              <FontAwesomeIcon icon={faPenToSquare} className="prev-add-icon" />
              <div>
                <h1>Editar Mesa</h1>
                <p>No se encontró la mesa solicitada</p>
              </div>
            </div>
            <button type="button" className="prev-add-back-btn" onClick={() => navigate(-1)} title="Volver">
              <FaArrowLeft style={{ marginRight: 8 }} /> Volver
            </button>
          </div>
          <div className="prev-add-form-wrapper">
            <p className="mesa-muted">No se encontró la mesa solicitada.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <div className="prev-add-container">
        <div className="prev-add-box">
          {/* ===== Header ===== */}
          <div className="prev-add-header">
            <div className="prev-add-icon-title">
              <FontAwesomeIcon icon={faPenToSquare} className="prev-add-icon" aria-hidden="true" />
              <div>
                <h1>Editar Mesa Nº {mesa.numero_mesa}{idGrupo ? ` — Grupo ${idGrupo}` : ""}</h1>
                <p>{materiaTitle}</p>
              </div>
            </div>
            <button
              type="button"
              className="prev-add-back-btn"
              onClick={() => navigate(-1)}
              title="Volver"
            >
              <FaArrowLeft style={{ marginRight: 8 }} />
              Volver
            </button>
          </div>

          {/* ===== Contenido ===== */}
          <div className="prev-add-form-wrapper">
            {/* GRID 2 columnas: ahora Programación (izq angosta) | Slots (der fluida) */}
            <div className="mesa-two-col">
              {/* IZQUIERDA: Programación (antes estaba a la derecha) */}
              <aside className="col-prog programacion-card">
                <div className="prev-section " id="prev-section-program">
                  <div className="prog-head">
                    <h3 className="prev-section-title">Programación</h3>
                    <div className="float-field">
                      <label className="float-label" htmlFor="turno-select">Turno</label>
                      <select
                        id="turno-select"
                        className="prev-input "
                        value={idTurno}
                        onChange={(e) => setIdTurno(e.target.value)}
                      >
                        <option value="">Seleccionar…</option>
                        {turnos.map((t) => (
                          <option key={t.id_turno} value={t.id_turno}>
                            {t.turno}
                          </option>
                        ))}
                      </select>
                      <span className="prev-input-highlight" />
                    </div>
                  </div>

                  <div className="prog-block">
                    <label className="prev-label" style={{ display: "block", marginBottom: 6 }}>
                      <FaCalendarAlt style={{ marginRight: 6 }} />
                      Fecha
                    </label>
                    <InlineCalendar
                      value={fecha}
                      onChange={(v) => setFecha(v)}
                      locale="es-AR"
                      weekStartsOn={1}
                    />
                  </div>
                </div>
              </aside>

              {/* DERECHA: Slots del grupo (antes estaba a la izquierda) */}
              <section className="col-materia">
                <div className="prev-section">
                  <h3 className="prev-section-title">Slots del grupo (hasta 4)</h3>

                  <div className="mesa-cards">
                    {(() => {
                      const ocupados = [...detalleGrupo].sort((a, b) => a.numero_mesa - b.numero_mesa);
                      const arr = [];
                      for (let i = 0; i < 4; i++) arr.push(ocupados[i] ?? null);
                      return arr.map((slot, idx) => {
                        if (slot) {
                          const docentes = Array.isArray(slot.docentes) ? slot.docentes : [];
                          return (
                            <article key={`slot-ok-${slot.numero_mesa}`} className="mesa-card">
                              <div className="mesa-card-head">
                                <span className="mesa-badge">N° {slot.numero_mesa}</span>
                                <div className="mesa-card-actions">
                                  <button
                                    className="mesa-chip info"
                                    title="Mover este número a otro grupo"
                                    onClick={() => { setNumeroParaMover(slot.numero_mesa); setOpenMover(true); }}
                                  >
                                    <FaExchangeAlt />
                                  </button>
                                  <button
                                    className="mesa-chip danger"
                                    title="Quitar del grupo (no borra la mesa)"
                                    onClick={() => quitarNumeroDelGrupo(slot.numero_mesa)}
                                    disabled={!idGrupo}
                                  >
                                    <FaTrash />
                                  </button>
                                </div>
                              </div>
                              <h4 className="mesa-card-title">{slot.materia || "Sin materia"}</h4>
                              <p className="mesa-card-sub">
                                {docentes.length ? `Docentes: ${docentes.join(" | ")}` : "Docentes: —"}
                              </p>
                            </article>
                          );
                        }
                        return (
                          <button
                            key={`slot-free-${idx}`}
                            className="mesa-card add"
                            onClick={() => setOpenAgregar(true)}
                            disabled={numerosGrupo.length >= 4}
                            title="Agregar número al grupo"
                          >
                            <FaPlus /> Agregar número
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              </section>
            </div>

            {/* Botonera */}
            <div className="prev-add-buttons "  id="v-add-buttons">
              <button
                type="button"
                className="prev-add-button prev-add-button--back"
                onClick={() => setOpenDelete(true)}
                title="Eliminar mesa (alumno)"
              >
                <FaTrash style={{ marginRight: 8 }} />
                Eliminar
              </button>

              <button
                type="button"
                className="prev-add-button"
                disabled={guardando}
                onClick={onSave}
                title="Guardar"
              >
                <FaSave style={{ marginRight: 8 }} />
                {guardando ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>

          {/* Modales */}
          {openDelete && (
            <ModalEliminarMesa
              open={openDelete}
              mesa={{ numero_mesa: numeroMesa }}
              onClose={() => setOpenDelete(false)}
              onSuccess={() => {
                setOpenDelete(false);
                notify({ tipo: "exito", mensaje: "Mesa eliminada." });
                setTimeout(() => navigate("/mesas-examen"), 400);
              }}
              onError={(mensaje) => notify({ tipo: "error", mensaje: mensaje || "No se pudo eliminar la mesa." })}
            />
          )}

          {openAgregar && (
            <ModalAgregarMesas
              open={openAgregar}
              onClose={() => setOpenAgregar(false)}
              idGrupo={idGrupo}
              numeroMesaActual={numeroMesa}
              fechaObjetivo={fecha}
              idTurnoObjetivo={idTurno ? Number(idTurno) : null}
              onAdded={() => {
                setOpenAgregar(false);
                notify({ tipo: "exito", mensaje: "Número agregado al grupo." });
                cargarTodo();
              }}
              onError={(mensaje) => notify({ tipo: "error", mensaje })}
            />
          )}

          {openMover && (
            <ModalMoverMesa
              open={openMover}
              onClose={() => setOpenMover(false)}
              numeroMesaOrigen={numeroParaMover ?? numeroMesa}
              fechaObjetivo={fecha}
              idTurnoObjetivo={idTurno ? Number(idTurno) : null}
              onMoved={() => {
                setOpenMover(false);
                setNumeroParaMover(null);
                notify({ tipo: "exito", mensaje: "Número movido de grupo." });
                cargarTodo();
              }}
              onError={(mensaje) => notify({ tipo: "error", mensaje })}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default EditarMesa;
