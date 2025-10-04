// src/components/MesasExamen/MesasExamen.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  useDeferredValue,
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
  FaBook,
  FaEraser,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import BASE_URL from "../../config/config";
import "../Global/section-ui.css";

// 🔔 Toast
import Toast from "../Global/Toast";

// Modales
import ModalCrearMesas from "./modales/ModalCrearMesas";
import ModalEliminarMesas from "./modales/ModalEliminarMesas";
import ModalInfoMesas from "./modales/ModalInfoMesas";

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

/* ================================
   Componente Mesas de Examen
================================ */
const MesasExamen = () => {
  const navigate = useNavigate();

  const [mesas, setMesas] = useState([]);
  const [mesasDB, setMesasDB] = useState([]);
  const [cargando, setCargando] = useState(true);

  // listas básicas (para filtros / combos)
  const [listas, setListas] = useState({
    cursos: [],
    divisiones: [],
    turnos: [],
  });

  // filtros y UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosRef = useRef(null);

  const [q, setQ] = useState("");
  const qDef = useDeferredValue(q);

  const [materiaSel, setMateriaSel] = useState("");
  const [turnoSel, setTurnoSel] = useState("");
  const [cursoSel, setCursoSel] = useState("");
  const [divisionSel, setDivisionSel] = useState("");

  // animación
  const [animacionActiva, setAnimacionActiva] = useState(false);
  const [preCascada, setPreCascada] = useState(false);

  // modales
  const [abrirCrear, setAbrirCrear] = useState(false);
  const [abrirEliminar, setAbrirEliminar] = useState(false);

  // modal info
  const [abrirInfo, setAbrirInfo] = useState(false);
  const [mesaSel, setMesaSel] = useState(null);

  // 🔔 estado Toast
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
    } catch {}
  }, []);

  // ======= Carga de mesas (reales) =======
  const fetchMesas = useCallback(async () => {
    setCargando(true);
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_listar`, {
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json?.exito)
        throw new Error(json?.mensaje || "Error al listar mesas.");

      const data = Array.isArray(json.data) ? json.data : [];

      const procesadas = data.map((m) => {
        const tribunalStr = Array.isArray(m.tribunal)
          ? m.tribunal.filter(Boolean).join(" | ")
          : m.tribunal || "";
        const profesor = m.profesor || tribunalStr || "";

        return {
          ...m,
          id: m.id ?? m.id_mesa,
          id_materia: m.id_materia ?? m?.materia_id ?? null,
          materia: m.materia ?? "",
          curso: m.curso ?? "",
          division: m.division ?? "",
          fecha: m.fecha ?? m.fecha_mesa ?? "",
          turno: m.turno ?? "",
          profesor,

          _materia: normalizar(m.materia ?? ""),
          _profesor: normalizar(profesor),
          _curso: normalizar(m.curso ?? ""),
          _division: normalizar(m.division ?? ""),
          _turno: normalizar(m.turno ?? ""),
        };
      });

      setMesas(procesadas);
      setMesasDB(procesadas);
    } catch {
      setMesas([]);
      setMesasDB([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    fetchListas();
    fetchMesas();
  }, [fetchListas, fetchMesas]);

  // ======= Listas únicas =======
  const turnosUnicos = useMemo(() => {
    if (listas.turnos?.length)
      return listas.turnos
        .map((t) => String(t.nombre ?? t.turno ?? "").trim())
        .filter(Boolean);
    const s = new Set((mesasDB || []).map((m) => m.turno).filter(Boolean));
    return Array.from(s).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [mesasDB, listas.turnos]);

  const cursosCombo = useMemo(() => {
    const base = new Set(
      (listas.cursos || []).map((c) => c.nombre ?? c.nombre_curso)
    );
    mesasDB.forEach((m) => base.add(m.curso));
    return Array.from(base)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [listas.cursos, mesasDB]);

  const divisionesCombo = useMemo(() => {
    const base = new Set(
      (listas.divisiones || []).map((d) => d.nombre ?? d.nombre_division)
    );
    mesasDB.forEach((m) => base.add(m.division));
    return Array.from(base)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [listas.divisiones, mesasDB]);

  // ======= Filtrado =======
  const hayFiltros = !!(q || materiaSel || turnoSel || cursoSel || divisionSel);

  const mesasFiltradas = useMemo(() => {
    let res = mesas;

    if (qDef?.trim()) {
      const nq = normalizar(qDef);
      res = res.filter(
        (m) =>
          m._materia.includes(nq) ||
          m._profesor.includes(nq) ||
          m._curso.includes(nq) ||
          m._division.includes(nq) ||
          m._turno.includes(nq) ||
          (m.fecha || "").includes(nq)
      );
    }

    if (materiaSel) {
      const nm = normalizar(materiaSel);
      res = res.filter((m) => m._materia === nm);
    }

    if (turnoSel) {
      const nt = normalizar(turnoSel);
      res = res.filter((m) => m._turno === nt);
    }

    if (cursoSel) {
      const nc = normalizar(cursoSel);
      res = res.filter((m) => m._curso === nc);
    }

    if (divisionSel) {
      const nd = normalizar(divisionSel);
      res = res.filter((m) => m._division === nd);
    }

    return res;
  }, [mesas, qDef, materiaSel, turnoSel, cursoSel, divisionSel]);

  // ======= Animación en cascada =======
  const dispararCascadaUnaVez = useCallback(
    (duracionMs) => {
      const safeMs = 400 + (MAX_CASCADE_ITEMS - 1) * 30 + 300;
      const total = typeof duracionMs === "number" ? duracionMs : safeMs;
      if (animacionActiva) return;
      setAnimacionActiva(true);
      window.setTimeout(() => setAnimacionActiva(false), total);
    },
    [animacionActiva]
  );

  const triggerCascadaConPreMask = useCallback(() => {
    setPreCascada(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dispararCascadaUnaVez();
        setPreCascada(false);
      });
    });
  }, [dispararCascadaUnaVez]);

  useEffect(() => {
    if (qDef?.trim()) triggerCascadaConPreMask();
  }, [qDef, triggerCascadaConPreMask]);

  // ======= Click fuera para cerrar filtros =======
  useEffect(() => {
    const h = (e) => {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target)) {
        setMostrarFiltros(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ======= Exportar visible =======
  const exportarExcel = useCallback(() => {
    if (!mesasFiltradas.length) return;

    const filas = mesasFiltradas.map((m) => ({
      "ID Mesa": m.id,
      Materia: m.materia,
      Curso: m.curso,
      "División": m.division,
      Fecha: formatearFechaISO(m.fecha),
      Turno: m.turno,
      "Tribunal / Profesor": m.profesor || "",
    }));

    const ws = XLSX.utils.json_to_sheet(filas, {
      header: [
        "ID Mesa",
        "Materia",
        "Curso",
        "División",
        "Fecha",
        "Turno",
        "Tribunal / Profesor",
      ],
    });
    ws["!cols"] = [
      { wch: 10 },
      { wch: 26 },
      { wch: 8 },
      { wch: 9 },
      { wch: 12 },
      { wch: 10 },
      { wch: 36 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mesas");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/octet-stream" });

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    saveAs(blob, `MesasDeExamen_${yyyy}-${mm}-${dd}(${filas.length}).xlsx`);
  }, [mesasFiltradas]);

  /* ================================
     Fila virtualizada (desktop)
  ================================= */
  const Row = React.memo(({ index, style, data }) => {
    const { rows, animacionActiva, preCascada, onInfo } = data;
    const mesa = rows[index];
    const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
    const preMask = preCascada && index < MAX_CASCADE_ITEMS;

    return (
      <div
        style={{
          ...style,
          animationDelay: willAnimate ? `${index * 0.03}s` : "0s",
          opacity: preMask ? 0 : undefined,
          transform: preMask ? "translateY(8px)" : undefined,
        }}
        className={`glob-row ${
          index % 2 === 0 ? "glob-even-row" : "glob-odd-row"
        } ${willAnimate ? "glob-cascade" : ""}`}
      >
        <div className="glob-column glob-column-dni">{mesa.id}</div>
        <div className="glob-column glob-column-nombre" title={mesa.materia}>
          {mesa.materia}
        </div>
        <div className="glob-column">
          {mesa.curso} {mesa.division}
        </div>
        <div className="glob-column">{formatearFechaISO(mesa.fecha)}</div>
        <div className="glob-column">{mesa.turno}</div>
        <div className="glob-column">{mesa.profesor}</div>

        <div className="glob-column glob-icons-column">
          <div className="glob-icons-container">
            <button
              className="glob-iconchip is-info"
              title="Información"
              onClick={() => onInfo?.(mesa)}
              aria-label="Información"
            >
              <FaInfoCircle />
            </button>
            <button
              className="glob-iconchip is-edit"
              title="Editar"
              onClick={() => {}}
              aria-label="Editar"
            >
              <FaEdit />
            </button>
            <button
              className="glob-iconchip is-delete"
              title="Eliminar"
              onClick={() => {}}
              aria-label="Eliminar"
            >
              <FaTrash />
            </button>
          </div>
        </div>
      </div>
    );
  });

  // ======= Render =======
  const hayResultados = mesasFiltradas.length > 0;

  return (
    <div className="glob-profesor-container">
      <div className="glob-profesor-box">
        {/* Header */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Mesas de Examen</span>

          {/* Buscador */}
          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder="Buscar por materia, tribunal, curso, división o fecha"
              className="glob-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={cargando}
            />
            {q ? (
              <FaTimes
                className="glob-clear-search-icon"
                onClick={() => setQ("")}
              />
            ) : null}
            <button className="glob-search-button" title="Buscar">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>

          {/* Panel de filtros adicionales */}
          <div className="glob-filtros-container" ref={filtrosRef}>
            <button
              className="glob-filtros-button"
              onClick={() => setMostrarFiltros((p) => !p)}
              disabled={cargando}
            >
              <FaFilter className="glob-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown
                className={`glob-chevron-icon ${
                  mostrarFiltros ? "glob-rotate" : ""
                }`}
              />
            </button>

            {mostrarFiltros && (
              <div className="glob-filtros-menu" role="menu">
                {/* MATERIA */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className="glob-filtros-group-header is-open"
                    aria-expanded
                  >
                    <span className="glob-filtros-group-title">
                      <FaBook style={{ marginRight: 8 }} /> Filtrar por materia
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className="glob-filtros-group-body is-open">
                    <div className="glob-grid-filtros">
                      {Array.from(
                        new Set(mesasDB.map((m) => m.materia).filter(Boolean))
                      )
                        .sort((a, b) =>
                          a.localeCompare(b, "es", { sensitivity: "base" })
                        )
                        .map((nombre) => (
                          <button
                            key={`mat-${nombre}`}
                            className={`glob-chip-filtro ${
                              materiaSel === nombre ? "glob-active" : ""
                            }`}
                            onClick={() => {
                              setMateriaSel(
                                nombre === materiaSel ? "" : nombre
                              );
                              setMostrarFiltros(false);
                              triggerCascadaConPreMask();
                            }}
                            title={`Filtrar por ${nombre}`}
                          >
                            {nombre}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                {/* TURNO */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className="glob-filtros-group-header is-open"
                    aria-expanded
                  >
                    <span className="glob-filtros-group-title">
                      <FaClock style={{ marginRight: 8 }} /> Filtrar por turno
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className="glob-filtros-group-body is-open">
                    <div className="glob-grid-filtros">
                      {turnosUnicos.map((t) => (
                        <button
                          key={`turno-${t}`}
                          className={`glob-chip-filtro ${
                            turnoSel === t ? "glob-active" : ""
                          }`}
                          onClick={() => {
                            setTurnoSel(t === turnoSel ? "" : t);
                            setMostrarFiltros(false);
                            triggerCascadaConPreMask();
                          }}
                          title={`Filtrar por ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CURSO */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className="glob-filtros-group-header is-open"
                    aria-expanded
                  >
                    <span className="glob-filtros-group-title">Curso</span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className="glob-filtros-group-body is-open">
                    <div className="glob-grid-filtros">
                      {cursosCombo.map((c) => (
                        <button
                          key={`curso-${c}`}
                          className={`glob-chip-filtro ${
                            cursoSel === c ? "glob-active" : ""
                          }`}
                          onClick={() => {
                            setCursoSel(cursoSel === c ? "" : c);
                            setMostrarFiltros(false);
                            triggerCascadaConPreMask();
                          }}
                          title={`Filtrar por ${c}`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* DIVISIÓN */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className="glob-filtros-group-header is-open"
                    aria-expanded
                  >
                    <span className="glob-filtros-group-title">División</span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className="glob-filtros-group-body is-open">
                    <div className="glob-grid-filtros">
                      {divisionesCombo.map((d) => (
                        <button
                          key={`div-${d}`}
                          className={`glob-chip-filtro ${
                            divisionSel === d ? "glob-active" : ""
                          }`}
                          onClick={() => {
                            setDivisionSel(divisionSel === d ? "" : d);
                            setMostrarFiltros(false);
                            triggerCascadaConPreMask();
                          }}
                          title={`Filtrar por ${d}`}
                        >
                          {d}
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
                    setMateriaSel("");
                    setTurnoSel("");
                    setCursoSel("");
                    setDivisionSel("");
                    setMostrarFiltros(false);
                    triggerCascadaConPreMask();
                  }}
                  role="menuitem"
                >
                  <span>Mostrar Todos</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contador + Chips */}
        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            <div className="glob-left-inline">
              <div className="glob-contador-container">
                <span className="glob-profesores-desktop">
                  Mesas: {hayResultados ? mesasFiltradas.length : 0}
                </span>
                <span className="glob-profesores-mobile">
                  {hayResultados ? mesasFiltradas.length : 0}
                </span>
                <FaUsers className="glob-icono-profesor" />
              </div>

              {(q || materiaSel || turnoSel || cursoSel || divisionSel) && (
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

                  {materiaSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">
                        Materia: {materiaSel}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => setMateriaSel("")}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {turnoSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">
                        Turno: {turnoSel}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => setTurnoSel("")}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {cursoSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">
                        Curso: {cursoSel}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => setCursoSel("")}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {divisionSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">
                        División: {divisionSel}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => setDivisionSel("")}
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
                      setMateriaSel("");
                      setTurnoSel("");
                      setCursoSel("");
                      setDivisionSel("");
                    }}
                    title="Quitar todos los filtros"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TABLA (desktop) */}
          <div className="glob-box-table">
            <div className="glob-header glob-header-mesas">
              <div className="glob-column-header">ID</div>
              <div className="glob-column-header">Materia</div>
              <div className="glob-column-header">Curso/Div</div>
              <div className="glob-column-header">Fecha</div>
              <div className="glob-column-header">Turno</div>
              <div className="glob-column-header">Tribunal</div>
              <div className="glob-column-header">Acciones</div>
            </div>

            <div className="glob-body">
              {cargando ? (
                <div className="glob-loading-spinner-container">
                  <div className="glob-loading-spinner" />
                </div>
              ) : mesasDB.length === 0 ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content">
                    <p>No hay mesas registradas</p>
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
                        itemCount={mesasFiltradas.length}
                        itemSize={48}
                        itemData={{
                          rows: mesasFiltradas,
                          animacionActiva,
                          preCascada,
                          onInfo: (m) => {
                            setMesaSel(m);
                            setAbrirInfo(true);
                          },
                        }}
                        overscanCount={10}
                        itemKey={(index, data) =>
                          data.rows[index]?.id ?? index
                        }
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
              animacionActiva && mesasFiltradas.length <= MAX_CASCADE_ITEMS
                ? "glob-cascade-animation"
                : ""
            }`}
          >
            {cargando ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content">
                  <p>Cargando mesas…</p>
                </div>
              </div>
            ) : mesasDB.length === 0 ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content">
                  <p>No hay mesas registradas</p>
                </div>
              </div>
            ) : !hayResultados ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content">
                  <p>No hay resultados con los filtros actuales</p>
                </div>
              </div>
            ) : (
              mesasFiltradas.map((m, i) => {
                const willAnimate = animacionActiva && i < MAX_CASCADE_ITEMS;
                const preMask = preCascada && i < MAX_CASCADE_ITEMS;
                return (
                  <div
                    key={m.id}
                    className={`glob-card ${willAnimate ? "glob-cascade" : ""}`}
                    style={{
                      animationDelay: willAnimate ? `${i * 0.03}s` : "0s",
                      opacity: preMask ? 0 : undefined,
                      transform: preMask ? "translateY(8px)" : undefined,
                    }}
                  >
                    <div className="glob-card-header">
                      <h3 className="glob-card-title">{m.materia}</h3>
                    </div>
                    <div className="glob-card-body">
                      <div className="glob-card-row">
                        <span className="glob-card-label">ID</span>
                        <span className="glob-card-value">{m.id}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">Curso/Div</span>
                        <span className="glob-card-value">
                          {m.curso} • {m.division}
                        </span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">
                          <FaCalendarAlt style={{ marginRight: 6 }} />
                          Fecha
                        </span>
                        <span className="glob-card-value">
                          {formatearFechaISO(m.fecha)}
                        </span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">
                          <FaClock style={{ marginRight: 6 }} />
                          Turno
                        </span>
                        <span className="glob-card-value">{m.turno}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">Tribunal</span>
                        <span className="glob-card-value">{m.profesor}</span>
                      </div>
                    </div>

                    <div className="glob-card-actions">
                      <button
                        className="glob-action-btn glob-iconchip is-info"
                        title="Información"
                        onClick={() => {
                          setMesaSel(m);
                          setAbrirInfo(true);
                        }}
                        aria-label="Información"
                      >
                        <FaInfoCircle />
                      </button>
                      <button
                        className="glob-action-btn glob-iconchip is-edit"
                        title="Editar"
                        onClick={() => {}}
                        aria-label="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="glob-action-btn glob-iconchip is-delete"
                        title="Eliminar"
                        onClick={() => {}}
                        aria-label="Eliminar"
                      >
                        <FaTrash />
                      </button>
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
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirCrear(true)}
              aria-label="Crear"
              title="Crear mesas (confirmar)"
            >
              <FaUserPlus className="glob-profesor-icon-button" />
              <p>Crear Mesas</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={exportarExcel}
              disabled={!hayResultados}
              aria-label="Exportar"
              title={
                hayResultados
                  ? "Exportar a Excel"
                  : "No hay filas visibles para exportar"
              }
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar a Excel</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirEliminar(true)}
              aria-label="Eliminar"
              title="Eliminar mesas (confirmar)"
              style={{ background: "var(--glob-danger, #c0392b)" }}
            >
              <FaEraser className="glob-profesor-icon-button" />
              <p>Eliminar Mesas</p>
            </button>
          </div>
        </div>
      </div>

      {/* Modales */}
      {abrirCrear && (
        <ModalCrearMesas
          open={abrirCrear}
          onClose={() => setAbrirCrear(false)}
          onSuccess={() => {
            setAbrirCrear(false);
            fetchMesas();
            notify({ tipo: "exito", mensaje: "Mesas creadas correctamente." });
          }}
          listas={listas}
        />
      )}

      {abrirEliminar && (
        <ModalEliminarMesas
          open={abrirEliminar}
          onClose={() => setAbrirEliminar(false)}
          onSuccess={() => {
            setAbrirEliminar(false);
            fetchMesas();
            notify({ tipo: "exito", mensaje: "Mesas eliminadas correctamente" });
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

      {abrirInfo && (
        <ModalInfoMesas
          open={abrirInfo}
          mesa={mesaSel}
          onClose={() => setAbrirInfo(false)}
        />
      )}

      {/* 🔔 Toast */}
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
