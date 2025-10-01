// src/components/Profesores/ProfesorBaja.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import {
  FaUserCheck,
  FaTrashAlt,
  FaCalendarAlt,
  FaArrowLeft,
  FaFileExcel,
} from "react-icons/fa";
import Toast from "../Global/Toast";
import "./ProfesorBaja.css";

/* ========= Endpoints ========= */
const API = {
  list: "profesores_baja",
  restore: "dar_alta_profesor",
  deleteOne: "eliminar_profesor", // ⬅ reutilizamos el mismo endpoint del módulo Profesores
};

/* ========= Utils ========= */
const TZ_CBA = "America/Argentina/Cordoba";
const hoyISO = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_CBA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD

const esFechaISO = (val) => /^\d{4}-\d{2}-\d{2}$/.test(val);

const normalizar = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const nombreApellido = (p = {}) =>
  `${(p.apellido || "").trim()} ${(p.nombre || "").trim()}`.trim();

const formatearFecha = (val) => {
  if (!val) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`; // SOLO para UI
  }
  const d = new Date(val.includes("T") ? val : `${val}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`; // SOLO para UI
};

// Para Excel: devolver YYYY-MM-DD siempre
const toISODate = (val) => {
  if (!val) return "";
  if (esFechaISO(val)) return val;
  const d = new Date(val.includes("T") ? val : `${val}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
};

