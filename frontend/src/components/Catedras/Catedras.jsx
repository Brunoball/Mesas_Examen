// src/components/Catedras/Catedras.jsx
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
  FaEdit,
  FaArrowLeft,
  FaUsers,
  FaFilter,
  FaChevronDown,
  FaSearch,
  FaTimes,
  FaChalkboardTeacher,
  FaBookOpen,
  FaFileExcel,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import BASE_URL from "../../config/config";

// ✅ Usamos el MISMO CSS global del diseño rojo
import "../Global/section-ui.css";

import ModalAgregar from "./Modales/ModalAgregar";

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

const MAX_CASCADE_ITEMS = 15;

/* ================================
   Componente Cátedras (clon de diseño)
================================ */
const Catedras = () => {
  const navigate = useNavigate();

  const [catedras, setCatedras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // filtros y UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosRef = useRef(null);

  const [q, setQ] = useState("");
  const qDef = useDeferredValue(q);

  const [cursoSel, setCursoSel] = useState("");     // guarda el nombre del curso para mostrar igual que en chips
  const [divisionSel, setDivisionSel] = useState(""); // idem división

  // animación calcada
  const [animacionActiva, setAnimacionActiva] = useState(false);
  const [preCascada, setPreCascada] = useState(false);

  // Modal asignar/editar docente
  const [showModal, setShowModal] = useState(false);
  const [catedraSel, setCatedraSel] = useState(null);

  // ======= Carga desde API =======
  const fetchCatedras = useCallback(async () => {
    try {
      setCargando(true);
      setError("");
      const url = `${BASE_URL}/api.php?action=catedras_list`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.exito) throw new Error(json.mensaje || "Error al obtener cátedras");

      const data = (json.catedras || []).map((c) => ({
        ...c,
        // índices normalizados para búsqueda rápida
        _materia: normalizar(c.materia),
        _docente: normalizar(c.docente || ""),
        _curso: normalizar(c.nombre_curso || ""),
        _division: normalizar(c.nombre_division || ""),
      }));

      setCatedras(data);
    } catch (e) {
      console.error("Error cargando cátedras:", e);
      setError(`No se pudieron cargar las cátedras. ${e.message}`);
      setCatedras([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { fetchCatedras(); }, [fetchCatedras]);

  // ======= Listas únicas para chips =======
  const cursosUnicos = useMemo(() => {
    const s = new Set((catedras || []).map((c) => c.nombre_curso).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [catedras]);

  const divisionesUnicas = useMemo(() => {
    const s = new Set((catedras || []).map((c) => c.nombre_division).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [catedras]);

  // ======= Filtrado =======
  const hayFiltros = !!(q || cursoSel || divisionSel);

  const catedrasFiltradas = useMemo(() => {
    let res = catedras;

    if (qDef?.trim()) {
      const nq = normalizar(qDef);
      res = res.filter(
        (c) =>
          c._materia.includes(nq) ||
          c._docente.includes(nq) ||
          c._curso.includes(nq) ||
          c._division.includes(nq)
      );
    }

    if (cursoSel) {
      const ncur = normalizar(cursoSel);
      res = res.filter((c) => normalizar(c.nombre_curso) === ncur);
    }

    if (divisionSel) {
      const ndiv = normalizar(divisionSel);
      res = res.filter((c) => normalizar(c.nombre_division) === ndiv);
    }

    return res;
  }, [catedras, qDef, cursoSel, divisionSel]);

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
    if (!catedrasFiltradas.length) return;

    const filas = catedrasFiltradas.map((c) => ({
      "Materia": c.materia ?? "",
      "Curso": c.nombre_curso ?? "",
      "División": c.nombre_division ?? "",
      "Docente": c.docente ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(filas, {
      header: ["Materia", "Curso", "División", "Docente"],
    });

    // ancho de columnas aprox
    ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cátedras");

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/octet-stream" });

    saveAs(blob, `Catedras_${yyyy}-${mm}-${dd}(${filas.length}).xlsx`);
  }, [catedrasFiltradas]);

  // ======= Modal =======
  const abrirModal = (catedra) => { setCatedraSel(catedra); setShowModal(true); };
  const cerrarModal = () => setShowModal(false);
  const refrescarTrasAsignar = () => fetchCatedras();

  /* ================================
     Fila virtualizada (desktop)
  ================================= */
  const Row = React.memo(({ index, style, data }) => {
    const { rows, animacionActiva, preCascada } = data;
    const cat = rows[index];
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
        <div className="glob-column glob-column-nombre" title={cat.materia}>
          {cat.materia}
        </div>
        <div className="glob-column">{cat.nombre_curso}</div>
        <div className="glob-column">{cat.nombre_division}</div>
        <div className="glob-column">{cat.docente || "-"}</div>

        <div className="glob-column glob-icons-column">
          <div className="glob-icons-container">
            {/* Sólo editar (se quitó el botón de información) */}
            <button
              className="glob-iconchip is-edit"
              title="Asignar / cambiar docente"
              onClick={() => abrirModal(cat)}
              aria-label="Asignar / cambiar docente"
            >
              <FaEdit />
            </button>
          </div>
        </div>
      </div>
    );
  });

  // ======= Render =======
  const hayResultados = catedrasFiltradas.length > 0;

  return (
    <div className="glob-profesor-container">
      <div className="glob-profesor-box">
        {/* Header */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">
            <FaBookOpen style={{ marginRight: 10 }} />
            Cátedras
          </span>

          {/* Buscador */}
          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder="Buscar por materia, docente, curso o división"
              className="glob-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={cargando}
            />
            {q ? <FaTimes className="glob-clear-search-icon" onClick={() => setQ("")} /> : null}
            <button className="glob-search-button" title="Buscar" aria-label="Buscar">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>

          {/* Filtros */}
          <div className="glob-filtros-container" ref={filtrosRef}>
            <button
              className="glob-filtros-button"
              onClick={() => setMostrarFiltros((p) => !p)}
              disabled={cargando}
              aria-expanded={mostrarFiltros}
            >
              <FaFilter className="glob-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown className={`glob-chevron-icon ${mostrarFiltros ? "glob-rotate" : ""}`} />
            </button>

            {mostrarFiltros && (
              <div className="glob-filtros-menu" role="menu">
                {/* CURSO */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className="glob-filtros-group-header is-open"
                    aria-expanded
                  >
                    <span className="glob-filtros-group-title">
                      <FaChalkboardTeacher style={{ marginRight: 8 }} /> Filtrar por curso
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className="glob-filtros-group-body is-open">
                    <div className="glob-grid-filtros">
                      {cursosUnicos.map((cur) => (
                        <button
                          key={`cur-${cur}`}
                          className={`glob-chip-filtro ${cursoSel === cur ? "glob-active" : ""}`}
                          onClick={() => {
                            setCursoSel(cur === cursoSel ? "" : cur);
                            setMostrarFiltros(false);
                            triggerCascadaConPreMask();
                          }}
                          title={`Filtrar por ${cur}`}
                          aria-pressed={cursoSel === cur}
                        >
                          {cur}
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
                    <span className="glob-filtros-group-title">
                      <FaChalkboardTeacher style={{ marginRight: 8 }} /> Filtrar por división
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className="glob-filtros-group-body is-open">
                    <div className="glob-grid-filtros">
                      {divisionesUnicas.map((d) => (
                        <button
                          key={`div-${d}`}
                          className={`glob-chip-filtro ${divisionSel === d ? "glob-active" : ""}`}
                          onClick={() => {
                            setDivisionSel(d === divisionSel ? "" : d);
                            setMostrarFiltros(false);
                            triggerCascadaConPreMask();
                          }}
                          title={`Filtrar por ${d}`}
                          aria-pressed={divisionSel === d}
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
                  Cátedras: {hayResultados ? catedrasFiltradas.length : 0}
                </span>
                <span className="glob-profesores-mobile">
                  {hayResultados ? catedrasFiltradas.length : 0}
                </span>
                <FaUsers className="glob-icono-profesor" />
              </div>

              {(q || cursoSel || divisionSel) && (
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

                  {cursoSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">Curso: {cursoSel}</span>
                      <button className="glob-chip-mini-close" onClick={() => setCursoSel("")} aria-label="Quitar">
                        ×
                      </button>
                    </div>
                  )}

                  {divisionSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">Div: {divisionSel}</span>
                      <button className="glob-chip-mini-close" onClick={() => setDivisionSel("")} aria-label="Quitar">
                        ×
                      </button>
                    </div>
                  )}

                  <button
                    className="glob-chip-mini glob-chip-clear-all"
                    onClick={() => {
                      setQ("");
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
            <div className="glob-header" style={{ gridTemplateColumns: "1.6fr 0.8fr 0.8fr 1fr 0.8fr" }}>
              <div className="glob-column-header">Materia</div>
              <div className="glob-column-header">Curso</div>
              <div className="glob-column-header">División</div>
              <div className="glob-column-header">Docente</div>
              <div className="glob-column-header">Acciones</div>
            </div>

            <div className="glob-body">
              {cargando ? (
                <div className="glob-loading-spinner-container"><div className="glob-loading-spinner" /></div>
              ) : catedras.length === 0 ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content"><p>No hay cátedras registradas</p></div>
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
                        itemCount={catedrasFiltradas.length}
                        itemSize={48}
                        itemData={{
                          rows: catedrasFiltradas,
                          animacionActiva,
                          preCascada,
                        }}
                        overscanCount={10}
                        itemKey={(index, data) => data.rows[index]?.id_catedra ?? index}
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
              animacionActiva && catedrasFiltradas.length <= MAX_CASCADE_ITEMS
                ? "glob-cascade-animation"
                : ""
            }`}
          >
            {cargando ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content"><p>Cargando cátedras…</p></div>
              </div>
            ) : catedras.length === 0 ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content"><p>No hay cátedras registradas</p></div>
              </div>
            ) : !hayResultados ? (
              <div className="glob-no-data-message glob-no-data-mobile">
                <div className="glob-message-content"><p>No hay resultados con los filtros actuales</p></div>
              </div>
            ) : (
              catedrasFiltradas.map((c, i) => {
                const willAnimate = animacionActiva && i < MAX_CASCADE_ITEMS;
                const preMask = preCascada && i < MAX_CASCADE_ITEMS;
                return (
                  <div
                    key={c.id_catedra}
                    className={`glob-card ${willAnimate ? "glob-cascade" : ""}`}
                    style={{
                      animationDelay: willAnimate ? `${i * 0.03}s` : "0s",
                      opacity: preMask ? 0 : undefined,
                      transform: preMask ? "translateY(8px)" : undefined,
                    }}
                  >
                    <div className="glob-card-header">
                      <h3 className="glob-card-title">{c.materia}</h3>
                    </div>
                    <div className="glob-card-body">
                      <div className="glob-card-row">
                        <span className="glob-card-label">Curso/Div</span>
                        <span className="glob-card-value">{c.nombre_curso} • {c.nombre_division}</span>
                      </div>
                      <div className="glob-card-row">
                        <span className="glob-card-label">Docente</span>
                        <span className="glob-card-value">{c.docente || "-"}</span>
                      </div>
                    </div>

                    <div className="glob-card-actions">
                      {/* Sólo editar (se quitó el botón de información) */}
                      <button
                        className="glob-action-btn glob-iconchip is-edit"
                        title="Asignar / cambiar docente"
                        onClick={() => abrirModal(c)}
                        aria-label="Asignar / cambiar docente"
                      >
                        <FaEdit />
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
            {/* 🔻 Eliminado el botón “Asignar Docente” */}
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

      {/* Modal para asignar/editar docente (se mantiene para el ícono de edición) */}
      <ModalAgregar
        open={showModal}
        catedra={catedraSel}
        onClose={cerrarModal}
        onAsignado={refrescarTrasAsignar}
      />
    </div>
  );
};

export default Catedras;
