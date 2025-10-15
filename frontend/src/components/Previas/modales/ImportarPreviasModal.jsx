// src/components/Previas/modales/ImportarPreviasModal.jsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import './ImportarPreviasModal.css';
import { FaTimes, FaUpload, FaFolderOpen } from 'react-icons/fa';
import BASE_URL from '../../../config/config';

// Campos REALES que se envían al backend (sin fecha_carga: la pone la DB)
const DB_COLS = [
  'dni','alumno',
  'cursando_id_curso','cursando_id_division',
  'id_materia','materia_id_curso','materia_id_division',
  'id_condicion','inscripcion','anio'
];

// Mapeo EXACTO/FLEXIBLE -> SOLO tomamos el ID de materia.
const EXCEL_TO_DB = {
  dni: ['dni', 'DNI'],
  alumno: ['APELLIDO Y NOMBRE', 'apellido y nombre', 'alumno', 'nombre alumno'],
  cursando_id_curso: ['CURSANDO AÑO', 'CURSANDO ANIO', 'cursando año', 'cursando anio', 'cursando año (id)'],
  cursando_id_division: ['CURSANDO DIVISIÓN', 'CURSANDO DIVISION', 'cursando division', 'cursando división (id)'],
  id_materia: [
    'IDMATERIA', 'ID MATERIA', 'ID_MATERIA',
    'COD MATERIA', 'CODMATERIA', 'COD_MATERIA',
    'id_materia', 'idmateria'
  ],
  materia_id_curso: ['AÑO MATERIA', 'ANIO MATERIA', 'anio materia', 'año materia (id)'],
  materia_id_division: ['DIVISIÓN MATERIA', 'DIVISION MATERIA', 'division materia', 'división materia (id)'],
  id_condicion: ['CONDICIÓN', 'CONDICION', 'id condicion', 'id_condicion'],
  anio: ['AÑO', 'ANIO', 'anio']
};

// Normalizador
const norm = (s = '') =>
  s.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();

const isEmptyXlsxRow = (row) => {
  const vals = Object.values(row || {});
  if (vals.length === 0) return true;
  return vals.every(v => String(v ?? '').trim() === '');
};

const pickByAliases = (row, aliases) => {
  const entries = Object.entries(row || {});
  const normEntries = entries.map(([k, v]) => [k, norm(k), v]);

  for (const alias of aliases) {
    const a = norm(alias);
    const exact = normEntries.find(([, nk]) => nk === a);
    if (exact) return exact[2];
    const starts = normEntries.find(([, nk]) => nk.startsWith(a));
    if (starts) return starts[2];
  }
  return undefined;
};

