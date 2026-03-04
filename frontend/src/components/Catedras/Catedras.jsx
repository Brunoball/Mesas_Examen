// src/components/Catedras/Catedras.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  useId,
  useTransition,
} from "react";
import { useNavigate } from "react-router-dom";
import { FixedSizeList as List, areEqual as areRowEqual } from "react-window";
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
  FaFileExcel,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import BASE_URL from "../../config/config";

import "../Global/section-ui.css";

import ModalAgregar from "./Modales/ModalAgregar";
import Toast from "../Global/Toast";

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
const ITEM_SIZE = 48;
const GRID_COLS = "0.5fr 1.6fr 0.9fr 1fr 0.8fr";

// Clave para sessionStorage
const SCROLL_KEY = "catedras_scroll_offset";

/* Debounce simple */
function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* Media query hook para render condicional desktop/mobile */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

/* ================================
   Fila virtualizada (desktop)
================================ */
const Row = React.memo(({ index, style, data }) => {
  const { rows, animacionActiva, preCascada, onOpenModal } = data;
  const cat = rows[index];
  const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
  const preMask = preCascada && index < MAX_CASCADE_ITEMS;

  return (
    <div
      style={{
        ...style,
        gridTemplateColumns: GRID_COLS,
        animationDelay: willAnimate ? `${index * 0.03}s` : "0s",
        opacity: preMask ? 0 : undefined,
        transform: preMask ? "translateY(8px)" : undefined,
      }}
      className={`glob-row ${index % 2 === 0 ? "glob-even-row" : "glob-odd-row"} ${
        willAnimate ? "glob-cascade" : ""
      }`}
    >
      <div className="glob-column" style={{ width: "100%" }} title={`ID ${cat.id_catedra}`}>
        {cat.id_catedra}
      </div>
      <div className="glob-column glob-column-nombre" title={cat.materia}>
        {cat.materia}
      </div>

      <div className="glob-column" title={`${cat.nombre_curso}${cat.nombre_division}`}>
        {cat.cursoDiv}
      </div>

      <div className="glob-column">{cat.docente || "-"}</div>

      <div className="glob-column glob-icons-column">
        <div className="glob-icons-container">
          <button
            className="glob-iconchip is-edit"
            title="Asignar / cambiar docente"
            onClick={() => onOpenModal(cat)}
            aria-label="Asignar / cambiar docente"
          >
            <FaEdit />
          </button>
        </div>
      </div>
    </div>
  );
}, areRowEqual);