const ProfesorBaja = () => {
  const [profesores, setProfesores] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState({ show: false, tipo: "", mensaje: "" });

  // Rol (para ocultar acciones si es "vista")
  const [isVista, setIsVista] = useState(false);
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      const role = (u?.rol || "").toString().toLowerCase();
      setIsVista(role === "vista");
    } catch {
      setIsVista(false);
    }
  }, []);

  // Alta
  const [profesorSeleccionado, setProfesorSeleccionado] = useState(null);
  const [mostrarConfirmacionAlta, setMostrarConfirmacionAlta] = useState(false);
  const [fechaAlta, setFechaAlta] = useState("");
  const fechaInputRef = useRef(null);

  // Eliminaciones
  const [mostrarConfirmacionEliminarUno, setMostrarConfirmacionEliminarUno] =
    useState(false);
  const [mostrarConfirmacionEliminarTodos, setMostrarConfirmacionEliminarTodos] =
    useState(false);
  const [profesorAEliminar, setProfesorAEliminar] = useState(null);

  const navigate = useNavigate();

  /* ============ Filtrado ============ */
  const profesoresFiltrados = useMemo(() => {
    if (!busqueda) return profesores;
    const q = normalizar(busqueda);
    return profesores.filter((p) => normalizar(nombreApellido(p)).includes(q));
  }, [profesores, busqueda]);

  /* ============ Carga inicial ============ */
  useEffect(() => {
    const obtenerProfesoresBaja = async () => {
      setCargando(true);
      try {
        const res = await fetch(
          `${BASE_URL}/api.php?action=${API.list}&ts=${Date.now()}`
        );
        const data = await res.json();
        if (data?.exito) {
          setProfesores(Array.isArray(data.profesores) ? data.profesores : []);
        } else {
          setProfesores(Array.isArray(data.data) ? data.data : []); // fallback por si devuelve 'data'
          if (!data?.exito) {
            setToast({
              show: true,
              tipo: "error",
              mensaje: data?.mensaje || "Error al cargar",
            });
          }
        }
      } catch {
        setToast({
          show: true,
          tipo: "error",
          mensaje: "Error de conexión al cargar profesores",
        });
      } finally {
        setCargando(false);
      }
    };
    obtenerProfesoresBaja();
  }, []);

  /* ============ UX: abrir datepicker ============ */
  const openDatePicker = (e) => {
    e.preventDefault();
    const el = fechaInputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.focus();
      try {
        el.click();
      } catch {}
    }
  };
  const handleKeyDownPicker = (e) => {
    if (e.key === "Enter" || e.key === " ") openDatePicker(e);
  };

  /* ============ Dar alta ============ */
  const darAltaProfesor = async (id_profesor) => {
    if (!esFechaISO(fechaAlta)) {
      setToast({
        show: true,
        tipo: "error",
        mensaje: "Fecha inválida. Usá AAAA-MM-DD.",
      });
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("id_profesor", String(id_profesor));
      params.set("fecha_ingreso", fechaAlta);

      const res = await fetch(
        `${BASE_URL}/api.php?action=${API.restore}&ts=${Date.now()}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: params.toString(),
        }
      );

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { exito: false, mensaje: text || "Respuesta no válida" };
      }

      if (res.ok && data.exito) {
        setProfesores((prev) => prev.filter((p) => p.id_profesor !== id_profesor));
        setMostrarConfirmacionAlta(false);
        setProfesorSeleccionado(null);
        setToast({
          show: true,
          tipo: "exito",
          mensaje: "Profesor dado de alta correctamente",
        });
      } else {
        setToast({
          show: true,
          tipo: "error",
          mensaje: data.mensaje || "No se pudo dar de alta",
        });
      }
    } catch {
      setToast({
        show: true,
        tipo: "error",
        mensaje: "Error de red al dar de alta",
      });
    }
  };

  /* ============ Eliminar uno (usa eliminar_profesor.php) ============ */
  const eliminarProfesorDefinitivo = async (id_profesor) => {
    try {
      const res = await fetch(
        `${BASE_URL}/api.php?action=${API.deleteOne}&ts=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_profesor }),
        }
      );
      const data = await res.json();
      if (res.ok && data?.exito) {
        setProfesores((prev) => prev.filter((p) => p.id_profesor !== id_profesor));
        setToast({
          show: true,
          tipo: "exito",
          mensaje: "Profesor eliminado definitivamente",
        });
      } else {
        setToast({
          show: true,
          tipo: "error",
          mensaje: data?.mensaje || "No se pudo eliminar",
        });
      }
    } catch {
      setToast({
        show: true,
        tipo: "error",
        mensaje: "Error de red al eliminar",
      });
    } finally {
      setMostrarConfirmacionEliminarUno(false);
      setProfesorAEliminar(null);
    }
  };

  /* ============ Eliminar visibles (múltiples POST al mismo endpoint) ============ */
  const eliminarTodosDefinitivo = async () => {
    const ids = profesoresFiltrados.map((p) => p.id_profesor);
    if (ids.length === 0) {
      setToast({
        show: true,
        tipo: "info",
        mensaje: "No hay registros para eliminar.",
      });
      setMostrarConfirmacionEliminarTodos(false);
      return;
    }
    try {
      const resultados = await Promise.allSettled(
        ids.map((id) =>
          fetch(`${BASE_URL}/api.php?action=${API.deleteOne}&ts=${Date.now()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_profesor: id }),
          }).then(async (r) => ({ ok: r.ok, data: await r.json(), id }))
        )
      );

      const okIds = [];
      const errores = [];
      resultados.forEach((r) => {
        if (r.status === "fulfilled" && r.value.ok && r.value.data?.exito) {
          okIds.push(r.value.id);
        } else {
          const msg =
            r.status === "fulfilled"
              ? (r.value.data?.mensaje || "Error desconocido")
              : r.reason?.message || "Error de red";
          errores.push(msg);
        }
      });

      if (okIds.length) {
        setProfesores((prev) => prev.filter((p) => !okIds.includes(p.id_profesor)));
      }

      if (errores.length === 0) {
        setToast({
          show: true,
          tipo: "exito",
          mensaje: `Se eliminaron definitivamente ${okIds.length} profesor(es).`,
        });
      } else if (okIds.length > 0) {
        setToast({
          show: true,
          tipo: "warning",
          mensaje: `Se eliminaron ${okIds.length} profesor(es). Algunos fallaron: ${errores[0]}`,
        });
      } else {
        setToast({
          show: true,
          tipo: "error",
          mensaje: `No se pudo eliminar. ${errores[0] || ""}`,
        });
      }
    } catch {
      setToast({
        show: true,
        tipo: "error",
        mensaje: "Error de red al eliminar",
      });
    } finally {
      setMostrarConfirmacionEliminarTodos(false);
    }
  };

  /* ============ Exportar visibles (.xlsx) ============ */
  const exportarVisiblesAExcel = async () => {
    if (!profesoresFiltrados.length) {
      setToast({
        show: true,
        tipo: "info",
        mensaje: "No hay registros para exportar.",
      });
      return;
    }
    try {
      const XLSX = await import("xlsx");

      const filas = profesoresFiltrados.map((p) => ({
        ID: p.id_profesor ?? "",
        "Apellido y Nombre": nombreApellido(p) || "",
        // Soporta ambos nombres de campo en backend: fecha_baja o ingreso
        "Fecha de Baja": toISODate(p.fecha_baja ?? p.ingreso ?? ""),
        Motivo: (p.motivo || "").toString().trim(),
      }));

      const ws = XLSX.utils.json_to_sheet(filas, {
        header: ["ID", "Apellido y Nombre", "Fecha de Baja", "Motivo"],
        skipHeader: false,
      });

      ws["!cols"] = [{ wch: 8 }, { wch: 32 }, { wch: 12 }, { wch: 40 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ProfesoresBaja");

      const nombre = `profesores_baja_${hoyISO()}.xlsx`;
      XLSX.writeFile(wb, nombre);
    } catch (e) {
      console.error(e);
      setToast({
        show: true,
        tipo: "error",
        mensaje:
          "No se pudo generar el Excel. Verificá que 'xlsx' esté instalado.",
      });
    }
  };

  /* ============ Cerrar toast ============ */
  const closeToast = () => setToast((s) => ({ ...s, show: false }));

  /* ============ ESC para cerrar modales ============ */
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") {
        if (mostrarConfirmacionAlta) {
          setMostrarConfirmacionAlta(false);
          setProfesorSeleccionado(null);
        }
        if (mostrarConfirmacionEliminarUno) {
          setMostrarConfirmacionEliminarUno(false);
          setProfesorAEliminar(null);
        }
        if (mostrarConfirmacionEliminarTodos) {
          setMostrarConfirmacionEliminarTodos(false);
        }
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [
    mostrarConfirmacionAlta,
    mostrarConfirmacionEliminarUno,
    mostrarConfirmacionEliminarTodos,
  ]);

  return (
    <div className="emp-baja-container">
      {/* Franja superior con botón Volver (derecha) */}
      <div className="emp-baja-glass">
        <div className="emp-baja-barra-superior">
          <div className="emp-baja-titulo-container">
            <h2 className="emp-baja-titulo">Profesores Dados de Baja</h2>
          </div>

          <button
            className="emp-baja-nav-btn emp-baja-nav-btn--volver-top"
            onClick={() => navigate("/profesores")}
            title="Volver"
            type="button"
          >
            <FaArrowLeft className="ico" />
            <span>Volver</span>
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="emp-baja-buscador-container">
        <input
          type="text"
          className="emp-baja-buscador"
          placeholder="Buscar por apellido o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div className="emp-baja-buscador-icono" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>

      {/* Toast */}
      {toast.show && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          onClose={closeToast}
          duracion={3000}
        />
      )}

      {/* Tabla / Lista */}
      {cargando ? (
        <p className="emp-baja-cargando">Cargando profesores dados de baja...</p>
      ) : (
        <div className="emp-baja-tabla-container">
          <div className="emp-baja-controles-superiores">
            <div className="emp-baja-contador">
              Mostrando <strong>{profesoresFiltrados.length}</strong> profesores
            </div>

            {/* Acciones derecha: Exportar + Eliminar todos */}
            <div className="emp-baja-acciones-derecha">
              <button
                className="emp-baja-exportar"
                title="Exportar lo visible a Excel (.xlsx)"
                onClick={exportarVisiblesAExcel}
                disabled={profesoresFiltrados.length === 0}
                type="button"
              >
                <FaFileExcel className="ico" />
                <span className="txt">Exportar Excel</span>
              </button>

              {!isVista && (
                <button
                  className="emp-baja-eliminar-todos"
                  title="Eliminar definitivamente todos los profesores visibles"
                  onClick={() => setMostrarConfirmacionEliminarTodos(true)}
                  disabled={profesoresFiltrados.length === 0}
                  type="button"
                >
                  <FaTrashAlt className="ico" />
                  <span className="txt">Eliminar todos</span>
                </button>
              )}
            </div>
          </div>

          <div className="emp-baja-tabla-header-container">
            <div className="emp-baja-tabla-header">
              <div className="emp-baja-col-id">ID</div>
              <div className="emp-baja-col-nombre">Apellido y Nombre</div>
              <div className="emp-baja-col-fecha">Fecha de Baja</div>
              <div className="emp-baja-col-motivo">Motivo</div>
              <div className="emp-baja-col-acciones">Acciones</div>
            </div>
          </div>

          <div className="emp-baja-tabla-body">
            {profesoresFiltrados.length === 0 ? (
              <div className="emp-baja-sin-resultados emp-baja-sin-resultados--fill">
                <FaUserCheck className="emp-baja-sin-icono" />
                No hay profesores dados de baja
              </div>
            ) : (
              profesoresFiltrados.map((p) => (
                <div className="emp-baja-fila" key={p.id_profesor}>
                  <div className="emp-baja-col-id">{p.id_profesor}</div>
                  <div className="emp-baja-col-nombre">
                    {nombreApellido(p) || "—"}
                  </div>
                  <div className="emp-baja-col-fecha">
                    {formatearFecha(p.fecha_baja ?? p.ingreso)}
                  </div>
                  <div className="emp-baja-col-motivo">
                    {(p.motivo || "").trim() || "—"}
                  </div>
                  <div className="emp-baja-col-acciones">
                    <div className="emp-baja-iconos">
                      {!isVista && (
                        <>
                          <FaUserCheck
                            title="Dar de alta"
                            className="emp-baja-icono"
                            onClick={() => {
                              setProfesorSeleccionado(p);
                              setFechaAlta(hoyISO());
                              setMostrarConfirmacionAlta(true);
                            }}
                          />
                          <FaTrashAlt
                            title="Eliminar definitivamente"
                            className="emp-baja-icono emp-baja-icono-danger"
                            onClick={() => {
                              setProfesorAEliminar(p);
                              setMostrarConfirmacionEliminarUno(true);
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal DAR ALTA */}
      {!isVista && mostrarConfirmacionAlta && profesorSeleccionado && (
        <div
          className="emp-baja-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-alta-profesor-title"
        >
          <div className="emp-baja-modal emp-baja-modal--success">
            <div className="emp-baja-modal__icon" aria-hidden="true">
              <FaUserCheck />
            </div>
            <h3
              id="modal-alta-profesor-title"
              className="emp-baja-modal__title emp-baja-modal__title--success"
            >
              Reactivar profesor
            </h3>
            <p className="emp-baja-modal__body">
              ¿Deseás dar de alta nuevamente a{" "}
              <strong>{nombreApellido(profesorSeleccionado)}</strong>?
            </p>

            <div className="soc-campo-fecha-alta">
              <label htmlFor="fecha_alta_profesor" className="soc-label-fecha-alta">
                Fecha de alta
              </label>
              <div
                className="soc-input-fecha-container"
                role="button"
                tabIndex={0}
                onMouseDown={openDatePicker}
                onKeyDown={handleKeyDownPicker}
                aria-label="Abrir selector de fecha"
              >
                <input
                  id="fecha_alta_profesor"
                  ref={fechaInputRef}
                  type="date"
                  className="soc-input-fecha-alta"
                  value={fechaAlta}
                  onChange={(e) => setFechaAlta(e.target.value)}
                />
                <FaCalendarAlt className="soc-icono-calendario" />
              </div>
            </div>

            <div className="emp-baja-modal__actions">
              <button
                className="emp-baja-btn emp-baja-btn--ghost"
                onClick={() => {
                  setMostrarConfirmacionAlta(false);
                  setProfesorSeleccionado(null);
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="emp-baja-btn emp-baja-btn--solid-success"
                onClick={() => darAltaProfesor(profesorSeleccionado.id_profesor)}
                type="button"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ELIMINAR UNO */}
      {!isVista && mostrarConfirmacionEliminarUno && profesorAEliminar && (
        <div
          className="emp-baja-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-eliminar-profesor-title"
        >
          <div className="emp-baja-modal emp-baja-modal--danger">
            <div
              className="emp-baja-modal__icon emp-baja-modal__icon--danger"
              aria-hidden="true"
            >
              <FaTrashAlt />
            </div>
            <h3
              id="modal-eliminar-profesor-title"
              className="emp-baja-modal__title emp-baja-modal__title--danger"
            >
              Eliminar permanentemente
            </h3>
            <p className="emp-baja-modal__body">
              ¿Eliminar definitivamente al profesor{" "}
              <strong>{nombreApellido(profesorAEliminar)}</strong>? Esta acción
              no se puede deshacer.
            </p>
            <div className="emp-baja-modal__actions">
              <button
                className="emp-baja-btn emp-baja-btn--ghost"
                onClick={() => {
                  setMostrarConfirmacionEliminarUno(false);
                  setProfesorAEliminar(null);
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="emp-baja-btn emp-baja-btn--solid-danger"
                onClick={() =>
                  eliminarProfesorDefinitivo(profesorAEliminar.id_profesor)
                }
                type="button"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ELIMINAR TODOS */}
      {!isVista && mostrarConfirmacionEliminarTodos && (
        <div
          className="emp-baja-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-eliminar-todos-prof-title"
        >
          <div className="emp-baja-modal emp-baja-modal--danger">
            <div
              className="emp-baja-modal__icon emp-baja-modal__icon--danger"
              aria-hidden="true"
            >
              <FaTrashAlt />
            </div>
            <h3
              id="modal-eliminar-todos-prof-title"
              className="emp-baja-modal__title emp-baja-modal__title--danger"
            >
              Eliminar permanentemente
            </h3>
            <p className="emp-baja-modal__body">
              ¿Eliminar definitivamente <strong>todos</strong> los profesores
              actualmente visibles? Esta acción no se puede deshacer.
            </p>
            <div className="emp-baja-modal__actions">
              <button
                className="emp-baja-btn emp-baja-btn--ghost"
                onClick={() => setMostrarConfirmacionEliminarTodos(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="emp-baja-btn emp-baja-btn--solid-danger"
                onClick={eliminarTodosDefinitivo}
                type="button"
              >
                Sí, eliminar todos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfesorBaja;
