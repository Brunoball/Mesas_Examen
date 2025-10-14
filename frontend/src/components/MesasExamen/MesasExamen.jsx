// src/components/MesasExamen/MesasExamen.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  FaInfoCircle,
  FaEdit,
  FaTrash,
  FaArrowLeft,
  FaUserPlus,
  FaFileExcel,
  FaSearch,
  FaTimes,
  FaUsers,
  FaFilter,
  FaChevronDown,
  FaCalendarAlt,
  FaClock,
  FaEraser,
  FaFilePdf,
  FaLayerGroup,
  FaUnlink,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import BASE_URL from "../../config/config";
import "../Global/section-ui.css";

import Toast from "../Global/Toast";
import FullScreenLoader from "../Global/FullScreenLoader";

import ModalCrearMesas from "./modales/ModalCrearMesas";
import ModalEliminarMesas from "./modales/ModalEliminarMesas";
import ModalInfoMesas from "./modales/ModalInfoMesas";
import ModalEliminarMesa from "./modales/ModalEliminarMesa";

import { generarPDFMesas } from "./modales/GenerarPDF";

/* ================================
   Utils
================================ */
const normalizar = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const formatearFechaISO = (v) => {
  if (!v || typeof v !== "string") return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const MAX_CASCADE_ITEMS = 15;

/** Debounce hook */
function useDebounce(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ================================
   Componente Mesas de Examen
================================ */
const MesasExamen = () => {
  const navigate = useNavigate();

  // Pestañas
  const [vista, setVista] = useState("grupos"); // "grupos" | "no-agrupadas"

  // Datos
  const [grupos, setGrupos] = useState([]);
  const [gruposDB, setGruposDB] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [noAgrupadas, setNoAgrupadas] = useState([]);
  const [noAgrupadasDB, setNoAgrupadasDB] = useState([]);
  const [cargandoNo, setCargandoNo] = useState(false);

  // Loader global durante creación + armado
  const [creandoMesas, setCreandoMesas] = useState(false);

  // listas básicas (para filtros / combos)
  const [listas, setListas] = useState({ cursos: [], divisiones: [], turnos: [] });

  // filtros y UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosRef = useRef(null);

  const [q, setQ] = useState("");
  const qDebounced = useDebounce(q, 220);

  // Filtros seleccionados
  const [fechaSel, setFechaSel] = useState("");
  const [turnoSel, setTurnoSel] = useState("");

  // Estado de acordeones (cerrados por defecto)
  const [openFecha, setOpenFecha] = useState(false);
  const [openTurno, setOpenTurno] = useState(false);

  // animación
  const [animacionActiva, setAnimacionActiva] = useState(false);
  const [preCascada, setPreCascada] = useState(false);

  // modales (lote e info)
  const [abrirCrear, setAbrirCrear] = useState(false);
  const [abrirEliminar, setAbrirEliminar] = useState(false);
  const [abrirInfo, setAbrirInfo] = useState(false);

  // selección para info
  const [grupoSel, setGrupoSel] = useState(null);

  // modal eliminar individual
  const [abrirEliminarUno, setAbrirEliminarUno] = useState(false);
  const [mesaAEliminar, setMesaAEliminar] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);
  const notify = useCallback(
    ({ tipo = "info", mensaje = "", duracion = 3000 }) =>
      setToast({ tipo, mensaje, duracion }),
    []
  );

  // ======= Carga de listas =======
  const fetchListas = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=obtener_listas`, {
        cache: "no-store",
      });
      const json = await resp.json();
      if (json?.exito) {
        setListas({
          cursos: json.listas?.cursos || [],
          divisiones: json.listas?.divisiones || [],
          turnos: json.listas?.turnos || [],
        });
      }
    } catch {
      /* noop */
    }
  }, []);

  // ======= Carga de grupos =======
  const fetchGrupos = useCallback(async () => {
    setCargando(true);
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_listar_grupos`, {
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json?.exito) throw new Error(json?.mensaje || "Error al listar grupos.");

      const data = Array.isArray(json.data) ? json.data : [];

      const procesadas = data.map((g) => {
        const tribunalStr = Array.isArray(g.tribunal)
          ? g.tribunal.filter(Boolean).join(" | ")
          : g.tribunal || "";

        return {
          id: g.id_grupo,
          id_grupo: g.id_grupo,
          numero_mesa_1: g.numero_mesa_1,
          numero_mesa_2: g.numero_mesa_2,
          numero_mesa_3: g.numero_mesa_3,
          numero_mesa_4: g.numero_mesa_4 ?? null,
          id_materia: g.id_materia ?? null,
          materia: g.materia ?? "",
          fecha: g.fecha ?? "",
          id_turno: g.id_turno ?? null,
          turno: g.turno ?? "",
          profesor: tribunalStr,
          _materia: normalizar(g.materia ?? ""),
          _turno: normalizar(g.turno ?? ""),
        };
      });

      setGrupos(procesadas);
      setGruposDB(procesadas);
    } catch {
      setGrupos([]);
      setGruposDB([]);
    } finally {
      setCargando(false);
    }
  }, []);

  // ======= Carga de “no agrupadas” =======
  const fetchNoAgrupadas = useCallback(async () => {
    setCargandoNo(true);
    try {
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesas_listar_no_agrupadas`,
        { cache: "no-store" }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json?.exito) throw new Error(json?.mensaje || "Error al listar no agrupadas.");

      const data = Array.isArray(json.data) ? json.data : [];

      const procesadas = data.map((r) => ({
        id: r.id,
        id_grupo: null,
        numero_mesa_1: r.numero_mesa,
        numero_mesa_2: null,
        numero_mesa_3: null,
        numero_mesa_4: null,
        id_materia: r.id_materia ?? null,
        materia: r.materia ?? "",
        fecha: r.fecha ?? "",
        id_turno: r.id_turno ?? null,
        turno: r.turno ?? "",
        profesor: r.tribunal || "",
        _materia: normalizar(r.materia ?? ""),
        _turno: normalizar(r.turno ?? ""),
        _esNoAgrupada: true,
      }));

      setNoAgrupadas(procesadas);
      setNoAgrupadasDB(procesadas);
    } catch {
      setNoAgrupadas([]);
      setNoAgrupadasDB([]);
    } finally {
      setCargandoNo(false);
    }
  }, []);

  useEffect(() => {
    fetchListas();
    fetchGrupos();
    fetchNoAgrupadas();
  }, [fetchListas, fetchGrupos, fetchNoAgrupadas]);

  // Turnos únicos
  const turnosUnicos = useMemo(() => {
    if (listas.turnos?.length) {
      return listas.turnos
        .map((t) => String(t.nombre ?? t.turno ?? "").trim())
        .filter(Boolean);
    }
    const dataset = vista === "grupos" ? gruposDB : noAgrupadasDB;
    const s = new Set((dataset || []).map((m) => m.turno).filter(Boolean));
    return Array.from(s).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [gruposDB, noAgrupadasDB, listas.turnos, vista]);

  // Fechas únicas (ISO)
  const fechasUnicas = useMemo(() => {
    const dataset = vista === "grupos" ? gruposDB : noAgrupadasDB;
    const set = new Set((dataset || []).map((m) => m.fecha).filter(Boolean));
    return Array.from(set).sort(); // ISO yyyy-mm-dd ordena bien
  }, [gruposDB, noAgrupadasDB, vista]);

  // Dataset base según pestaña
  const datasetBase = vista === "grupos" ? grupos : noAgrupadas;
  const datasetBaseDB = vista === "grupos" ? gruposDB : noAgrupadasDB;
  const cargandoVista = vista === "grupos" ? cargando : cargandoNo;

  // Filtrado — usa qDebounced (sin renders múltiples)
  const filasFiltradas = useMemo(() => {
    let res = datasetBase;

    if (qDebounced?.trim()) {
      const nq = normalizar(qDebounced);
      res = res.filter(
        (m) =>
          m._materia.includes(nq) ||
          m._turno.includes(nq) ||
          (m.fecha || "").includes(nq) ||
          String(m.id_grupo ?? "").includes(nq) ||
          String(m.numero_mesa_1 ?? "").includes(nq) ||
          String(m.numero_mesa_2 ?? "").includes(nq) ||
          String(m.numero_mesa_3 ?? "").includes(nq) ||
          String(m.numero_mesa_4 ?? "").includes(nq)
      );
    }

    if (fechaSel) {
      res = res.filter((m) => (m.fecha || "") === fechaSel);
    }

    if (turnoSel) {
      const nt = normalizar(turnoSel);
      res = res.filter((m) => m._turno === nt);
    }

    return res;
  }, [datasetBase, qDebounced, fechaSel, turnoSel]);

  // Animación en cascada
  useEffect(() => {
    setPreCascada(true);
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setAnimacionActiva(true);
        setPreCascada(false);
        const ms = 400 + (MAX_CASCADE_ITEMS - 1) * 30 + 300;
        const t = setTimeout(() => setAnimacionActiva(false), ms);
        return () => clearTimeout(t);
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [qDebounced, fechaSel, turnoSel, vista]);

  // Click fuera para cerrar filtros
  useEffect(() => {
    const h = (e) => {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target)) {
        setMostrarFiltros(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Exportar visible (Excel) — general
  const exportarExcel = useCallback(() => {
    if (!filasFiltradas.length) return;

    const filas = filasFiltradas.map((m) => ({
      [vista === "grupos" ? "ID Grupo" : "ID NoAgrupada"]: m.id_grupo ?? m.id,
      Mesas:
        [m.numero_mesa_1, m.numero_mesa_2, m.numero_mesa_3, m.numero_mesa_4]
          .filter(Boolean)
          .join(" • ") || "",
      Materia: m.materia || "",
      Fecha: formatearFechaISO(m.fecha),
      Turno: m.turno || "",
      "Tribunal (único)": m.profesor || "",
    }));

    const headers = [
      vista === "grupos" ? "ID Grupo" : "ID NoAgrupada",
      "Mesas",
      "Materia",
      "Fecha",
      "Turno",
      "Tribunal (único)",
    ];

    const ws = XLSX.utils.json_to_sheet(filas, { header: headers });
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 26 }, { wch: 12 }, { wch: 10 }, { wch: 36 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      vista === "grupos" ? "Grupos" : "NoAgrupadas"
    );

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/octet-stream" });

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const nombre =
      vista === "grupos"
        ? `MesasDeExamen_Grupos_${yyyy}-${mm}-${dd}(${filas.length}).xlsx`
        : `MesasDeExamen_NoAgrupadas_${yyyy}-${mm}-${dd}(${filas.length}).xlsx`;
    saveAs(blob, nombre);
  }, [filasFiltradas, vista]);

  // ===== Exportar PDF SOLO del registro (fila actual) =====
  const exportarPDFDeRegistro = useCallback(
    (g) => {
      if (!g) return;

      const logoPath = `${window.location.origin}/img/Escudo.png`;

      if (vista === "grupos" && g.id_grupo != null) {
        // Una sola hoja por la fila (agrupación de sus números)
        const agrupaciones = [[
          g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4,
        ].filter((n) => n != null).map(Number)];

        generarPDFMesas({
          mesasFiltradas: [],      // no hace falta en este caso
          agrupaciones,            // fuerza una página por esta fila
          id_grupo: g.id_grupo,    // el backend resuelve los números del grupo
          baseUrl: BASE_URL,
          notify,
          logoPath,
        });
        return;
      }

      // No agrupada: una sola agrupación con su número
      const nums = [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
        .filter((n) => n != null).map(Number);
      const agrupaciones = [nums.length ? nums : []];

      generarPDFMesas({
        mesasFiltradas: nums.map((n) => ({ numero_mesa: n })),
        agrupaciones,
        baseUrl: BASE_URL,
        notify,
        logoPath,
      });
    },
    [vista, notify]
  );

  // Fila virtualizada (SIN columna de ID)
  const Row = React.memo(({ index, style, data }) => {
    const {
      rows,
      animacionActiva,
      preCascada,
      onInfo,
      onDeleteMesa,
      vista,
      navigate,
    } = data;
    const g = rows[index];
    const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
    const preMask = preCascada && index < MAX_CASCADE_ITEMS;

    const mesasStr =
      [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
        .filter(Boolean)
        .join(" • ");

    const accionesHabilitadas = vista === "grupos";

    return (
      <div
        style={{
          ...style,
          animationDelay: willAnimate ? `${index * 0.03}s` : "0s",
          opacity: preMask ? 0 : undefined,
          transform: preMask ? "translateY(8px)" : undefined,
        }}
        className={`glob-row ${index % 2 === 0 ? "glob-even-row" : "glob-odd-row"} ${
          willAnimate ? "glob-cascade" : ""
        }`}
      >
        {/* (Eliminada la columna de ID) */}
        <div className="glob-column glob-column-nombre" title={g.materia}>
          {g.materia}
        </div>
        <div className="glob-column">{mesasStr}</div>
        <div className="glob-column">{formatearFechaISO(g.fecha)}</div>
        <div className="glob-column">{g.turno}</div>
        <div className="glob-column">{g.profesor}</div>

        <div className="glob-column glob-icons-column">
          <div className="glob-icons-container">
            <button
              className="glob-iconchip is-info"
              title={vista === "grupos" ? "Información del grupo" : "Información"}
              onClick={() => onInfo?.(g)}
              aria-label="Información"
            >
              <FaInfoCircle />
            </button>

            {accionesHabilitadas && (
              <>
                <button
                  className="glob-iconchip is-edit"
                  title="Editar (primera mesa del grupo)"
                  onClick={() => {
                    const nm =
                      g.numero_mesa_1 ?? g.numero_mesa_2 ?? g.numero_mesa_3 ?? g.numero_mesa_4;
                    if (nm) navigate(`/mesas/editar/${nm}`);
                  }}
                  aria-label="Editar"
                >
                  <FaEdit />
                </button>

                <button
                  className="glob-iconchip is-delete"
                  title="Eliminar una mesa del grupo"
                  onClick={() => {
                    const nm =
                      g.numero_mesa_1 ?? g.numero_mesa_2 ?? g.numero_mesa_3 ?? g.numero_mesa_4;
                    if (nm) onDeleteMesa?.({ numero_mesa: nm, grupo: g });
                  }}
                  aria-label="Eliminar"
                >
                  <FaTrash />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  });
  Row.displayName = "Row";

  const hayResultados = filasFiltradas.length > 0;

  return (
    <div className="glob-profesor-container">
      {/* Loader global con el escudo */}
      <FullScreenLoader visible={creandoMesas} title="Procesando…" />

      <div className="glob-profesor-box">
        {/* Header */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Mesas de Examen</span>

          {/* Buscador */}
          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder={
                vista === "grupos"
                  ? "Buscar por materia, turno, fecha o número de mesa"
                  : "Buscar por materia, turno, fecha o número de mesa"
              }
              className="glob-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={cargandoVista}
            />
            {q ? (
              <FaTimes
                className="glob-clear-search-icon"
                onClick={() => setQ("")}
              />
            ) : null}
            <button
              className="glob-search-button"
              type="button"
              title="Buscar"
            >
              <FaSearch className="glob-search-icon" />
            </button>
          </div>

          {/* Panel de filtros */}
          <div className="glob-filtros-container" ref={filtrosRef}>
            <button
              className="glob-filtros-button"
              onClick={() => {
                setMostrarFiltros((prev) => {
                  const next = !prev;
                  if (next) {
                    // al abrir el panel, los acordeones arrancan cerrados
                    setOpenFecha(false);
                    setOpenTurno(false);
                  }
                  return next;
                });
              }}
              disabled={cargandoVista}
            >
              <FaFilter className="glob-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown
                className={`glob-chevron-icon ${mostrarFiltros ? "glob-rotate" : ""}`}
              />
            </button>

            {mostrarFiltros && (
              <div className="glob-filtros-menu" role="menu">
                {/* FECHA */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${openFecha ? "is-open" : ""}`}
                    aria-expanded={openFecha}
                    onClick={() => setOpenFecha((v) => !v)}
                  >
                    <span className="glob-filtros-group-title">
                      <FaCalendarAlt style={{ marginRight: 8 }} /> Filtrar por fecha
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className={`glob-filtros-group-body ${openFecha ? "is-open" : "is-collapsed"}`}>
                    <div className="glob-grid-filtros">
                      {fechasUnicas.map((f) => (
                        <button
                          key={`fecha-${f}`}
                          className={`glob-chip-filtro ${fechaSel === f ? "glob-active" : ""}`}
                          onClick={() => {
                            setFechaSel(fechaSel === f ? "" : f);
                            setMostrarFiltros(false);
                          }}
                          title={`Filtrar por ${formatearFechaISO(f)}`}
                        >
                          {formatearFechaISO(f)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* TURNO */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${openTurno ? "is-open" : ""}`}
                    aria-expanded={openTurno}
                    onClick={() => setOpenTurno((v) => !v)}
                  >
                    <span className="glob-filtros-group-title">
                      <FaClock style={{ marginRight: 8 }} /> Filtrar por turno
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className={`glob-filtros-group-body ${openTurno ? "is-open" : "is-collapsed"}`}>
                    <div className="glob-grid-filtros">
                      {turnosUnicos.map((t) => (
                        <button
                          key={`turno-${t}`}
                          className={`glob-chip-filtro ${turnoSel === t ? "glob-active" : ""}`}
                          onClick={() => {
                            setTurnoSel(turnoSel === t ? "" : t);
                            setMostrarFiltros(false);
                          }}
                          title={`Filtrar por ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mostrar todos */}
                <div
                  className="glob-filtros-menu-item glob-mostrar-todas"
                  onClick={() => {
                    setQ("");
                    setFechaSel("");
                    setTurnoSel("");
                    setMostrarFiltros(false);
                  }}
                  role="menuitem"
                >
                  <span>Mostrar Todos</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contador + Tabs + Chips */}
        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            <div className="glob-left-inline">
              {/* CONTADOR */}
              <div className="contador-grups-noencontrado">
                <div className="glob-contador-container">
                  <span className="glob-profesores-desktop">
                    {vista === "grupos" ? "Grupos: " : "No agrupadas: "}
                    {filasFiltradas.length}
                  </span>
                  <span className="glob-profesores-mobile">{filasFiltradas.length}</span>
                  <FaUsers className="glob-icono-profesor" />
                </div>

                {/* TABS */}
                <div className="glob-tabs glob-tabs--inline" role="tablist" aria-label="Cambiar vista">
                  <button
                    className={`glob-tab ${vista === "grupos" ? "glob-tab--active" : ""}`}
                    onClick={() => setVista("grupos")}
                    title="Ver grupos armados"
                    aria-pressed={vista === "grupos"}
                    role="tab"
                  >
                    <FaLayerGroup style={{ marginRight: 6 }} />
                    Grupos
                  </button>
                  <button
                    className={`glob-tab ${vista === "no-agrupadas" ? "glob-tab--active" : ""}`}
                    onClick={() => setVista("no-agrupadas")}
                    title="Ver mesas no agrupadas"
                    aria-pressed={vista === "no-agrupadas"}
                    role="tab"
                  >
                    <FaUnlink style={{ marginRight: 6 }} />
                    No agrupadas
                  </button>
                </div>
              </div>

              {/* CHIPS (si hay filtros activos) */}
              {(q || fechaSel || turnoSel) && (
                <div className="glob-chips-container">
                  {q && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">
                        Búsqueda: {q}
                      </span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">
                        {q.length > 6 ? `${q.substring(0, 6)}…` : q}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => setQ("")}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {fechaSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">
                        Fecha: {formatearFechaISO(fechaSel)}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => setFechaSel("")}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {turnoSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">Turno: {turnoSel}</span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => setTurnoSel("")}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <button
                    className="glob-chip-mini glob-chip-clear-all"
                    onClick={() => {
                      setQ("");
                      setFechaSel("");
                      setTurnoSel("");
                    }}
                    title="Quitar todos los filtros"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          </div>

            {/* TABLA */}
          <div className="glob-box-table">
            <div className="glob-header glob-header-mesas">
              {/* (Eliminado el header de ID) */}
              <div className="glob-column-header">Materia</div>
              <div className="glob-column-header">Mesas</div>
              <div className="glob-column-header">Fecha</div>
              <div className="glob-column-header">Turno</div>
              <div className="glob-column-header">Tribunal </div>
              <div className="glob-column-header">Acciones</div>
            </div>

            <div className="glob-body">
              {cargandoVista ? (
                <div className="glob-loading-spinner-container">
                  <div className="glob-loading-spinner" />
                </div>
              ) : datasetBaseDB.length === 0 ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content">
                    <p>
                      {vista === "grupos"
                        ? "No hay grupos registrados"
                        : "No hay mesas no agrupadas registradas"}
                    </p>
                  </div>
                </div>
              ) : !hayResultados ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content">
                    <p>No hay resultados con los filtros actuales</p>
                  </div>
                </div>
              ) : (
                <div style={{ height: "55vh", width: "100%" }}>
                  <AutoSizer>
                    {({ height, width }) => (
                      <List
                        height={height}
                        width={width}
                        itemCount={filasFiltradas.length}
                        itemSize={48}
                        itemData={{
                          rows: filasFiltradas,
                          animacionActiva,
                          preCascada,
                          onInfo: (g) => {
                            setGrupoSel(g);
                            setAbrirInfo(true);
                          },
                          onDeleteMesa: (m) => {
                            setMesaAEliminar({ numero_mesa: m.numero_mesa, grupo: m.grupo });
                            setAbrirEliminarUno(true);
                          },
                          vista,
                          navigate,
                        }}
                        overscanCount={10}
                        itemKey={(index, data) => {
                          const r = data.rows[index];
                          return `${vista}-${r.id ?? r.id_grupo}-${r.fecha || "sinf"}-${
                            r.id_turno || 0
                          }`;
                        }}
                      >
                        {Row}
                      </List>
                    )}
                  </AutoSizer>
                </div>
              )}
            </div>
          </div>

          {/* CARDS (mobile) */}
          <div
            className={`glob-cards-wrapper ${
              animacionActiva && filasFiltradas.length <= MAX_CASCADE_ITEMS
                ? "glob-cascade-animation"
                : ""
            }`}
          >
            {cargandoVista ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content">
                  <p>Cargando {vista === "grupos" ? "grupos" : "no agrupadas"}…</p>
                </div>
              </div>
            ) : datasetBaseDB.length === 0 ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content">
                  <p>
                    {vista === "grupos"
                      ? "No hay grupos registrados"
                      : "No hay mesas no agrupadas registradas"}
                  </p>
                </div>
              </div>
            ) : !filasFiltradas.length ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content">
                  <p>No hay resultados con los filtros actuales</p>
                </div>
              </div>
            ) : (
              filasFiltradas.map((g, i) => {
                const willAnimate = animacionActiva && i < MAX_CASCADE_ITEMS;
                const preMask = preCascada && i < MAX_CASCADE_ITEMS;
                const key = `card-${vista}-${g.id ?? g.id_grupo}-${g.fecha || "sinf"}-${
                  g.id_turno || 0
                }`;

                const mesasStr =
                  [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
                    .filter(Boolean)
                    .join(" • ");

                return (
                  <div
                    key={key}
                    className={`glob-card ${willAnimate ? "glob-cascade" : ""}`}
                    style={{
                      animationDelay: willAnimate ? `${i * 0.03}s` : "0s",
                      opacity: preMask ? 0 : undefined,
                      transform: preMask ? "translateY(8px)" : undefined,
                    }}
                  >
                    <div className="glob-card-header">
                      <h3 className="glob-card-title">{g.materia || "—"}</h3>
                    </div>
                    <div className="glob-card-body">
                      {/* (Eliminada la fila de ID) */}
                      <div className="glob-card-row">
                        <span className="glob-card-label">Mesas</span>
                        <span className="glob-card-value">{mesasStr}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">
                          <FaCalendarAlt style={{ marginRight: 6 }} />
                          Fecha
                        </span>
                        <span className="glob-card-value">
                          {formatearFechaISO(g.fecha)}
                        </span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">
                          <FaClock style={{ marginRight: 6 }} />
                          Turno
                        </span>
                        <span className="glob-card-value">{g.turno}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">Tribunal</span>
                        <span className="glob-card-value">{g.profesor}</span>
                      </div>
                    </div>

                    <div className="glob-card-actions">
                      <button
                        className="glob-action-btn glob-iconchip is-info"
                        title="Información"
                        onClick={() => {
                          setGrupoSel(g);
                          setAbrirInfo(true);
                        }}
                        aria-label="Información"
                      >
                        <FaInfoCircle />
                      </button>

                      {/* Exportar PDF de este registro (móvil) */}
                      <button
                        className="glob-action-btn glob-iconchip"
                        title="Exportar este registro a PDF"
                        onClick={() => exportarPDFDeRegistro(g)}
                        aria-label="Exportar PDF (solo este)"
                      >
                        <FaFilePdf />
                      </button>

                      {vista === "grupos" && (
                        <>
                          <button
                            className="glob-action-btn glob-iconchip is-edit"
                            title="Editar (primera mesa del grupo)"
                            onClick={() => {
                              const nm =
                                g.numero_mesa_1 ??
                                g.numero_mesa_2 ??
                                g.numero_mesa_3 ??
                                g.numero_mesa_4;
                              if (nm) navigate(`/mesas/editar/${nm}`);
                            }}
                            aria-label="Editar"
                          >
                            <FaEdit />
                          </button>
                          <button
                            className="glob-action-btn glob-iconchip is-delete"
                            title="Eliminar una mesa (elegida)"
                            onClick={() => {
                              const nm =
                                g.numero_mesa_1 ??
                                g.numero_mesa_2 ??
                                g.numero_mesa_3 ??
                                g.numero_mesa_4;
                              if (nm) {
                                setMesaAEliminar({ numero_mesa: nm, grupo: g });
                                setAbrirEliminarUno(true);
                              }
                            }}
                            aria-label="Eliminar"
                          >
                            <FaTrash />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* BOTONERA INFERIOR */}
        <div className="glob-down-container">
          <button
            className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => navigate("/panel")}
            aria-label="Volver"
            title="Volver"
          >
            <FaArrowLeft className="glob-profesor-icon-button" />
            <p>Volver Atrás</p>
          </button>

          <div className="glob-botones-container">
            {/* Crear + armar grupos solo corresponde a la vista “grupos” */}
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirCrear(true)}
              aria-label="Crear"
              title="Crear mesas (confirmar)"
              disabled={vista !== "grupos"}
            >
              <FaUserPlus className="glob-profesor-icon-button" />
              <p>Crear Mesas</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={exportarExcel}
              disabled={!filasFiltradas.length}
              aria-label="Exportar"
              title={
                filasFiltradas.length
                  ? "Exportar a Excel"
                  : "No hay filas visibles para exportar"
              }
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar Excel</p>
            </button>

            {/* PDF general (TODAS las visibles): una hoja por fila */}
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => {
                if (!filasFiltradas.length) return;

                // Agrupación por FILA (mesa de examen en sí)
                const agrupaciones = filasFiltradas.map((g) =>
                  [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
                    .filter((n) => n != null)
                    .map(Number)
                );

                // Unión de todos los números para pedir el detalle en una sola llamada
                const setNums = new Set();
                for (const arr of agrupaciones) for (const n of arr) setNums.add(n);
                const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);

                generarPDFMesas({
                  mesasFiltradas: numerosOrdenados.map((n) => ({ numero_mesa: n })),
                  agrupaciones, // fuerza una página por cada fila/mesa
                  baseUrl: BASE_URL,
                  notify,
                  logoPath: `${window.location.origin}/img/Escudo.png`,
                });
              }}
              disabled={!filasFiltradas.length}
              aria-label="Exportar PDF"
              title="Exportar PDF (una hoja por mesa/fila)"
              style={{ background: "var(--glob-primary, #2d3436)" }}
            >
              <FaFilePdf className="glob-profesor-icon-button" />
              <p>Exportar PDF</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirEliminar(true)}
              aria-label="Eliminar"
              title="Eliminar mesas (confirmar)"
              style={{ background: "var(--glob-danger, #c0392b)" }}
              disabled={vista !== "grupos"}
            >
              <FaEraser className="glob-profesor-icon-button" />
              <p>Eliminar Mesas</p>
            </button>
          </div>
        </div>
      </div>

      {/* Modales (lote) */}
      {abrirCrear && (
        <ModalCrearMesas
          open={abrirCrear}
          onClose={() => setAbrirCrear(false)}
          onLoadingChange={(v) => setCreandoMesas(Boolean(v))}
          onSuccess={async () => {
            setAbrirCrear(false);
            await fetchGrupos();
            await fetchNoAgrupadas();
            notify({ tipo: "exito", mensaje: "Mesas creadas y grupos actualizados." });
          }}
          onError={(mensaje) => {
            setAbrirCrear(false);
            notify({ tipo: "error", mensaje: mensaje || "No se pudieron crear las mesas." });
          }}
        />
      )}

      {abrirEliminar && (
        <ModalEliminarMesas
          open={abrirEliminar}
          onClose={() => setAbrirEliminar(false)}
          onSuccess={() => {
            setAbrirEliminar(false);
            fetchGrupos();
            fetchNoAgrupadas();
            notify({
              tipo: "exito",
              mensaje: "Mesas eliminadas correctamente",
            });
          }}
          onError={(mensaje) =>
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudieron eliminar las mesas.",
            })
          }
          listas={listas}
        />
      )}

      {/* Eliminar individual */}
      {abrirEliminarUno && mesaAEliminar?.numero_mesa && vista === "grupos" && (
        <ModalEliminarMesa
          open={abrirEliminarUno}
          mesa={{ numero_mesa: mesaAEliminar.numero_mesa }}
          onClose={() => setAbrirEliminarUno(false)}
          onSuccess={() => {
            setAbrirEliminarUno(false);
            fetchGrupos();
            fetchNoAgrupadas();
            notify({ tipo: "exito", mensaje: "Mesa eliminada." });
          }}
          onError={(mensaje) =>
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudo eliminar la mesa.",
            })}
        />
      )}

      {/* Info (sirve para ambas vistas) */}
      {abrirInfo && grupoSel && (
        <ModalInfoMesas
          open={abrirInfo}
          mesa={{
            numero_mesa: [
              grupoSel.numero_mesa_1,
              grupoSel.numero_mesa_2,
              grupoSel.numero_mesa_3,
              grupoSel.numero_mesa_4,
            ].filter(Boolean),
            fecha: grupoSel.fecha,
            turno: grupoSel.turno,
            materia: grupoSel.materia,
            tribunal: grupoSel.profesor,
            id_grupo: grupoSel.id_grupo ?? null,
          }}
          onClose={() => setAbrirInfo(false)}
        />
      )}

      {/* Toast */}
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

export default MesasExamen;
