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
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import BASE_URL from "../../config/config";
import "../Global/section-ui.css"; 

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

  // filtros y UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosRef = useRef(null);

  const [q, setQ] = useState("");
  const qDef = useDeferredValue(q);

  const [materiaSel, setMateriaSel] = useState("");
  const [turnoSel, setTurnoSel] = useState("");

  // animación calcada
  const [animacionActiva, setAnimacionActiva] = useState(false);
  const [preCascada, setPreCascada] = useState(false);

  // ======= Carga (mock) =======
  const fetchMesas = useCallback(async () => {
    setCargando(true);
    try {
      // Cuando tengas endpoint real:
      // const resp = await fetch(`${BASE_URL}/api.php?action=mesas_listar`, { cache: "no-store" });
      // const json = await resp.json();
      // if (!json?.exito) throw new Error(json?.mensaje || "No se pudieron obtener las mesas.");
      // const data = json.data || [];

      // Mock de ejemplo
      const data = [
        { id: 1, materia: "Matemática I", curso: "1°", division: "A", fecha: "2025-11-10", turno: "Mañana", profesor: "Pairone, Verónica" },
        { id: 2, materia: "Lengua",        curso: "2°", division: "B", fecha: "2025-11-11", turno: "Tarde",   profesor: "González, María" },
        { id: 3, materia: "Física",        curso: "3°", division: "C", fecha: "2025-11-12", turno: "Mañana",  profesor: "Pérez, Juan"     },
        { id: 4, materia: "Química",       curso: "4°", division: "A", fecha: "2025-11-15", turno: "Noche",   profesor: "Díaz, Carla"     },
      ];

      const procesadas = data.map((m) => ({
        ...m,
        _materia: normalizar(m.materia),
        _profesor: normalizar(m.profesor),
        _curso: normalizar(m.curso),
        _division: normalizar(m.division),
        _turno: normalizar(m.turno),
      }));

      setMesas(procesadas);
      setMesasDB(procesadas);
    } catch (e) {
      console.error(e);
      setMesas([]);
      setMesasDB([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { fetchMesas(); }, [fetchMesas]);

  // ======= Listas únicas para filtros =======
  const materiasUnicas = useMemo(() => {
    const s = new Set((mesasDB || []).map((m) => m.materia).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [mesasDB]);

  const turnosUnicos = useMemo(() => {
    const s = new Set((mesasDB || []).map((m) => m.turno).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [mesasDB]);

  // ======= Filtrado =======
  const hayFiltros = !!(q || materiaSel || turnoSel);

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
      res = res.filter((m) => normalizar(m.materia) === nm);
    }

    if (turnoSel) {
      const nt = normalizar(turnoSel);
      res = res.filter((m) => normalizar(m.turno) === nt);
    }

    return res;
  }, [mesas, qDef, materiaSel, turnoSel]);

  // ======= Animación en cascada (idéntica) =======
  const dispararCascadaUnaVez = useCallback((duracionMs) => {
    const safeMs = 400 + (MAX_CASCADE_ITEMS - 1) * 30 + 300;
    const total = typeof duracionMs === "number" ? duracionMs : safeMs;
    if (animacionActiva) return;
    setAnimacionActiva(true);
    window.setTimeout(() => setAnimacionActiva(false), total);
  }, [animacionActiva]);

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
      "Materia": m.materia,
      "Curso": m.curso,
      "División": m.division,
      "Fecha": formatearFechaISO(m.fecha),
      "Turno": m.turno,
      "Profesor": m.profesor,
    }));

    const ws = XLSX.utils.json_to_sheet(filas, {
      header: ["ID Mesa", "Materia", "Curso", "División", "Fecha", "Turno", "Profesor"],
    });
    ws["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 8 }, { wch: 9 }, { wch: 12 }, { wch: 10 }, { wch: 28 }];

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
    const { rows, animacionActiva, preCascada } = data;
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
        className={`glob-row ${index % 2 === 0 ? "glob-even-row" : "glob-odd-row"} ${willAnimate ? "glob-cascade" : ""}`}
      >
        <div className="glob-column glob-column-dni">{mesa.id}</div>
        <div className="glob-column glob-column-nombre" title={mesa.materia}>
          {mesa.materia}
        </div>
        <div className="glob-column">{mesa.curso} {mesa.division}</div>
        <div className="glob-column">{formatearFechaISO(mesa.fecha)}</div>
        <div className="glob-column">{mesa.turno}</div>
        <div className="glob-column">{mesa.profesor}</div>

        <div className="glob-column glob-icons-column">
          <div className="glob-icons-container">
            <button
              className="glob-iconchip is-info"
              title="Información"
              onClick={() => alert(`Info mesa #${mesa.id}`)}
              aria-label="Información"
            >
              <FaInfoCircle />
            </button>

            <button
              className="glob-iconchip is-edit"
              title="Editar"
              onClick={() => alert(`Editar mesa #${mesa.id}`)}
              aria-label="Editar"
            >
              <FaEdit />
            </button>

            <button
              className="glob-iconchip is-delete"
              title="Eliminar"
              onClick={() => alert(`Eliminar mesa #${mesa.id}`)}
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
              placeholder="Buscar por materia, profesor, curso, división o fecha"
              className="glob-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={cargando}
            />
            {q ? <FaTimes className="glob-clear-search-icon" onClick={() => setQ("")} /> : null}
            <button className="glob-search-button" title="Buscar">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>

          {/* Filtros */}
          <div className="glob-filtros-container" ref={filtrosRef}>
            <button
              className="glob-filtros-button"
              onClick={() => setMostrarFiltros((p) => !p)}
              disabled={cargando}
            >
              <FaFilter className="glob-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown className={`glob-chevron-icon ${mostrarFiltros ? "glob-rotate" : ""}`} />
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
                      {materiasUnicas.map((mat) => (
                        <button
                          key={`mat-${mat}`}
                          className={`glob-chip-filtro ${materiaSel === mat ? "glob-active" : ""}`}
                          onClick={() => {
                            setMateriaSel(mat === materiaSel ? "" : mat);
                            setMostrarFiltros(false);
                            triggerCascadaConPreMask();
                          }}
                          title={`Filtrar por ${mat}`}
                        >
                          {mat}
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
                          className={`glob-chip-filtro ${turnoSel === t ? "glob-active" : ""}`}
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

                {/* Mostrar todos */}
                <div
                  className="glob-filtros-menu-item glob-mostrar-todas"
                  onClick={() => {
                    setQ("");
                    setMateriaSel("");
                    setTurnoSel("");
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

              {/* Chips activos */}
              {(q || materiaSel || turnoSel) && (
                <div className="glob-chips-container">
                  {q && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">Búsqueda: {q}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">
                        {q.length > 6 ? `${q.substring(0, 6)}…` : q}
                      </span>
                      <button className="glob-chip-mini-close" onClick={() => setQ("")} aria-label="Quitar">
                        ×
                      </button>
                    </div>
                  )}

                  {materiaSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">Materia: {materiaSel}</span>
                      <button className="glob-chip-mini-close" onClick={() => setMateriaSel("")} aria-label="Quitar">
                        ×
                      </button>
                    </div>
                  )}

                  {turnoSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">Turno: {turnoSel}</span>
                      <button className="glob-chip-mini-close" onClick={() => setTurnoSel("")} aria-label="Quitar">
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
              <div className="glob-column-header">Profesor</div>
              <div className="glob-column-header">Acciones</div>
            </div>

            <div className="glob-body">
              {cargando ? (
                <div className="glob-loading-spinner-container"><div className="glob-loading-spinner" /></div>
              ) : mesasDB.length === 0 ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content"><p>No hay mesas registradas</p></div>
                </div>
              ) : !hayResultados ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content"><p>No hay resultados con los filtros actuales</p></div>
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
                        }}
                        overscanCount={10}
                        itemKey={(index, data) => data.rows[index]?.id ?? index}
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
                <div className="glob-message-content"><p>Cargando mesas…</p></div>
              </div>
            ) : mesasDB.length === 0 ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content"><p>No hay mesas registradas</p></div>
              </div>
            ) : !hayResultados ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content"><p>No hay resultados con los filtros actuales</p></div>
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
                        <span className="glob-card-value">{m.curso} • {m.division}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label"><FaCalendarAlt style={{ marginRight: 6 }} />Fecha</span>
                        <span className="glob-card-value">{formatearFechaISO(m.fecha)}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label"><FaClock style={{ marginRight: 6 }} />Turno</span>
                        <span className="glob-card-value">{m.turno}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">Profesor</span>
                        <span className="glob-card-value">{m.profesor}</span>
                      </div>
                    </div>

                    <div className="glob-card-actions">
                      <button
                        className="glob-action-btn glob-iconchip is-info"
                        title="Información"
                        onClick={() => alert(`Info mesa #${m.id}`)}
                        aria-label="Información"
                      >
                        <FaInfoCircle />
                      </button>
                      <button
                        className="glob-action-btn glob-iconchip is-edit"
                        title="Editar"
                        onClick={() => alert(`Editar mesa #${m.id}`)}
                        aria-label="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="glob-action-btn glob-iconchip is-delete"
                        title="Eliminar"
                        onClick={() => alert(`Eliminar mesa #${m.id}`)}
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
              onClick={() => alert("Navegar a /mesas-examen/agregar (implementar).")}
              aria-label="Agregar"
              title="Nueva Mesa"
            >
              <FaUserPlus className="glob-profesor-icon-button" />
              <p>Nueva Mesa</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={exportarExcel}
              disabled={!hayResultados}
              aria-label="Exportar"
              title={hayResultados ? "Exportar a Excel" : "No hay filas visibles para exportar"}
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar a Excel</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MesasExamen;
