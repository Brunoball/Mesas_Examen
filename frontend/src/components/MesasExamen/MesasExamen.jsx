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
  FaTable,
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
   Helpers para “Detalle (como PDF)”
================================ */
const mode = (arr = []) => {
  const counts = new Map();
  for (const v0 of arr) {
    const v = (v0 ?? "").toString().trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = "", max = -1;
  for (const [k, n] of counts) {
    if (n > max) { max = n; best = k; }
  }
  return best;
};

const nombreMes = (iso = "") => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return { dia: "", mesNum: "", anio: "", mesTxt: "" };
  const meses = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  return { dia: m[3], mesNum: m[2], anio: m[1], mesTxt: meses[parseInt(m[2], 10) - 1] || "" };
};

const diaSemana = (iso) => {
  const dias = ["DOMINGO","LUNES","MARTES","MIERCOLES","JUEVES","VIERNES","SABADO"];
  const d = new Date(`${iso || ""}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : dias[d.getDay()] || "";
};

const horaPorTurno = (turno = "", fallback = "07:30 HS.") => {
  const t = normalizar(turno);
  if (t.includes("man")) return "07:30 HS.";
  if (t.includes("tar")) return "13:30 HS.";
  return fallback;
};

const limpiarCurso = (s) => String(s ?? "")
  .replace(/°\s*°/g, "°")
  .replace(/\s{2,}/g, " ")
  .trim();

/** Construye “mesas lógicas” (igual que el PDF) a partir del detalle del backend */
function buildMesasLogicas({ detalle, agrupaciones, id_grupo }) {
  const subMesas = (Array.isArray(detalle) ? detalle : []).map((m) => ({
    numero_mesa: m.numero_mesa ?? null,
    fecha: m.fecha ?? "",
    turno: m.turno ?? "",
    hora: m.hora ?? "",
    materia: m.materia ?? "",
    docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
    alumnos: Array.isArray(m.alumnos)
      ? m.alumnos.map((a) => ({ alumno: a.alumno ?? "", dni: a.dni ?? "", curso: a.curso ?? "" }))
      : [],
  }));

  // Si viene id_grupo, la agrupación es la unión de todos los sub números.
  let agrupacionesEfectivas = [];
  if (Array.isArray(agrupaciones) && agrupaciones.length) {
    agrupacionesEfectivas = agrupaciones
      .map((arr) => (arr || []).map((n) => parseInt(n, 10)).filter(Number.isFinite))
      .filter((a) => a.length);
  } else if (id_grupo != null) {
    const setNums = new Set(subMesas.map(x => parseInt(x.numero_mesa, 10)).filter(Number.isFinite));
    agrupacionesEfectivas = [Array.from(setNums).sort((a,b)=>a-b)];
  } else {
    agrupacionesEfectivas = [Array.from(new Set(subMesas.map(sm => sm.numero_mesa))).filter(Boolean).sort((a,b)=>a-b)];
  }

  const buildMesaLogicaFrom = (arr) => {
    const fechaStar = mode(arr.map(x => x.fecha)) || (arr.find(x => x.fecha)?.fecha || "");
    const turnoStar = mode(arr.map(x => x.turno)) || (arr.find(x => x.turno)?.turno || "");
    const materiaStar = mode(arr.map(x => x.materia)) || (arr[0]?.materia || "");
    const subNumeros = [...new Set(arr.map(x => x.numero_mesa).filter(v => v != null))].sort((a,b)=>a-b);

    // Mapa Docente -> Materia -> alumnos[]
    const DOC_FALLBACK = "—";
    const mapa = new Map();
    const add = (doc, mat, al) => {
      if (!mapa.has(doc)) mapa.set(doc, new Map());
      const m2 = mapa.get(doc);
      if (!m2.has(mat)) m2.set(mat, []);
      m2.get(mat).push(...al);
    };
    for (const sm of arr) {
      const docentesSM = sm.docentes?.length ? sm.docentes : [DOC_FALLBACK];
      for (const d of docentesSM) add(d, sm.materia || "", sm.alumnos || []);
    }

    // Bloques (Materia -> Docente) con alumnos dedupe
    const bloques = [];
    const docentes = [...mapa.keys()];
    const materiasSet = new Set();
    for (const d of docentes) for (const mat of mapa.get(d).keys()) materiasSet.add(mat);
    const materiasOrden = [...materiasSet].sort((A,B)=>String(A).localeCompare(String(B),"es",{sensitivity:"base"}));

    for (const mat of materiasOrden) {
      const dQueTienen = docentes.filter(d => mapa.get(d).has(mat))
        .sort((A,B)=>String(A).localeCompare(String(B),"es",{sensitivity:"base"}));
      for (const d of dQueTienen) {
        const a = mapa.get(d).get(mat) || [];
        const uniq = Array.from(new Map(a.map(x => [(x.dni || x.alumno || Math.random()), x])).values());
        uniq.sort((A,B)=>String(A.alumno).localeCompare(String(B.alumno), "es", { sensitivity: "base" }));
        bloques.push({ docente: d, materia: mat, alumnos: uniq });
      }
    }
    return { fecha: fechaStar, turno: turnoStar, materia: materiaStar, subNumeros, bloques };
  };

  const mesasLogicas = [];
  for (const nums of agrupacionesEfectivas) {
    const setNums = new Set(nums);
    const arr = subMesas.filter(sm => setNums.has(sm.numero_mesa));
    if (!arr.length) continue;
    mesasLogicas.push(buildMesaLogicaFrom(arr));
  }

  // Orden por fecha, turno (Mañana/Tarde), primer número
  const turnRank = (t) => (normalizar(t).includes("man") ? 0 : 1);
  mesasLogicas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    const ta = turnRank(a.turno), tb = turnRank(b.turno);
    if (ta !== tb) return ta - tb;
    return (a.subNumeros[0] ?? 0) - (b.subNumeros[0] ?? 0);
  });
  return mesasLogicas;
}

/* ================================
   Componente Mesas de Examen
================================ */
const MesasExamen = () => {
  const navigate = useNavigate();

  // Vistas superiores
  const [vista, setVista] = useState("grupos"); // "grupos" | "no-agrupadas"
  const [vistaTabla, setVistaTabla] = useState("detalle"); // "detalle" (como PDF) | "resumen"

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
    } catch {/* noop */}
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

  // Animación en cascada ante cambios de filtros (sólo para resumen)
  useEffect(() => {
    if (vistaTabla !== "resumen") return;
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
  }, [qDebounced, fechaSel, turnoSel, vista, vistaTabla]);

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

  /* =======================================================
   *  Exportar Excel — DETALLADO (mismo endpoint que el PDF)
   * ======================================================= */
  const exportarExcel = useCallback(async () => {
    try {
      if (!filasFiltradas.length) return;

      // Fallback por N° mesa a partir de lo visible
      const setNums = new Set();
      for (const g of filasFiltradas) {
        [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
          .filter((n) => n != null)
          .map(Number)
          .forEach((n) => setNums.add(n));
      }
      const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);
      if (!numerosOrdenados.length) {
        notify({ tipo: "warning", mensaje: "No hay números de mesa visibles para exportar." });
        return;
      }

      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_detalle_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeros_mesa: numerosOrdenados }),
      });

      const raw = await resp.text();
      let json;
      try { json = JSON.parse(raw); } catch {
        throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
      }
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || "No se pudo obtener el detalle para Excel.");
      }

      const detalle = Array.isArray(json.data) ? json.data : [];
      if (!detalle.length) {
        notify({ tipo: "warning", mensaje: "El servidor no devolvió detalle para exportar." });
        return;
      }

      // Convertir a filas planas (Docente×Alumno) para Excel
      const limpiarCursoX = (s) => String(s ?? "")
        .replace(/°\s*°/g, "°")
        .replace(/\s{2,}/g, " ")
        .trim();

      const turnoRank = (t) => {
        const x = (t || "").toLowerCase();
        if (x.includes("mañ") || x.includes("man")) return 0;
        if (x.includes("tar")) return 1;
        return 2;
      };

      const horaX = (t, fallback = "") => {
        const x = (t || "").toLowerCase();
        if (x.includes("mañ") || x.includes("man")) return "07:30";
        if (x.includes("tar")) return "13:30";
        return fallback;
      };

      // Mapa de fallback fecha/turno por número desde la grilla
      const mapaNumero = new Map();
      for (const g of filasFiltradas) {
        [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
          .filter((n) => n != null)
          .map(Number)
          .forEach((n) => {
            if (!mapaNumero.has(n)) {
              mapaNumero.set(n, { id_grupo: g.id_grupo ?? null, fecha: g.fecha ?? "", turno: g.turno ?? "" });
            }
          });
      }

      const filas = [];
      for (const m of detalle) {
        const numeroMesa = m.numero_mesa ?? null;
        const fb = mapaNumero.get(numeroMesa) || { id_grupo: "", fecha: "", turno: "" };
        const fechaISO = m.fecha || fb.fecha || "";
        const turno    = m.turno || fb.turno || "";
        const idGrupo  = fb.id_grupo ?? "";
        const horaCalc = horaX(turno, m.hora ?? "");
        const materia  = m.materia ?? "";
        const docentes = Array.isArray(m.docentes) && m.docentes.length ? m.docentes : ["—"];
        const alumnos  = Array.isArray(m.alumnos) && m.alumnos.length
          ? m.alumnos
          : [{ alumno: "—", dni: "—", curso: "—" }];

        for (const d of docentes) {
          for (const a of alumnos) {
            filas.push({
              "ID Grupo": idGrupo || "",
              "N° Mesa": numeroMesa ?? "",
              Fecha: fechaISO ? formatearFechaISO(fechaISO) : "",
              Turno: turno || "",
              Hora: horaCalc,
              "Espacio Curricular": materia || "",
              Docente: d || "—",
              Estudiante: a?.alumno || "—",
              DNI: a?.dni || "—",
              Curso: limpiarCursoX(a?.curso || "—"),
              _sortFechaISO: fechaISO || "9999-12-31",
              _sortTurnoRank: turnoRank(turno),
            });
          }
        }
      }

      filas.sort((A, B) => {
        if (A._sortFechaISO !== B._sortFechaISO) return A._sortFechaISO < B._sortFechaISO ? -1 : 1;
        if (A._sortTurnoRank !== B._sortTurnoRank) return A._sortTurnoRank - B._sortTurnoRank;
        const nA = parseInt(A["N° Mesa"] || 0, 10);
        const nB = parseInt(B["N° Mesa"] || 0, 10);
        if (nA !== nB) return nA - nB;
        const d = String(A.Docente || "").localeCompare(String(B.Docente || ""), "es", { sensitivity: "base" });
        if (d !== 0) return d;
        return String(A.Estudiante || "").localeCompare(String(B.Estudiante || ""), "es", { sensitivity: "base" });
      });

      const filasFinales = filas.map(({ _sortFechaISO, _sortTurnoRank, ...rest }) => rest);
      const headers = [
        "ID Grupo","N° Mesa","Fecha","Turno","Hora","Espacio Curricular",
        "Docente","Estudiante","DNI","Curso"
      ];

      const ws = XLSX.utils.json_to_sheet(filasFinales, { header: headers });
      ws["!cols"] = [
        { wch: 10 }, { wch: 9 }, { wch: 12 }, { wch: 10 }, { wch: 9 },
        { wch: 28 }, { wch: 26 }, { wch: 28 }, { wch: 12 }, { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        vista === "grupos" ? "Mesas (detalle)" : "No agrupadas (detalle)"
      );

      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/octet-stream" });

      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const nombre =
        vista === "grupos"
          ? `MesasDeExamen_Detalle_${yyyy}-${mm}-${dd}(${filasFinales.length} filas).xlsx`
          : `MesasNoAgrupadas_Detalle_${yyyy}-${mm}-${dd}(${filasFinales.length} filas).xlsx`;
      saveAs(blob, nombre);

      notify({ tipo: "exito", mensaje: `Exportadas ${filasFinales.length} filas detalladas.` });
    } catch (e) {
      console.error("Excel detalle — error:", e);
      notify({ tipo: "error", mensaje: e?.message || "No se pudo exportar el Excel detallado." });
    }
  }, [filasFiltradas, notify, vista]);

  // ===== Exportar PDF SOLO del registro (fila actual) =====
  const exportarPDFDeRegistro = useCallback(
    (g) => {
      if (!g) return;

      const logoPath = `${window.location.origin}/img/Escudo.png`;

      if (vista === "grupos" && g.id_grupo != null) {
        const agrupaciones = [[
          g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4,
        ].filter((n) => n != null).map(Number)];

        generarPDFMesas({
          mesasFiltradas: [],
          agrupaciones,
          id_grupo: g.id_grupo,
          baseUrl: BASE_URL,
          notify,
          logoPath,
        });
        return;
      }

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

  /* =======================================================
   *  DETALLE (como PDF): fetch + render de “mesas lógicas”
   * ======================================================= */
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [mesasDetalle, setMesasDetalle] = useState([]); // arreglo de mesas lógicas

  const recargarDetalle = useCallback(async () => {
    try {
      setLoadingDetalle(true);
      setMesasDetalle([]);

      if (!filasFiltradas.length) return;

      // Reunir todos los números visibles + armar agrupaciones por fila visible
      const agrupaciones = filasFiltradas.map((g) =>
        [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
          .filter((n) => n != null)
          .map(Number)
      );

      const setNums = new Set();
      for (const arr of agrupaciones) for (const n of arr) setNums.add(n);
      const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);

      const payload = vista === "grupos" && filasFiltradas.length === 1 && filasFiltradas[0].id_grupo != null
        ? { id_grupo: filasFiltradas[0].id_grupo }
        : { numeros_mesa: numerosOrdenados };

      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_detalle_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await resp.text();
      let json;
      try { json = JSON.parse(raw); } catch {
        throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
      }
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || "No se pudo obtener el detalle.");
      }
      const detalle = Array.isArray(json.data) ? json.data : [];
      if (!detalle.length) {
        notify({ tipo: "warning", mensaje: "No hay detalle para mostrar." });
        return;
      }

      const mesasLogicas = buildMesasLogicas({
        detalle,
        agrupaciones,
        id_grupo: payload.id_grupo ?? null,
      });
      setMesasDetalle(mesasLogicas);
    } catch (e) {
      console.error(e);
      notify({ tipo: "error", mensaje: e?.message || "No se pudo cargar el detalle." });
    } finally {
      setLoadingDetalle(false);
    }
  }, [filasFiltradas, notify, vista]);

  // Recalcular el detalle al cambiar filtros o vista
  useEffect(() => {
    if (vistaTabla !== "detalle") return;
    recargarDetalle();
  }, [recargarDetalle, vistaTabla]);

  /* ======================
   *  Fila (RESUMEN actual)
   * ====================== */
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
    const willAnimate = vistaTabla === "resumen" && animacionActiva && index < MAX_CASCADE_ITEMS;
    const preMask = vistaTabla === "resumen" && preCascada && index < MAX_CASCADE_ITEMS;

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

  /* ======================
   *  Render
   * ====================== */
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
            <button className="glob-search-button" type="button" title="Buscar">
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
                  <span className="glob-profesores-mobile">
                    {filasFiltradas.length}
                  </span>
                  <FaUsers className="glob-icono-profesor" />
                </div>

                {/* TABS vista datasets */}
                <div className="glob-tabs glob-tabs--inline" role="tablist" aria-label="Cambiar vista">
                  <button
                    className={`glob-tab ${vista === "grupos" ? "glob-tab--active" : ""}`}
                    onClick={() => { setVista("grupos"); }}
                    title="Ver grupos armados"
                    aria-pressed={vista === "grupos"}
                    role="tab"
                  >
                    <FaLayerGroup style={{ marginRight: 6 }} />
                    Grupos
                  </button>
                  <button
                    className={`glob-tab ${vista === "no-agrupadas" ? "glob-tab--active" : ""}`}
                    onClick={() => { setVista("no-agrupadas"); }}
                    title="Ver mesas no agrupadas"
                    aria-pressed={vista === "no-agrupadas"}
                    role="tab"
                  >
                    <FaUnlink style={{ marginRight: 6 }} />
                    No agrupadas
                  </button>
                </div>

                {/* TABS vista tabla */}
                <div className="glob-tabs glob-tabs--inline" role="tablist" aria-label="Cambiar visualización">
                  <button
                    className={`glob-tab ${vistaTabla === "detalle" ? "glob-tab--active" : ""}`}
                    onClick={() => setVistaTabla("detalle")}
                    title="Ver Detalle (como PDF)"
                    aria-pressed={vistaTabla === "detalle"}
                    role="tab"
                  >
                    <FaTable style={{ marginRight: 6 }} />
                    Detalle (como PDF)
                  </button>
                  <button
                    className={`glob-tab ${vistaTabla === "resumen" ? "glob-tab--active" : ""}`}
                    onClick={() => setVistaTabla("resumen")}
                    title="Ver Resumen"
                    aria-pressed={vistaTabla === "resumen"}
                    role="tab"
                  >
                    Resumen
                  </button>
                </div>
              </div>

              {/* CHIPS filtros */}
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

          {/* ----- VISTA DETALLE (como PDF) ----- */}
          {vistaTabla === "detalle" && (
            <div className="glob-box-table" style={{ padding: 0 }}>
              {cargandoVista || loadingDetalle ? (
                <div className="glob-loading-spinner-container" style={{ height: "50vh" }}>
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
              ) : !mesasDetalle.length ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content">
                    <p>No hay detalle para mostrar.</p>
                  </div>
                </div>
              ) : (
                <div className="glob-detalle-wrapper" style={{ padding: "8px 10px" }}>
                  {mesasDetalle.map((mesa, idxMesa) => {
                    const { dia, mesTxt, anio } = nombreMes(mesa.fecha);
                    const headerTitulo = `MESAS DE EXAMEN ${mesTxt ? mesTxt + " " : ""}${anio || ""}`.trim();
                    const sub =
                      `${diaSemana(mesa.fecha)} ${String(dia).padStart(2,"0")} - ` +
                      `${String(mesa.turno || "").toUpperCase()} - ${horaPorTurno(mesa.turno)}`;

                    // preparar “segmentos contiguos” para fusionar celdas Materia y Docente
                    const nRowsPorBloque = mesa.bloques.map(b => Math.max(1, b.alumnos.length));
                    const totalRows = nRowsPorBloque.reduce((a,b)=>a+b,0);

                    const segMateria = [];
                    let curMat = null, accMat = 0, startMat = 0, rowCursor = 0;
                    for (let i = 0; i < mesa.bloques.length; i++) {
                      const mat = mesa.bloques[i].materia || "";
                      const n = nRowsPorBloque[i];
                      if (curMat === null) { curMat = mat; startMat = rowCursor; accMat = 0; }
                      if (mat !== curMat) {
                        segMateria.push({ materia: curMat, startRow: startMat, rowSpan: accMat });
                        curMat = mat; startMat = rowCursor; accMat = 0;
                      }
                      accMat += n; rowCursor += n;
                    }
                    if (curMat !== null) segMateria.push({ materia: curMat, startRow: startMat, rowSpan: accMat });

                    const segDocente = [];
                    let curDoc = null, accDoc = 0, startDoc = 0, rowCursor2 = 0;
                    for (let i = 0; i < mesa.bloques.length; i++) {
                      const doc = mesa.bloques[i].docente || "—";
                      const n = nRowsPorBloque[i];
                      if (curDoc === null) { curDoc = doc; startDoc = rowCursor2; accDoc = 0; }
                      if (doc !== curDoc) {
                        segDocente.push({ docente: curDoc, startRow: startDoc, rowSpan: accDoc });
                        curDoc = doc; startDoc = rowCursor2; accDoc = 0;
                      }
                      accDoc += n; rowCursor2 += n;
                    }
                    if (curDoc !== null) segDocente.push({ docente: curDoc, startRow: startDoc, rowSpan: accDoc });

                    // mapa rápido para saber dónde dibujar celdas fusionadas
                    const materiaStart = new Map(segMateria.map(s => [s.startRow, s]));
                    const docenteStart = new Map(segDocente.map(s => [s.startRow, s]));

                    // construir filas HTML
                    const rowsHTML = [];
                    let filaGlobal = 0;
                    for (let bi = 0; bi < mesa.bloques.length; bi++) {
                      const bloque = mesa.bloques[bi];
                      const n = nRowsPorBloque[bi];

                      for (let i = 0; i < n; i++) {
                        const a = bloque.alumnos[i] || { alumno: "—", dni: "—", curso: "—" };
                        const celdas = [];

                        if (filaGlobal === 0) {
                          // Hora comprimida (se apila texto en líneas) – ocupa todas las filas
                          const horaCell = (
                            <td key="hora" rowSpan={Math.max(totalRows,1)} style={{ whiteSpace: "pre-line", textAlign: "center", fontWeight: 700 }}>
                              {`${diaSemana(mesa.fecha)}\n${String(dia).padStart(2,"0")}\n${mesTxt}\n${String(mesa.turno || "").toUpperCase()}\n${horaPorTurno(mesa.turno)}`}
                            </td>
                          );
                          celdas.push(horaCell);
                        }

                        const mStart = materiaStart.get(filaGlobal);
                        if (mStart) {
                          celdas.push(
                            <td key={`mat-${filaGlobal}`} rowSpan={mStart.rowSpan || 1} style={{ fontWeight: 700 }}>
                              {String(mStart.materia || "")}
                            </td>
                          );
                        }

                        celdas.push(<td key={`al-${filaGlobal}`}>{String(a.alumno || "")}</td>);
                        celdas.push(<td key={`dni-${filaGlobal}`} style={{ textAlign: "center" }}>{String(a.dni || "")}</td>);
                        celdas.push(<td key={`cur-${filaGlobal}`} style={{ textAlign: "center" }}>{limpiarCurso(a.curso)}</td>);

                        const dStart = docenteStart.get(filaGlobal);
                        if (dStart) {
                          celdas.push(
                            <td key={`doc-${filaGlobal}`} rowSpan={dStart.rowSpan || 1} style={{ fontWeight: 700 }}>
                              {String(dStart.docente || "—")}
                            </td>
                          );
                        }

                        rowsHTML.push(<tr key={`r-${idxMesa}-${filaGlobal}`}>{celdas}</tr>);
                        filaGlobal++;
                      }
                    }

                    if (totalRows === 0) {
                      rowsHTML.push(
                        <tr key={`r-empty-${idxMesa}`}>
                          <td style={{ whiteSpace: "pre-line", textAlign: "center", fontWeight: 700 }}>
                            {`${diaSemana(mesa.fecha)}\n${String(dia).padStart(2,"0")}\n${mesTxt}\n${String(mesa.turno || "").toUpperCase()}\n${horaPorTurno(mesa.turno)}`}
                          </td>
                          <td style={{ fontWeight: 700 }}>{mesa.materia || "—"}</td>
                          <td>—</td>
                          <td style={{ textAlign: "center" }}>—</td>
                          <td style={{ textAlign: "center" }}>—</td>
                          <td>—</td>
                        </tr>
                      );
                    }

                    return (
                      <div key={`mesa-${idxMesa}`} className="mesa-detalle-box" style={{ background: "#fff", borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.06)", marginBottom: 16, padding: 12 }}>
                        {/* Header “idéntico” al PDF */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <img src={`${window.location.origin}/img/Escudo.png`} alt="Logo" style={{ width: 40, height: 40 }} />
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{headerTitulo}</div>
                              <div style={{ fontSize: 12, opacity: .85 }}>IPET N° 50 "Ing. Emilio F. Olmos"</div>
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{sub}</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                              <strong>N° de mesa:</strong> {mesa.subNumeros.join(" • ") || "—"}
                            </div>
                          </div>
                        </div>

                        {/* Tabla como el PDF */}
                        <div style={{ overflowX: "auto", marginTop: 10 }}>
                          <table className="tabla-detalle-mesa" style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#f0f0f0" }}>
                                <th style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>Hora</th>
                                <th style={{ padding: 6, border: "1px solid #ddd", textAlign: "left" }}>Espacio Curricular</th>
                                <th style={{ padding: 6, border: "1px solid #ddd", textAlign: "left" }}>Estudiante</th>
                                <th style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>DNI</th>
                                <th style={{ padding: 6, border: "1px solid #ddd", textAlign: "center" }}>Curso</th>
                                <th style={{ padding: 6, border: "1px solid #ddd", textAlign: "left" }}>Docentes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowsHTML}
                            </tbody>
                          </table>
                        </div>

                        {/* Acciones rápidas por mesa/agrupación */}
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                          <button
                            className="glob-iconchip"
                            title="Exportar esta mesa a PDF"
                            onClick={() => {
                              const agrupacion = [mesa.subNumeros];
                              generarPDFMesas({
                                mesasFiltradas: mesa.subNumeros.map(n => ({ numero_mesa: n })),
                                agrupaciones: agrupacion,
                                baseUrl: BASE_URL,
                                notify,
                                logoPath: `${window.location.origin}/img/Escudo.png`,
                              });
                            }}
                            aria-label="Exportar PDF de esta mesa"
                          >
                            <FaFilePdf />&nbsp; PDF (esta mesa)
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ----- VISTA RESUMEN (tu grilla original) ----- */}
          {vistaTabla === "resumen" && (
            <div className="glob-box-table">
              <div className="glob-header glob-header-mesas">
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
                            return `${vista}-${r.id ?? r.id_grupo}-${r.fecha || "sinf"}-${r.id_turno || 0}`;
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
                  ? "Exportar Excel (detalle completo por mesa)"
                  : "No hay filas visibles para exportar"
              }
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar Excel</p>
            </button>

            {/* PDF general (TODAS las visibles): una hoja por mesa */}
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => {
                if (!filasFiltradas.length) return;

                const agrupaciones = filasFiltradas.map((g) =>
                  [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
                    .filter((n) => n != null)
                    .map(Number)
                );

                const setNums = new Set();
                for (const arr of agrupaciones) for (const n of arr) setNums.add(n);
                const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);

                generarPDFMesas({
                  mesasFiltradas: numerosOrdenados.map((n) => ({ numero_mesa: n })),
                  agrupaciones,
                  baseUrl: BASE_URL,
                  notify,
                  logoPath: `${window.location.origin}/img/Escudo.png`,
                });
              }}
              disabled={!filasFiltradas.length}
              aria-label="Exportar PDF"
              title="Exportar PDF (una hoja por mesa)"
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
            if (vistaTabla === "detalle") await recargarDetalle();
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
          onSuccess={async () => {
            setAbrirEliminar(false);
            await fetchGrupos();
            await fetchNoAgrupadas();
            if (vistaTabla === "detalle") await recargarDetalle();
            notify({ tipo: "exito", mensaje: "Mesas eliminadas correctamente" });
          }}
          onError={(mensaje) =>
            notify({ tipo: "error", mensaje: mensaje || "No se pudieron eliminar las mesas." })
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
          onSuccess={async () => {
            setAbrirEliminarUno(false);
            await fetchGrupos();
            await fetchNoAgrupadas();
            if (vistaTabla === "detalle") await recargarDetalle();
            notify({ tipo: "exito", mensaje: "Mesa eliminada." });
          }}
          onError={(mensaje) =>
            notify({ tipo: "error", mensaje: mensaje || "No se pudo eliminar la mesa." })}
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
