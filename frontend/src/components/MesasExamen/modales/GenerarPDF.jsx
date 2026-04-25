// src/components/MesasExamen/modales/GenerarPDF.jsx
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Genera el PDF de mesas apilando múltiples tablas por página.
 *
 * Reglas:
 * - Header fijo por página.
 * - Sin caption extra por mesa.
 * - NO fuerza hoja nueva al cambiar la fecha.
 * - Si una mesa entra completa en el espacio actual, se imprime ahí.
 * - Si no entra ahí pero sí entra completa en hoja nueva, se mueve entera.
 * - Si necesariamente ocupa varias hojas, solo empieza si hay espacio real
 *   para cabecera + cuerpo útil, evitando cabeceras huérfanas.
 */
export async function generarPDFMesas({
  mesasFiltradas,
  baseUrl,
  notify,
  logoPath,
  id_grupo = null,
  agrupaciones = null,
  pdfTituloBase = "MESAS DE EXAMEN",
  pdfTituloExtra = "",
}) {
  /* =================== Utils =================== */
  const normalizar = (s = "") =>
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const mode = (arr = []) => {
    const counts = new Map();
    for (const v0 of arr) {
      const v = (v0 ?? "").toString().trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best = "";
    let max = -1;
    for (const [k, n] of counts) {
      if (n > max) {
        max = n;
        best = k;
      }
    }
    return best;
  };

  const NOMBRE_MES = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return { dia: "", mesNum: "", anio: "", mes: "" };

    const meses = [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ];

    return {
      dia: m[3],
      mesNum: m[2],
      anio: m[1],
      mes: meses[parseInt(m[2], 10) - 1] || "",
    };
  };

  const DIA_SEMANA = (iso) => {
    const dias = [
      "DOMINGO",
      "LUNES",
      "MARTES",
      "MIÉRCOLES",
      "JUEVES",
      "VIERNES",
      "SÁBADO",
    ];
    const d = new Date(`${iso || ""}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "" : dias[d.getDay()] || "";
  };

  const HORA_POR_TURNO = (turno = "", fallback = "07:30 HS.") => {
    const t = normalizar(turno);
    if (t.includes("man")) return "07:30 HS.";
    if (t.includes("tar")) return "13:30 HS.";
    return fallback;
  };

  const HORA_DESDE_DB = (hora = "", turno = "", fallback = "07:30 HS.") => {
    const raw = (hora ?? "").toString().trim();
    if (raw) {
      const parts = raw.split(":");
      const hh = parts?.[0] ?? "";
      const mm = parts?.[1] ?? "";
      if (hh && mm) return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")} HS.`;
    }
    return HORA_POR_TURNO(turno, fallback);
  };

  const loadHTMLImage = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  const fitImage = (img, maxW, maxH) => {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const r = Math.min(maxW / iw, maxH / ih);
    return { w: Math.round(iw * r), h: Math.round(ih * r) };
  };

  const getNumerosDeMesas = (filas = []) => {
    const s = new Set();
    for (const r of filas || []) {
      for (const k of [
        "numero_mesa",
        "numeroMesa",
        "id_mesa",
        "id_mesa_repr",
        "id",
      ]) {
        const n = parseInt(r?.[k], 10);
        if (Number.isFinite(n) && n > 0) {
          s.add(n);
          break;
        }
      }
    }
    return [...s].sort((a, b) => a - b);
  };

  const limpiarCurso = (s) => {
    let out = String(s ?? "");
    out = out.replace(/°\s*°/g, "°");
    out = out.replace(/\s{2,}/g, " ");
    return out.trim();
  };

  /* ==============================
     ORDEN CORRECTO DE ALUMNOS
     Curso -> División -> Apellido -> Nombre -> DNI
  ============================== */
  const cursoKey = (cursoRaw = "") => {
    const c = limpiarCurso(cursoRaw);
    const s = c.replace(/\s+/g, " ").trim().toUpperCase();

    const mYear = s.match(/(\d{1,2})/);
    const year = mYear ? parseInt(mYear[1], 10) : 999;

    let divToken = "";
    const afterYear = s.slice(mYear ? mYear.index + mYear[1].length : 0);
    const mDiv = afterYear.match(/^\s*°?\s*([A-ZÑ0-9]{1,3})/i);
    if (mDiv && mDiv[1]) divToken = String(mDiv[1]).toUpperCase();

    const divIsNum = /^\d+$/.test(divToken);
    const divNum = divIsNum ? parseInt(divToken, 10) : null;

    return {
      year: Number.isFinite(year) ? year : 999,
      divToken: divToken || "Z",
      divIsNum,
      divNum,
    };
  };

  const compararDivision = (a, b) => {
    if (a.divIsNum && b.divIsNum) return (a.divNum ?? 999) - (b.divNum ?? 999);
    if (a.divIsNum && !b.divIsNum) return -1;
    if (!a.divIsNum && b.divIsNum) return 1;
    return String(a.divToken || "").localeCompare(String(b.divToken || ""), "es", {
      sensitivity: "base",
      numeric: true,
    });
  };

  const apellidoKey = (nombreRaw = "") => {
    const s = String(nombreRaw ?? "").trim();
    if (!s) return "";
    const idx = s.indexOf(",");
    if (idx >= 0) return s.slice(0, idx).trim().toUpperCase();
    return s.split(/\s+/)[0].trim().toUpperCase();
  };

  const compararAlumnoCursoDivisionApellido = (A, B) => {
    const cA = cursoKey(A?.curso);
    const cB = cursoKey(B?.curso);

    if (cA.year !== cB.year) return cA.year - cB.year;

    const divCmp = compararDivision(cA, cB);
    if (divCmp !== 0) return divCmp;

    const apA = apellidoKey(A?.alumno);
    const apB = apellidoKey(B?.alumno);
    const apCmp = apA.localeCompare(apB, "es", { sensitivity: "base" });
    if (apCmp !== 0) return apCmp;

    const nA = String(A?.alumno ?? "");
    const nB = String(B?.alumno ?? "");
    const nCmp = nA.localeCompare(nB, "es", { sensitivity: "base" });
    if (nCmp !== 0) return nCmp;

    const dA = String(A?.dni ?? "");
    const dB = String(B?.dni ?? "");
    return dA.localeCompare(dB, "es", { sensitivity: "base" });
  };

  const TITULO_FINAL = (() => {
    const base = String(pdfTituloBase || "MESAS DE EXAMEN").trim();
    const extra = String(pdfTituloExtra || "").trim();
    return extra ? `${base} ${extra}` : base;
  })();

  try {
    /* =================== Payload =================== */
    let numerosNecesarios = [];
    let payload;

    if (Array.isArray(agrupaciones) && agrupaciones.length) {
      const s = new Set();
      for (const arr of agrupaciones) {
        for (const n of arr || []) {
          const nn = parseInt(n, 10);
          if (Number.isFinite(nn)) s.add(nn);
        }
      }
      numerosNecesarios = Array.from(s).sort((a, b) => a - b);
    } else if (!id_grupo && mesasFiltradas?.length) {
      numerosNecesarios = getNumerosDeMesas(mesasFiltradas);
    }

    if (id_grupo != null) {
      payload = { id_grupo };
    } else {
      if (!numerosNecesarios.length) {
        notify?.({
          tipo: "warning",
          mensaje: "No hay números de mesa para exportar.",
        });
        return;
      }
      payload = { numeros_mesa: numerosNecesarios };
    }

    /* =================== Backend =================== */
    const resp = await fetch(`${baseUrl}/api.php?action=mesas_detalle_pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await resp.text();
    let json;

    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
    }

    if (!resp.ok || !json?.exito) {
      throw new Error(json?.mensaje || "No se pudo obtener el detalle.");
    }

    const subMesas = (Array.isArray(json.data) ? json.data : []).map((m) => ({
      numero_mesa: m.numero_mesa ?? null,
      fecha: m.fecha ?? "",
      turno: m.turno ?? "",
      hora: m.hora ?? "",
      materia: m.materia ?? "",
      docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
      alumnos: Array.isArray(m.alumnos)
        ? m.alumnos.map((a) => ({
            alumno: a.alumno ?? "",
            dni: a.dni ?? "",
            curso: a.curso ?? "",
          }))
        : [],
    }));

    if (!subMesas.length) {
      notify?.({ tipo: "warning", mensaje: "No hay detalle para exportar." });
      return;
    }

    /* =================== Agrupaciones efectivas =================== */
    let agrupacionesEfectivas = [];

    if (Array.isArray(agrupaciones) && agrupaciones.length) {
      agrupacionesEfectivas = agrupaciones
        .map((arr) =>
          (arr || []).map((n) => parseInt(n, 10)).filter(Number.isFinite)
        )
        .filter((a) => a.length);
    } else if (id_grupo != null) {
      const setNums = new Set(
        subMesas
          .map((x) => parseInt(x.numero_mesa, 10))
          .filter(Number.isFinite)
      );
      agrupacionesEfectivas = [Array.from(setNums).sort((a, b) => a - b)];
    } else {
      agrupacionesEfectivas = [numerosNecesarios];
    }

    const buildMesaLogicaFrom = (arr) => {
      const fechaStar =
        mode(arr.map((x) => x.fecha)) || arr.find((x) => x.fecha)?.fecha || "";
      const turnoStar =
        mode(arr.map((x) => x.turno)) || arr.find((x) => x.turno)?.turno || "";
      const horaStar =
        mode(arr.map((x) => x.hora)) || arr.find((x) => x.hora)?.hora || "";
      const materiaStar =
        mode(arr.map((x) => x.materia)) || arr[0]?.materia || "";

      const subNumeros = [
        ...new Set(arr.map((x) => x.numero_mesa).filter((v) => v != null)),
      ].sort((a, b) => a - b);

      const DOC_FALLBACK = "—";
      const mapa = new Map();

      const add = (docente, materia, alumnos) => {
        if (!mapa.has(docente)) mapa.set(docente, new Map());
        const materias = mapa.get(docente);
        if (!materias.has(materia)) materias.set(materia, []);
        materias.get(materia).push(...alumnos);
      };

      for (const sm of arr) {
        const docentesSM = sm.docentes?.length ? sm.docentes : [DOC_FALLBACK];
        for (const d of docentesSM) {
          add(d, sm.materia || "", sm.alumnos || []);
        }
      }

      const bloques = [];
      const docentes = [...mapa.keys()];
      const materiasSet = new Set();

      for (const d of docentes) {
        for (const mat of mapa.get(d).keys()) {
          materiasSet.add(mat);
        }
      }

      const materiasOrden = [...materiasSet].sort((A, B) =>
        String(A).localeCompare(String(B), "es", { sensitivity: "base" })
      );

      for (const mat of materiasOrden) {
        const dQueTienen = docentes
          .filter((d) => mapa.get(d).has(mat))
          .sort((A, B) =>
            String(A).localeCompare(String(B), "es", { sensitivity: "base" })
          );

        for (const d of dQueTienen) {
          const a = mapa.get(d).get(mat) || [];
          const uniq = Array.from(
            new Map(
              a.map((x, idx) => [
                String(x.dni || "").trim() ||
                  String(x.alumno || "").trim() ||
                  `idx-${idx}`,
                x,
              ])
            ).values()
          );

          // ✅ ORDEN CORRECTO
          uniq.sort(compararAlumnoCursoDivisionApellido);

          bloques.push({
            docente: d,
            materia: mat,
            alumnos: uniq,
          });
        }
      }

      return {
        fecha: fechaStar,
        turno: turnoStar,
        hora: horaStar,
        materia: materiaStar,
        subNumeros,
        bloques,
      };
    };

    const mesasLogicas = [];
    for (const nums of agrupacionesEfectivas) {
      const setNums = new Set(nums);
      const arr = subMesas.filter((sm) => setNums.has(sm.numero_mesa));
      if (!arr.length) continue;
      mesasLogicas.push(buildMesaLogicaFrom(arr));
    }

    if (!mesasLogicas.length) {
      notify?.({
        tipo: "warning",
        mensaje: "No hay datos para las agrupaciones seleccionadas.",
      });
      return;
    }

    const turnRank = (t) => (normalizar(t).includes("man") ? 0 : 1);
    mesasLogicas.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
      const ta = turnRank(a.turno);
      const tb = turnRank(b.turno);
      if (ta !== tb) return ta - tb;
      return (a.subNumeros[0] ?? 0) - (b.subNumeros[0] ?? 0);
    });

    /* =================== PDF =================== */
    const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const ML = 28;
    const MTOP = 30;
    const LOGO_BOX = 44;
    const HEADER_GAP = 8;
    const BOTTOM_SAFE = 34;
    const GAP_BETWEEN_TABLES = 6;

    const FT_TITLE = 16;
    const FT_SUB = 10;
    const FT_HEAD = 9;
    const FT_BODY = 9;
    const PAD = 4;

    let logoImg = null;
    let logoW = LOGO_BOX;
    let logoH = LOGO_BOX;

    try {
      logoImg = await loadHTMLImage(
        logoPath || `${window.location.origin}/img/Escudo.png`
      );
      const sz = fitImage(logoImg, LOGO_BOX, LOGO_BOX);
      logoW = sz.w;
      logoH = sz.h;
    } catch {
      // sin logo
    }

    const HEADER_H = Math.max(logoH, 44) + 18;
    const CONTENT_TOP = MTOP + HEADER_H + HEADER_GAP;

    const usableW = pageW - ML * 2;
    const COLS = {
      HORA: 90,
      ESPACIO: 170,
      ESTUDIANTE: 210,
      DNI: 80,
      CURSO: 70,
      DOCENTES: 90,
    };

    const sumCols = Object.values(COLS).reduce((a, b) => a + b, 0);
    const scale = usableW / sumCols;
    for (const k of Object.keys(COLS)) {
      COLS[k] = Math.floor(COLS[k] * scale);
    }

    const drawPageHeader = () => {
      if (logoImg) {
        doc.addImage(logoImg, "PNG", ML, MTOP, logoW, logoH);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(FT_TITLE);
      const titleY = MTOP + Math.max(18, Math.ceil(logoH * 0.5));
      doc.text(TITULO_FINAL, pageW / 2, titleY, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(FT_SUB);
      doc.text('IPET N° 50 "Ing. Emilio F. Olmos"', pageW / 2, titleY + 14, {
        align: "center",
      });

      const lineY = MTOP + HEADER_H - 6;
      doc.setDrawColor(0);
      doc.setLineWidth(0.6);
      doc.line(ML, lineY, pageW - ML, lineY);
    };

    const drawMesaCaption = (_mesa, y) => y;

    const buildBody = (mesa) => {
      const { dia, mes } = NOMBRE_MES(mesa.fecha);
      const horaTxt = HORA_DESDE_DB(mesa.hora, mesa.turno);

      const HORA = `${DIA_SEMANA(mesa.fecha)}\n${String(dia).padStart(
        2,
        "0"
      )}\n${mes}\n${String(mesa.turno || "").toUpperCase()}\n${horaTxt}`;

      const nRowsPorBloque = mesa.bloques.map((b) =>
        Math.max(1, b.alumnos.length)
      );
      const totalRows = nRowsPorBloque.reduce((a, b) => a + b, 0);

      const segMateria = [];
      let curMat = null;
      let accMat = 0;
      let startMat = 0;
      let rowCursor = 0;

      for (let i = 0; i < mesa.bloques.length; i++) {
        const mat = mesa.bloques[i].materia || "";
        const n = nRowsPorBloque[i];

        if (curMat === null) {
          curMat = mat;
          startMat = rowCursor;
          accMat = 0;
        }

        if (mat !== curMat) {
          segMateria.push({
            materia: curMat,
            startRow: startMat,
            rowSpan: accMat,
          });
          curMat = mat;
          startMat = rowCursor;
          accMat = 0;
        }

        accMat += n;
        rowCursor += n;
      }

      if (curMat !== null) {
        segMateria.push({
          materia: curMat,
          startRow: startMat,
          rowSpan: accMat,
        });
      }

      const segDocente = [];
      let curDoc = null;
      let accDoc = 0;
      let startDoc = 0;
      let rowCursor2 = 0;

      for (let i = 0; i < mesa.bloques.length; i++) {
        const docen = mesa.bloques[i].docente || "—";
        const n = nRowsPorBloque[i];

        if (curDoc === null) {
          curDoc = docen;
          startDoc = rowCursor2;
          accDoc = 0;
        }

        if (docen !== curDoc) {
          segDocente.push({
            docente: curDoc,
            startRow: startDoc,
            rowSpan: accDoc,
          });
          curDoc = docen;
          startDoc = rowCursor2;
          accDoc = 0;
        }

        accDoc += n;
        rowCursor2 += n;
      }

      if (curDoc !== null) {
        segDocente.push({
          docente: curDoc,
          startRow: startDoc,
          rowSpan: accDoc,
        });
      }

      const materiaStart = new Map(segMateria.map((s) => [s.startRow, s]));
      const docenteStart = new Map(segDocente.map((s) => [s.startRow, s]));

      const body = [];
      let filaGlobal = 0;

      for (let idx = 0; idx < mesa.bloques.length; idx++) {
        const bloque = mesa.bloques[idx];
        const n = nRowsPorBloque[idx];

        for (let i = 0; i < n; i++) {
          const a = bloque.alumnos[i] || {
            alumno: "—",
            dni: "—",
            curso: "—",
          };

          const row = [];

          if (filaGlobal === 0) {
            row.push({
              content: HORA,
              rowSpan: totalRows || 1,
              styles: {
                halign: "center",
                valign: "middle",
                fontStyle: "bold",
                fontSize: FT_BODY - 0.5,
              },
            });
          }

          const segM = materiaStart.get(filaGlobal);
          if (segM) {
            row.push({
              content: String(segM.materia || ""),
              rowSpan: segM.rowSpan || 1,
              styles: {
                halign: "left",
                valign: "middle",
                fontStyle: "bold",
              },
            });
          }

          row.push(String(a.alumno || ""));
          row.push(String(a.dni || ""));
          row.push(limpiarCurso(a.curso));

          const segD = docenteStart.get(filaGlobal);
          if (segD) {
            row.push({
              content: String(segD.docente || "—"),
              rowSpan: segD.rowSpan || 1,
              styles: {
                halign: "left",
                valign: "middle",
                fontStyle: "bold",
              },
            });
          }

          body.push(row);
          filaGlobal++;
        }
      }

      if (totalRows === 0) {
        body.push([
          {
            content: HORA,
            rowSpan: 1,
            styles: {
              halign: "center",
              valign: "middle",
              fontStyle: "bold",
              fontSize: FT_BODY - 0.5,
            },
          },
          {
            content: mesa.materia || "—",
            rowSpan: 1,
            styles: {
              halign: "left",
              valign: "middle",
              fontStyle: "bold",
            },
          },
          "—",
          "—",
          limpiarCurso("—"),
          {
            content: "—",
            rowSpan: 1,
            styles: { halign: "left" },
          },
        ]);
      }

      return body;
    };

    const TABLE_HEAD = [[
      "Hora",
      "Espacio Curricular",
      "Estudiante",
      "DNI",
      "Curso",
      "Docentes",
    ]];

    const buildTableOptions = (mesa, startY, includePageHeader = false) => ({
      startY,
      margin: {
        top: CONTENT_TOP,
        bottom: BOTTOM_SAFE,
        left: ML,
        right: ML,
      },
      pageBreak: "auto",
      rowPageBreak: "avoid",
      showHead: "everyPage",
      styles: {
        font: "helvetica",
        fontSize: FT_BODY,
        cellPadding: PAD,
        lineWidth: 0.5,
        halign: "center",
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: 60,
        fontStyle: "bold",
        fontSize: FT_HEAD,
        lineWidth: 0.5,
      },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.8,
      theme: "grid",
      head: TABLE_HEAD,
      body: buildBody(mesa),
      columnStyles: {
        0: { cellWidth: COLS.HORA, halign: "center" },
        1: { cellWidth: COLS.ESPACIO, halign: "left" },
        2: { cellWidth: COLS.ESTUDIANTE, halign: "left" },
        3: { cellWidth: COLS.DNI, halign: "center" },
        4: { cellWidth: COLS.CURSO, halign: "center" },
        5: { cellWidth: COLS.DOCENTES, halign: "left" },
      },
      ...(includePageHeader
        ? {
            didDrawPage: () => drawPageHeader(),
          }
        : {}),
    });

    const simulateTable = (mesa, startY) => {
      const probe = new jsPDF({ unit: "pt", format: "a4", compress: true });
      autoTable(probe, buildTableOptions(mesa, startY, false));
      return {
        pages: probe.internal.getNumberOfPages(),
        finalY: probe.lastAutoTable?.finalY ?? startY,
      };
    };

    const countLinesForWidth = (
      text,
      width,
      fontSize = FT_BODY,
      fontStyle = "normal"
    ) => {
      doc.setFont("helvetica", fontStyle);
      doc.setFontSize(fontSize);

      const innerWidth = Math.max(8, width - PAD * 2 - 2);
      const lines = doc.splitTextToSize(String(text ?? ""), innerWidth);
      return Array.isArray(lines) && lines.length ? lines.length : 1;
    };

    const estimateHeadHeight = () =>
      Math.max(20, FT_HEAD * 1.2 + PAD * 2 + 4);

    const estimateFirstBodyRowHeight = (mesa) => {
      const firstBloque =
        Array.isArray(mesa?.bloques) && mesa.bloques.length
          ? mesa.bloques[0]
          : null;

      const firstAlumno = firstBloque?.alumnos?.[0] || {
        alumno: "—",
        dni: "—",
        curso: "—",
      };

      const materia = String(firstBloque?.materia || mesa?.materia || "—");
      const alumno = String(firstAlumno.alumno || "—");
      const dni = String(firstAlumno.dni || "—");
      const curso = limpiarCurso(firstAlumno.curso || "—");
      const docente = String(firstBloque?.docente || "—");

      const matLines = countLinesForWidth(materia, COLS.ESPACIO, FT_BODY, "bold");
      const alumLines = countLinesForWidth(alumno, COLS.ESTUDIANTE, FT_BODY, "normal");
      const dniLines = countLinesForWidth(dni, COLS.DNI, FT_BODY, "normal");
      const cursoLines = countLinesForWidth(curso, COLS.CURSO, FT_BODY, "normal");
      const docLines = countLinesForWidth(docente, COLS.DOCENTES, FT_BODY, "bold");

      const lines = Math.max(matLines, alumLines, dniLines, cursoLines, docLines);
      const lineHeight = FT_BODY * 1.2;

      return Math.max(24, lines * lineHeight + PAD * 2 + 4);
    };

    /* =================== Render =================== */
    drawPageHeader();
    let currentY = CONTENT_TOP;

    for (let idxMesa = 0; idxMesa < mesasLogicas.length; idxMesa++) {
      const mesa = mesasLogicas[idxMesa];

      const simFresh = simulateTable(mesa, CONTENT_TOP);
      let simHere =
        currentY === CONTENT_TOP ? simFresh : simulateTable(mesa, currentY);

      const fitsHereSinglePage = simHere.pages === 1;
      const fitsFreshSinglePage = simFresh.pages === 1;

      // Si entra completa en el espacio actual, queda ahí.
      // Si no entra acá pero sí entra completa arrancando en hoja nueva,
      // recién ahí la movemos.
      if (!fitsHereSinglePage && fitsFreshSinglePage && currentY !== CONTENT_TOP) {
        doc.addPage();
        drawPageHeader();
        currentY = CONTENT_TOP;
        simHere = simFresh;
      }

      // Si es una mesa grande que sí o sí ocupa varias hojas, solo la empezamos
      // en la hoja actual si queda espacio útil real.
      if (!fitsFreshSinglePage) {
        const remaining = pageH - BOTTOM_SAFE - currentY;
        const minFragment = Math.max(
          72,
          estimateHeadHeight() + estimateFirstBodyRowHeight(mesa) + 8
        );

        if (remaining < minFragment && currentY !== CONTENT_TOP) {
          doc.addPage();
          drawPageHeader();
          currentY = CONTENT_TOP;
        }
      }

      currentY = drawMesaCaption(mesa, currentY);

      autoTable(doc, buildTableOptions(mesa, currentY, true));

      const last = doc.lastAutoTable;
      currentY = (last?.finalY ?? currentY) + GAP_BETWEEN_TABLES;
    }

    /* =================== Guardar =================== */
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const safeExtra = String(pdfTituloExtra || "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-");

    const nombreArchivo = safeExtra
      ? `MesasDeExamen_${safeExtra}_${yyyy}-${mm}-${dd}.pdf`
      : `MesasDeExamen_${yyyy}-${mm}-${dd}.pdf`;

    doc.save(nombreArchivo);
  } catch (e) {
    console.error("Error generando PDF:", e);
    notify?.({
      tipo: "error",
      mensaje: e.message || "No se pudo exportar PDF.",
    });
  }
}