export default function ImportarPreviasModal({ open, onClose }) {
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [errores, setErrores] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Abre el diálogo del sistema para seleccionar archivo
  const openPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onDropFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    setErrores([]);

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];

    const json = XLSX.utils.sheet_to_json(ws, {
      defval: '',
      raw: false,
      blankrows: false,
    });

    const normalized = [];
    const errs = [];

    json.forEach((r, idx) => {
      if (isEmptyXlsxRow(r)) return;
      const out = {};

      const requiredFromExcel = [
        'dni','alumno','cursando_id_curso','cursando_id_division',
        'id_materia','materia_id_curso','materia_id_division','id_condicion','anio'
      ];

      for (const col of requiredFromExcel) {
        const aliases = EXCEL_TO_DB[col] || [col];
        const rawVal = pickByAliases(r, aliases);
        if (rawVal === undefined) {
          errs.push(`Fila ${idx + 2}: falta el encabezado/valor para "${col}" (p.ej.: "${aliases[0]}")`);
          return;
        }
        out[col] = (rawVal ?? '').toString().trim();
      }

      out.inscripcion = 0;

      const toInt = (val) => {
        const n = parseInt(String(val).replace(/[^\d\-]/g, '').trim(), 10);
        return Number.isFinite(n) ? n : NaN;
      };

      out.cursando_id_curso    = toInt(out.cursando_id_curso);
      out.cursando_id_division = toInt(out.cursando_id_division);
      out.id_materia           = toInt(out.id_materia);
      out.materia_id_curso     = toInt(out.materia_id_curso);
      out.materia_id_division  = toInt(out.materia_id_division);
      out.id_condicion         = toInt(out.id_condicion);
      out.anio                 = toInt(out.anio);

      if (!out.dni || !out.alumno) {
        errs.push(`Fila ${idx + 2}: "dni" y "alumno" son obligatorios`);
        return;
      }
      if (!Number.isFinite(out.id_materia) || out.id_materia <= 0) {
        errs.push(`Fila ${idx + 2}: "IDMATERIA" (ID numérico) es obligatorio y debe ser entero > 0`);
        return;
      }

      const numericChecks = [
        ['cursando_id_curso','CURSANDO AÑO (ID)'],
        ['cursando_id_division','CURSANDO DIVISIÓN (ID)'],
        ['materia_id_curso','AÑO MATERIA (ID)'],
        ['materia_id_division','DIVISIÓN MATERIA (ID)'],
        ['id_condicion','CONDICIÓN (ID)'],
        ['anio','AÑO (de la previa)'],
      ];
      for (const [key, label] of numericChecks) {
        if (!Number.isFinite(out[key])) {
          errs.push(`Fila ${idx + 2}: "${label}" debe ser entero`);
          return;
        }
      }

      normalized.push(out);
    });

    setRows(normalized);
    setPreview(normalized.slice(0, 10));
    setErrores(errs);
  }, []);

  const onInputChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) onDropFile(f);
  }, [onDropFile]);

  const onDropHandler = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onDropFile(f);
  }, [onDropFile]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const puedeEnviar = useMemo(
    () => rows.length > 0 && errores.length === 0 && !submitting,
    [rows, errores, submitting]
  );

  const enviar = useCallback(async () => {
    if (!puedeEnviar) return;
    try {
      setSubmitting(true);
      await fetch(`${BASE_URL}/api.php?action=previas_lab_ensure`, { method: 'POST' });

      const CHUNK = 500;
      let insertados = 0;
      let allErrs = [];

      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const res = await fetch(`${BASE_URL}/api.php?action=previas_lab_import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ create_if_needed: false, rows: slice }),
        });
        const js = await res.json();
        if (!js?.exito) {
          allErrs.push(js?.mensaje || `Bloque ${i}-${i + CHUNK}: error`);
        } else {
          insertados += js.data?.insertados || 0;
          if (Array.isArray(js.data?.errores) && js.data.errores.length) {
            allErrs = allErrs.concat(js.data.errores);
          }
        }
      }

      setErrores(allErrs);
      alert(`Importación finalizada. Insertados: ${insertados}. Errores: ${allErrs.length}`);
      onClose?.();
    } catch (e) {
      console.error(e);
      alert('Error enviando datos al servidor');
    } finally {
      setSubmitting(false);
    }
  }, [rows, puedeEnviar, onClose]);

  if (!open) return null;

  return (
    <div
      className="ipm-overlay"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ipm-title"
    >
      <div className="ipm-container" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ipm-header">
          <div className="ipm-icon-circle" aria-hidden="true">
            <FaFolderOpen />
          </div>
          <div className="ipm-header-texts">
            <h3 id="ipm-title">Subí tus archivos</h3>
            <p className="ipm-sub">Arrastrá y soltá un Excel o hacé clic para seleccionarlo.</p>
          </div>
          <button className="ipm-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        {/* COLUMNA IZQ: Requisitos (título afuera + caja) */}
        <div className="ipm-specs-col">
          <h4 className="ipm-specs-title">Encabezados requeridos</h4>
          <div className="ipm-specs">
            <ul>
              <li><b>DNI</b></li>
              <li><b>APELLIDO Y NOMBRE</b></li>
              <li><b>CURSANDO AÑO</b> (ID)</li>
              <li><b>CURSANDO DIVISIÓN</b> (ID)</li>
              <li><b>IDMATERIA / ID MATERIA / ID_MATERIA / COD MATERIA</b></li>
              <li><b>AÑO MATERIA</b> (ID)</li>
              <li><b>DIVISIÓN MATERIA</b> (ID)</li>
              <li><b>CONDICIÓN</b> (ID)</li>
              <li><b>AÑO</b> (de la previa)</li>
            </ul>
          </div>
        </div>

        {/* COLUMNA DER: Dropzone */}
        <div
          ref={dropRef}
          className="ipm-drop"
          onDrop={onDropHandler}
          onDragOver={onDragOver}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Arrastrá y soltá tu archivo aquí o hacé clic para seleccionarlo"
        >
          <div className="ipm-drop-ico">
            <FaUpload />
          </div>
          <p className="ipm-drop-title">Arrastrá y soltá tu archivo aquí</p>
          <p className="ipm-file-btn">
            o <span className="ipm-file-link">hacé clic para buscar</span>
          </p>
          <p className="ipm-types">.XLSX · .XLS</p>
          {fileName && <div className="ipm-file-name">{fileName}</div>}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onInputChange}
            hidden
          />
        </div>

        {/* NOTA FUERA DE LA CAJA (100% width, bajo las dos columnas) */}
        <p className="ipm-note-wide">
          <b>Inscripción</b> se fija en <code>0</code> para todos y la <b>fecha de carga</b> la agrega el sistema.
          La columna <code>MATERIA</code> (texto) se ignora; solo se lee <code>IDMATERIA</code>.
        </p>

        {/* ERRORES (fila completa) */}
        {errores.length > 0 && (
          <div className="ipm-errors" role="alert">
            <b>Errores detectados ({errores.length}):</b>
            <div className="ipm-errors-box">
              {errores.slice(0, 50).map((e, i) => <div key={i}>• {e}</div>)}
              {errores.length > 50 && <div>… (hay más)</div>}
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {preview.length > 0 && (
          <div className="ipm-preview">
            <b>Vista previa (primeras {preview.length} filas):</b>
            <div className="ipm-table" role="table">
              <div className="ipm-tr ipm-head" role="row">
                {DB_COLS.map(c => <div key={c} className="ipm-td" role="columnheader">{c}</div>)}
              </div>
              {preview.map((r, idx) => (
                <div key={idx} className="ipm-tr" role="row">
                  {DB_COLS.map(c => <div key={c} className="ipm-td" role="cell">{String(r[c] ?? '')}</div>)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACCIONES */}
        <div className="ipm-actions">
          <button className="ipm-btn ipm-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="ipm-btn ipm-primary" onClick={enviar} disabled={!puedeEnviar}>
            {submitting ? 'Importando…' : 'Importar a previas_lab'}
          </button>
        </div>
      </div>
    </div>
  );
}