/* ================================
   Componente Cátedras
================================ */
const Catedras = () => {
  const navigate = useNavigate();
  const listId = useId();
  const isDesktop = useMediaQuery("(min-width: 992px)");

  const [isPending, startTransition] = useTransition();

  const [catedras, setCatedras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Toast global
  const [toast, setToast] = useState({
    abierto: false,
    tipo: "exito",
    mensaje: "",
    duracion: 2200,
  });
  const mostrarToast = useCallback(
    (tipo, mensaje, duracion = 2200) => setToast({ abierto: true, tipo, mensaje, duracion }),
    []
  );

  // filtros y UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosRef = useRef(null);

  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput, 200);

  const [cursoSel, setCursoSel] = useState("");
  const [divisionSel, setDivisionSel] = useState("");
  const [filtroActivo, setFiltroActivo] = useState(null);

  const [openAcc, setOpenAcc] = useState({ curso: false, division: false });
  useEffect(() => {
    if (mostrarFiltros) setOpenAcc({ curso: false, division: false });
  }, [mostrarFiltros]);

  const [animacionActiva, setAnimacionActiva] = useState(false);
  const [preCascada, setPreCascada] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [catedraSel, setCatedraSel] = useState(null);

  // Refs para scroll
  const listRef = useRef(null);
  const savedScrollOffsetRef = useRef(0);
  const viewportHeightRef = useRef(0);

  // Para restauración desde editar
  const scrollFromEditRef = useRef(null);
  const pendingEditScrollRef = useRef(false);

  // Para restauraciones internas
  const restorationRef = useRef(null);

  // ======= Carga desde API =======
  const abortRef = useRef(null);
  const fetchCatedras = useCallback(async () => {
    try {
      setCargando(true);
      setError("");

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const url = `${BASE_URL}/api.php?action=catedras_list`;
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.exito) throw new Error(json.mensaje || "Error al obtener cátedras");

      const data = (json.catedras || []).map((c) => {
        const cur = (c.nombre_curso ?? "").toString().trim();
        const div = (c.nombre_division ?? "").toString().trim();
        const cursoDiv = `${cur} ${div}`;
        return {
          ...c,
          cursoDiv,
          _id: String(c.id_catedra || "").trim(),
          _materia: normalizar(c.materia),
          _docente: normalizar(c.docente || ""),
          _curso: normalizar(cur || ""),
          _division: normalizar(div || ""),
          _cursoDiv: normalizar(cursoDiv || ""),
        };
      });

      setCatedras(data);
    } catch (e) {
      if (e.name === "AbortError") return;
      console.error("Error cargando cátedras:", e);
      setError(`No se pudieron cargar las cátedras. ${e.message}`);
      setCatedras([]);
    } finally {
      setCargando(false);
    }
  }, []);

  /* ================================
     Al montar: leer sessionStorage ANTES de cargar datos
  ================================= */
  useEffect(() => {
    const stored = sessionStorage.getItem(SCROLL_KEY);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed > 0) {
        scrollFromEditRef.current = parsed;
        pendingEditScrollRef.current = true;
      }
      sessionStorage.removeItem(SCROLL_KEY);
    }
    fetchCatedras();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (q) {
      const nq = normalizar(q);
      res = res.filter(
        (c) =>
          c._id.includes(nq) ||
          c._materia.includes(nq) ||
          c._docente.includes(nq) ||
          c._curso.includes(nq) ||
          c._division.includes(nq) ||
          c._cursoDiv.includes(nq)
      );
    }

    if (cursoSel) {
      const ncur = normalizar(cursoSel);
      res = res.filter((c) => c._curso === ncur);
    }

    if (divisionSel) {
      const ndiv = normalizar(divisionSel);
      res = res.filter((c) => c._division === ndiv);
    }

    return res;
  }, [catedras, q, cursoSel, divisionSel]);

  /* ================================
     Helper: aplicar scroll a la lista
  ================================= */
  const aplicarScroll = useCallback((offset, itemCount) => {
    if (!listRef.current) return;
    const max = Math.max(0, itemCount * ITEM_SIZE - (viewportHeightRef.current || 0));
    const clamped = Math.min(Math.max(0, offset), max);
    listRef.current.scrollTo(clamped);
  }, []);

  /* ================================
     RESTAURAR SCROLL DESDE EDITAR/MODAL
     Espera a que cargando sea false y haya datos
  ================================= */
  useEffect(() => {
    if (!pendingEditScrollRef.current) return;
    if (cargando) return;
    if (catedrasFiltradas.length === 0) return;

    const target = scrollFromEditRef.current;
    if (target === null) return;

    pendingEditScrollRef.current = false;
    scrollFromEditRef.current = null;

    const timer = setTimeout(() => {
      aplicarScroll(target, catedrasFiltradas.length);
    }, 80);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, catedrasFiltradas.length]);

  /* ================================
     RESTAURAR SCROLL INTERNO
     (tras refrescar tabla por asignar docente, etc.)
  ================================= */
  useEffect(() => {
    const pending = restorationRef.current;
    if (!pending || pending.type !== "offset") return;
    if (cargando) return;
    if (catedrasFiltradas.length === 0) return;

    const target = pending.value;
    restorationRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        aplicarScroll(target, catedrasFiltradas.length);
      });
    });
  }, [catedrasFiltradas, cargando, aplicarScroll]);

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
    const puede =
      (hayFiltros || filtroActivo === "todos") &&
      catedrasFiltradas.length > 0 &&
      !cargando;
    if (!puede) return;

    const filas = catedrasFiltradas.map((c) => ({
      ID: c.id_catedra ?? "",
      Materia: c.materia ?? "",
      Curso: c.cursoDiv ?? "",
      Docente: c.docente ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(filas, {
      header: ["ID", "Materia", "Curso", "Docente"],
    });

    ws["!cols"] = [{ wch: 7 }, { wch: 28 }, { wch: 10 }, { wch: 28 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cátedras");

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/octet-stream" });

    const sufijo = filtroActivo === "todos" ? "Todos" : "Filtrados";
    saveAs(blob, `Catedras_${sufijo}_${yyyy}-${mm}-${dd}(${filas.length}).xlsx`);
  }, [catedrasFiltradas, cargando, hayFiltros, filtroActivo]);

  // ======= Modal =======
  const abrirModal = useCallback((catedra) => {
    // Guardar scroll antes de abrir el modal (por si recarga la tabla al cerrar)
    restorationRef.current = {
      type: "offset",
      value: savedScrollOffsetRef.current || 0,
    };
    setCatedraSel(catedra);
    setShowModal(true);
  }, []);

  const cerrarModal = useCallback(() => setShowModal(false), []);

  const refrescarTrasAsignar = useCallback(() => {
    fetchCatedras();
    mostrarToast("exito", "Docente asignado correctamente", 2200);
    cerrarModal();
  }, [fetchCatedras, mostrarToast, cerrarModal]);

  // ======= Track scroll =======
  const handleListScroll = useCallback(({ scrollOffset }) => {
    savedScrollOffsetRef.current = scrollOffset;
  }, []);

  // ======= Handlers (memo) =======
  const onChangeBusqueda = useCallback(
    (e) => {
      const val = e.target.value;
      setMostrarFiltros(false);
      startTransition(() => {
        setQInput(val);
        setFiltroActivo((val?.trim() || cursoSel || divisionSel) ? "filtros" : null);
      });
    },
    [startTransition, cursoSel, divisionSel]
  );

  const setCursoConFlag = useCallback(
    (cur) => {
      setCursoSel(cur);
      setFiltroActivo((qInput?.trim() || cur || divisionSel) ? "filtros" : null);
    },
    [qInput, divisionSel]
  );

  const setDivisionConFlag = useCallback(
    (div) => {
      setDivisionSel(div);
      setFiltroActivo((qInput?.trim() || cursoSel || div) ? "filtros" : null);
    },
    [qInput, cursoSel]
  );

  const limpiarFiltros = useCallback(() => {
    setQInput("");
    setCursoSel("");
    setDivisionSel("");
    setFiltroActivo(null);
  }, []);

  const mostrarTodos = useCallback(() => {
    setQInput("");
    setCursoSel("");
    setDivisionSel("");
    setFiltroActivo("todos");
    setMostrarFiltros(false);
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  // ======= Render =======
  const puedeExportar = useMemo(() => {
    return (
      (hayFiltros || filtroActivo === "todos") &&
      catedrasFiltradas.length > 0 &&
      !cargando
    );
  }, [hayFiltros, filtroActivo, catedrasFiltradas.length, cargando]);

  const contadorVisible =
    hayFiltros || filtroActivo === "todos" ? catedrasFiltradas.length : 0;

  return (
    <div className="glob-profesor-container" aria-busy={cargando || isPending}>
      <div className="glob-profesor-box">
        {/* Header */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Cátedras</span>

          {/* Buscador */}
          <div className="glob-search-input-container">
            <input
              id={listId}
              type="text"
              placeholder="Buscar por ID, materia, docente o curso (ej. 1A)"
              className="glob-search-input"
              value={qInput}
              onChange={onChangeBusqueda}
              disabled={cargando}
              autoComplete="off"
              inputMode="search"
            />
            {qInput ? (
              <FaTimes
                className="glob-clear-search-icon"
                onClick={() => {
                  setQInput("");
                  setFiltroActivo((cursoSel || divisionSel) ? "filtros" : null);
                }}
                role="button"
                aria-label="Limpiar búsqueda"
                tabIndex={0}
              />
            ) : null}
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
              <FaChevronDown
                className={`glob-chevron-icon ${mostrarFiltros ? "glob-rotate" : ""}`}
              />
            </button>

            {mostrarFiltros && (
              <div className="glob-filtros-menu" role="menu">
                {/* CURSO */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${openAcc.curso ? "is-open" : ""}`}
                    aria-expanded={openAcc.curso}
                    onClick={() => setOpenAcc((p) => ({ ...p, curso: !p.curso }))}
                  >
                    <span className="glob-filtros-group-title">
                      <FaChalkboardTeacher style={{ marginRight: 8 }} /> Filtrar por curso
                    </span>
                    <FaChevronDown
                      className={`glob-accordion-caret ${openAcc.curso ? "glob-rotate" : ""}`}
                    />
                  </button>

                  <div
                    className={`glob-filtros-group-body ${openAcc.curso ? "is-open" : ""}`}
                    style={{ display: openAcc.curso ? "block" : "none" }}
                  >
                    <div className="glob-grid-filtros">
                      {cursosUnicos.map((cur) => (
                        <button
                          key={`cur-${cur}`}
                          className={`glob-chip-filtro ${cursoSel === cur ? "glob-active" : ""}`}
                          onClick={() => {
                            setCursoConFlag(cur === cursoSel ? "" : cur);
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
                    className={`glob-filtros-group-header ${openAcc.division ? "is-open" : ""}`}
                    aria-expanded={openAcc.division}
                    onClick={() => setOpenAcc((p) => ({ ...p, division: !p.division }))}
                  >
                    <span className="glob-filtros-group-title">
                      <FaChalkboardTeacher style={{ marginRight: 8 }} /> Filtrar por división
                    </span>
                    <FaChevronDown
                      className={`glob-accordion-caret ${openAcc.division ? "glob-rotate" : ""}`}
                    />
                  </button>

                  <div
                    className={`glob-filtros-group-body ${openAcc.division ? "is-open" : ""}`}
                    style={{ display: openAcc.division ? "block" : "none" }}
                  >
                    <div className="glob-grid-filtros">
                      {divisionesUnicas.map((d) => (
                        <button
                          key={`div-${d}`}
                          className={`glob-chip-filtro ${divisionSel === d ? "glob-active" : ""}`}
                          onClick={() => {
                            setDivisionConFlag(d === divisionSel ? "" : d);
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

                <div
                  className="glob-filtros-menu-item glob-mostrar-todas"
                  onClick={mostrarTodos}
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
                  Cátedras: {contadorVisible}
                </span>
                <span className="glob-profesores-mobile">{contadorVisible}</span>
                <FaUsers className="glob-icono-profesor" />
              </div>

              {(qInput || cursoSel || divisionSel) && (
                <div className="glob-chips-container">
                  {qInput && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">
                        Búsqueda: {qInput}
                      </span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">
                        {qInput.length > 6 ? `${qInput.substring(0, 6)}…` : qInput}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => {
                          setQInput("");
                          setFiltroActivo((cursoSel || divisionSel) ? "filtros" : null);
                        }}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {cursoSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">Curso: {cursoSel}</span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => {
                          setCursoSel("");
                          setFiltroActivo((qInput?.trim() || divisionSel) ? "filtros" : null);
                        }}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {divisionSel && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text">Div: {divisionSel}</span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={() => {
                          setDivisionSel("");
                          setFiltroActivo((qInput?.trim() || cursoSel) ? "filtros" : null);
                        }}
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <button
                    className="glob-chip-mini glob-chip-clear-all"
                    onClick={limpiarFiltros}
                    title="Quitar todos los filtros"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TABLA (solo desktop) */}
          {isDesktop && (
            <div className="glob-box-table">
              <div className="glob-header" style={{ gridTemplateColumns: GRID_COLS }}>
                <div className="glob-column-header">ID</div>
                <div className="glob-column-header">Materia</div>
                <div className="glob-column-header">Curso</div>
                <div className="glob-column-header">Docente</div>
                <div className="glob-column-header">Acciones</div>
              </div>

              <div className="glob-body">
                {!hayFiltros && filtroActivo !== "todos" ? (
                  <div className="glob-no-data-message">
                    <div className="glob-message-content">
                      <FaFilter className="glob-empty-icon" aria-hidden="true" />
                      <p>Aplicá búsqueda o filtros para ver cátedras</p>
                      <button className="glob-btn-show-all" onClick={mostrarTodos}>
                        Mostrar todas
                      </button>
                    </div>
                  </div>
                ) : cargando ? (
                  <div className="glob-loading-spinner-container">
                    <div className="glob-loading-spinner" />
                  </div>
                ) : catedras.length === 0 ? (
                  <div className="glob-no-data-message">
                    <div className="glob-message-content">
                      <p>No hay cátedras registradas</p>
                    </div>
                  </div>
                ) : catedrasFiltradas.length === 0 ? (
                  <div className="glob-no-data-message">
                    <div className="glob-message-content">
                      <p>No hay resultados con los filtros actuales</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: "55vh", width: "100%" }}>
                    <AutoSizer>
                      {({ height, width }) => {
                        viewportHeightRef.current = height;
                        return (
                          <List
                            ref={listRef}
                            height={height}
                            width={width}
                            itemCount={catedrasFiltradas.length}
                            itemSize={ITEM_SIZE}
                            itemData={{
                              rows: catedrasFiltradas,
                              animacionActiva,
                              preCascada,
                              onOpenModal: abrirModal,
                            }}
                            overscanCount={12}
                            itemKey={(index, data) => data.rows[index]?._id ?? index}
                            onScroll={handleListScroll}
                          >
                            {Row}
                          </List>
                        );
                      }}
                    </AutoSizer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CARDS (solo mobile) */}
          {!isDesktop && (
            <div
              className={`glob-cards-wrapper ${
                animacionActiva && catedrasFiltradas.length <= MAX_CASCADE_ITEMS
                  ? "glob-cascade-animation"
                  : ""
              }`}
            >
              {!hayFiltros && filtroActivo !== "todos" ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <FaFilter className="glob-empty-icon" aria-hidden="true" />
                    <p>Usá la búsqueda o aplicá filtros para ver resultados</p>
                    <button className="glob-btn-show-all" onClick={mostrarTodos}>
                      Mostrar todas
                    </button>
                  </div>
                </div>
              ) : cargando ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <p>Cargando cátedras…</p>
                  </div>
                </div>
              ) : catedras.length === 0 ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <p>No hay cátedras registradas</p>
                  </div>
                </div>
              ) : catedrasFiltradas.length === 0 ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <p>No hay resultados con los filtros actuales</p>
                  </div>
                </div>
              ) : (
                catedrasFiltradas.map((c, i) => {
                  const willAnimate = animacionActiva && i < MAX_CASCADE_ITEMS;
                  const preMask2 = preCascada && i < MAX_CASCADE_ITEMS;
                  return (
                    <div
                      key={c._id}
                      className={`glob-card ${willAnimate ? "glob-cascade" : ""}`}
                      style={{
                        animationDelay: willAnimate ? `${i * 0.03}s` : "0s",
                        opacity: preMask2 ? 0 : undefined,
                        transform: preMask2 ? "translateY(8px)" : undefined,
                      }}
                    >
                      <div className="glob-card-header">
                        <h3 className="glob-card-title">
                          #{c.id_catedra} — {c.materia}
                        </h3>
                      </div>
                      <div className="glob-card-body">
                        <div className="glob-card-row">
                          <span className="glob-card-label">Curso</span>
                          <span className="glob-card-value">{c.cursoDiv}</span>
                        </div>
                        <div className="glob-card-row">
                          <span className="glob-card-label">Docente</span>
                          <span className="glob-card-value">{c.docente || "-"}</span>
                        </div>
                      </div>

                      <div className="glob-card-actions">
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
          )}
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
              id="excels-export"
              className="glob-profesor-button glob-hover-effect"
              onClick={exportarExcel}
              disabled={!puedeExportar}
              aria-label="Exportar"
              title={puedeExportar ? "Exportar a Excel" : "No hay filas visibles para exportar"}
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar a Excel</p>
            </button>
          </div>
        </div>
      </div>

      {/* Modal para asignar/editar docente */}
      <ModalAgregar
        open={showModal}
        catedra={catedraSel}
        onClose={cerrarModal}
        onAsignado={refrescarTrasAsignar}
      />

      {/* Toast global */}
      {toast.abierto && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast((t) => ({ ...t, abierto: false }))}
        />
      )}
    </div>
  );
};

export default Catedras;