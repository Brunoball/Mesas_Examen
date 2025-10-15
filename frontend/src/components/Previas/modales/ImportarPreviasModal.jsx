// src/components/Previas/modales/ImportarPreviasModal.jsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import './ImportarPreviasModal.css';
import { FaTimes, FaUpload, FaFolderOpen } from 'react-icons/fa';
import BASE_URL from '../../../config/config';
import Toast from '../../Global/Toast';

// Columnas que espera el backend (fecha_carga la agrega la DB)
const DB_COLS = [
  'dni','alumno',
  'cursando_id_curso','cursando_id_division',
  'id_materia','materia_id_curso','materia_id_division',
  'id_condicion','inscripcion','anio'
];

// Aliases para mapear encabezados Excel → claves DB
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
  anio: ['AÑO', 'ANIO', 'anio'],
  inscripcion: ['INSCRIPCION', 'inscripcion', 'INSCRIPCIÓN', 'inscripción']
};

// Normaliza solo encabezados (NO los valores)
const norm = (s = '') =>
  s.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();

// “Fila en blanco” = todos los valores vacíos al recortar espacios
const isBlankRow = (arr = []) => arr.every(v => String(v ?? '').trim() === '');

const CLOSE_DELAY_MS = 600;

export default function ImportarPreviasModal({ open, onClose, onSuccess }) {
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [errores, setErrores] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // TOASTS
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((tipo, mensaje, duracion = 4000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, tipo, mensaje, duracion }]);
  }, []);
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const openPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Construir mapa encabezado→índice según aliases
  const buildHeaderMap = (headerRow) => {
    const map = {};
    const lower = headerRow.map(h => norm(h ?? ''));
    for (const [dbCol, aliases] of Object.entries(EXCEL_TO_DB)) {
      let idxFound = -1;
      for (const alias of aliases) {
        const i = lower.indexOf(norm(alias));
        if (i !== -1) { idxFound = i; break; }
      }
      map[dbCol] = idxFound; // -1 si no existe
    }
    return map;
  };

  const onDropFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    setErrores([]);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Leer como matriz completa (incluye filas vacías)
      const matrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        blankrows: true,
        raw: true
      });

      if (!Array.isArray(matrix) || matrix.length < 2) {
        pushToast('advertencia', 'El archivo parece vacío.', 3500);
        setRows([]); setPreview([]);
        return;
      }

      // Fila 0 = cabecera (se descarta SIEMPRE)
      const header = (matrix[0] || []).map(v => (v ?? '').toString());
      const headerMap = buildHeaderMap(header);

      // Cuerpo: solo descartamos filas completamente en blanco
      const body = matrix.slice(1).filter(r => !isBlankRow(r));

      // Mapeo literal a las columnas de DB; no validamos ni convertimos
      const outRows = body.map((arr) => {
        const o = {};
        for (const dbCol of DB_COLS) {
          const colIdx = headerMap[dbCol];
          o[dbCol] = (colIdx !== undefined && colIdx >= 0) ? (arr[colIdx] ?? '') : '';
        }
        return o;
      });

      setRows(outRows);
      setPreview(outRows.slice(0, 10));

      const esperadas = Math.max(matrix.length - 1, 0);
      pushToast('exito', `Archivo cargado: ${outRows.length}/${esperadas} filas (solo se descartó cabecera y filas en blanco).`, 4500);
    } catch {
      pushToast('error', 'No se pudo leer el archivo Excel.', 4000);
      setRows([]); setPreview([]);
    }
  }, [pushToast]);

  const onInputChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) onDropFile(f);
  }, [onDropFile]);

  const puedeEnviar = useMemo(
    () => rows.length > 0 && !submitting,
    [rows, submitting]
  );

  const enviar = useCallback(async () => {
    if (!puedeEnviar) return;
    try {
      setSubmitting(true);
      await fetch(`${BASE_URL}/api.php?action=previas_lab_ensure`, { method: 'POST' });

      const CHUNK = 1000;
      let insertados = 0, actualizados = 0, sinCambios = 0;
      let allErrs = [];

      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);

        const res = await fetch(`${BASE_URL}/api.php?action=previas_lab_import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: slice }),
        });

        const js = await res.json();
        if (!js?.exito) {
          allErrs.push(js?.mensaje || `Bloque ${i}-${i + CHUNK}: error`);
        } else {
          insertados   += js.data?.insertados   || 0;
          actualizados += js.data?.actualizados || 0;
          sinCambios   += js.data?.sin_cambios  || 0;
          if (Array.isArray(js.data?.errores) && js.data.errores.length) {
            allErrs = allErrs.concat(js.data.errores);
          }
        }
      }

      setErrores(allErrs);

      if ((insertados + actualizados + sinCambios) > 0 && allErrs.length === 0) {
        pushToast('exito', `Importación OK. Ins: ${insertados}, Upd: ${actualizados}, =: ${sinCambios}.`, 4500);
        // 🔁 Refrescar la tabla del padre inmediatamente
        try { await onSuccess?.(); } catch {}
        // Limpiar estado local para evitar re-envíos accidentales
        setRows([]); setPreview([]); setFileName('');
        setTimeout(() => { onClose?.(); }, CLOSE_DELAY_MS);
      } else if ((insertados + actualizados + sinCambios) > 0) {
        pushToast('advertencia', `Importación con avisos. Ins: ${insertados}, Upd: ${actualizados}, =: ${sinCambios}. Errores: ${allErrs.length}.`, 5000);
        // Aunque haya avisos, refrescar ayuda a ver los cambios
        try { await onSuccess?.(); } catch {}
      } else {
        pushToast('error', `No se pudo insertar/actualizar. Errores: ${allErrs.length}.`, 5000);
      }
    } catch {
      pushToast('error', 'Error enviando datos al servidor.', 5000);
    } finally {
      setSubmitting(false);
    }
  }, [rows, puedeEnviar, pushToast, onClose, onSuccess]);

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
        {/* TOASTS */}
        <div className="toast-stack">
          {toasts.map(t => (
            <Toast
              key={t.id}
              tipo={t.tipo}
              mensaje={t.mensaje}
              duracion={t.duracion}
              onClose={() => removeToast(t.id)}
            />
          ))}
        </div>

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

        {/* Izquierda: info */}
        <div className="ipm-specs-col">
          <h4 className="ipm-specs-title">Encabezados esperados (solo mapeo)</h4>
          <div className="ipm-specs">
            <ul>
              <li><b>DNI</b></li>
              <li><b>APELLIDO Y NOMBRE</b></li>
              <li><b>CURSANDO AÑO</b> (ID)</li>
              <li><b>CURSANDO DIVISIÓN</b> (ID)</li>
              <li><b>IDMATERIA / ID MATERIA / COD MATERIA</b></li>
              <li><b>AÑO MATERIA</b> (ID)</li>
              <li><b>DIVISIÓN MATERIA</b> (ID)</li>
              <li><b>CONDICIÓN</b> (ID)</li>
              <li><b>AÑO</b> (de la previa)</li>
              <li><b>INSCRIPCION</b> (opcional)</li>
            </ul>
          </div>
        </div>

        {/* Dropzone */}
        <div
          className="ipm-drop"
          onClick={openPicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
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

        {/* Nota */}
        <p className="ipm-note-wide">
          Se importa <b>todo</b> desde la fila 2 (cabecera descartada) y solo se eliminan <b>filas completamente en blanco</b>.
          No hay validaciones ni conversiones en el front.
        </p>

        {/* Errores backend */}
        {errores.length > 0 && (
          <div className="ipm-errors" role="alert">
            <b>Avisos/errores del backend ({errores.length}):</b>
            <div className="ipm-errors-box">
              {errores.slice(0, 50).map((e, i) => <div key={i}>• {e}</div>)}
              {errores.length > 50 && <div>… (hay más)</div>}
            </div>
          </div>
        )}

        {/* Preview */}
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

        {/* Acciones */}
        <div className="ipm-actions">
          <button className="ipm-btn ipm-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="ipm-btn ipm-primary" onClick={enviar} disabled={!puedeEnviar}>
            {submitting ? 'Importando…' : 'Importar a previas'}
          </button>
        </div>
      </div>
    </div>
  );
}
