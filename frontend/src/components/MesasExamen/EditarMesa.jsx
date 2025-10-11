// src/components/MesasExamen/EditarMesa.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaSave,
  FaTrash,
  FaCalendarAlt,
  FaClock,
  FaExchangeAlt,   // ⬅️ icono “cambiar/mover”
  FaPlus,
} from "react-icons/fa";
import BASE_URL from "../../config/config";
import "../Global/section-ui.css";
import Toast from "../Global/Toast";
import ModalEliminarMesa from "./modales/ModalEliminarMesa";
import ModalAgregarMesas from "./modales/ModalAgregarMesas";
import ModalMoverMesa from "./modales/ModalMoverMesa"; // ⬅️ NUEVO
import "./EditarMesa.css";

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

  // Modal “Agregar número”
  const [openAgregar, setOpenAgregar] = useState(false);

  // Modal “Mover número”
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

  const slots = useMemo(() => {
    const ocupados = [...detalleGrupo].sort((a, b) => a.numero_mesa - b.numero_mesa);
    const arr = [];
    for (let i = 0; i < 4; i++) arr.push(ocupados[i] ?? null);
    return arr;
  }, [detalleGrupo]);

  if (cargando) {
    return (
      <div className="glob-profesor-container">
        <div className="glob-profesor-box">
          <div className="glob-no-data-message"><div className="glob-message-content"><p>Cargando mesa…</p></div></div>
        </div>
      </div>
    );
  }
  if (!mesa) {
    return (
      <div className="glob-profesor-container">
        <div className="glob-profesor-box">
          <div className="glob-no-data-message"><div className="glob-message-content"><p>No se encontró la mesa solicitada.</p></div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="glob-profesor-container">
      <div className="glob-profesor-box">
        <div className="glob-front-row-pro">
          <button className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => navigate("/mesas-examen")} aria-label="Volver" title="Volver">
            <FaArrowLeft className="glob-profesor-icon-button" /><p>Volver</p>
          </button>
          <span className="glob-profesor-title">
            Editar Mesa Nº {mesa.numero_mesa}{idGrupo ? ` — Grupo ${idGrupo}` : ""}
          </span>
        </div>

        <div className="glob-box-table" style={{ padding: 16 }}>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>{materiaTitle}</div>

          <h3 style={{ margin: "8px 0 12px 0" }}>Mesa</h3>
          <div className="glob-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label className="glob-form-field">
              <span className="glob-form-label"><FaCalendarAlt style={{ marginRight: 6 }} />Fecha de mesa</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="glob-search-input" />
            </label>
            <label className="glob-form-field">
              <span className="glob-form-label"><FaClock style={{ marginRight: 6 }} />Turno</span>
              <select className="glob-search-input" value={idTurno} onChange={(e) => setIdTurno(e.target.value)}>
                <option value="">Seleccionar…</option>
                {turnos.map((t) => (<option key={t.id_turno} value={t.id_turno}>{t.turno}</option>))}
              </select>
            </label>
          </div>

          <div className="glob-down-container" style={{ marginTop: 16 }}>
            <div />
            <div className="glob-botones-container">
              <button className="glob-profesor-button glob-hover-effect" onClick={onSave} disabled={guardando} title="Guardar cambios">
                <FaSave className="glob-profesor-icon-button" /><p>Guardar</p>
              </button>
              <button className="glob-profesor-button glob-hover-effect" onClick={() => setOpenDelete(true)}
                style={{ background: "var(--glob-danger,#c0392b)" }} title="Eliminar mesa (alumno)">
                <FaTrash className="glob-profesor-icon-button" /><p>Eliminar Mesa</p>
              </button>
            </div>
          </div>

          <h3 style={{ margin: "24px 0 12px 0" }}>Slots del grupo (hasta 4)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 12 }}>
            {slots.map((slot, idx) => {
              if (slot) {
                const docentes = Array.isArray(slot.docentes) ? slot.docentes : [];
                return (
                  <div key={`slot-ok-${slot.numero_mesa}`} style={{
                    border: "1px solid var(--glob-border,#ddd)", borderRadius: 12, padding: 12,
                    background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>N° {slot.numero_mesa}</div>
                    <div style={{ fontSize: 13, minHeight: 36 }} title={slot.materia}>{slot.materia || "—"}</div>
                    <div style={{ fontSize: 12, color: "#555", minHeight: 32 }}>
                      {docentes.length ? `Docentes: ${docentes.join(" | ")}` : "Docentes: —"}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                      {/* Botón CAMBIAR/MOVER */}
                      <button
                        className="glob-iconchip is-edit"
                        title="Mover este número a otro grupo (con lugar)"
                        onClick={() => { setNumeroParaMover(slot.numero_mesa); setOpenMover(true); }}
                      >
                        <FaExchangeAlt />
                      </button>
                      <button
                        className="glob-iconchip is-delete"
                        title="Quitar del grupo (no borra la mesa)"
                        onClick={() => quitarNumeroDelGrupo(slot.numero_mesa)}
                        disabled={!idGrupo}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                );
              }
              // Libre → abre modal de agregar
              return (
                <button key={`slot-free-${idx}`} onClick={() => setOpenAgregar(true)}
                  disabled={numerosGrupo.length >= 4} title="Agregar número al grupo" style={{
                    border: "1px dashed var(--glob-border,#bbb)", borderRadius: 12, padding: 12,
                    background: "#fafafa", minHeight: 120, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    fontWeight: 600, fontSize: 14,
                  }}>
                  <FaPlus /> Agregar número
                </button>
              );
            })}
          </div>
        </div>
      </div>

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

      {/* Modal agregar número */}
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

      {/* Modal mover número */}
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

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default EditarMesa;
