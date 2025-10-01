import React, { useMemo, useState, useCallback } from "react";
import "./Formulario.css";
import Toast from "../global/Toast";
import escudo from "../../imagenes/Escudo.png"; // <- corregido (sube 2 niveles)
import BASE_URL from "../../config/config";

/* ============== Subvista: Resumen Alumno ============== */
const ResumenAlumno = ({ data, onVolver, onConfirmar }) => {
  // Selecciona todo por defecto
  const [seleccion, setSeleccion] = useState(
    () => new Set(data.alumno.materias.map((m) => m.id_materia))
  );

  const toggle = (id) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const materiasOrdenadas = useMemo(
    () =>
      [...data.alumno.materias].sort((a, b) =>
        a.materia.localeCompare(b.materia, "es", { sensitivity: "base" })
      ),
    [data.alumno.materias]
  );

  const handleConfirm = () => {
    const materiasElegidas = materiasOrdenadas.filter((m) =>
      seleccion.has(m.id_materia)
    );
    onConfirmar({
      dni: data.alumno.dni,
      gmail: data.gmail ?? "",
      materias: materiasElegidas.map((m) => m.id_materia),
    });
  };

  return (
    <div className="resumen">
      <div className="resumen-header">
        <h2>Resumen de inscripción</h2>
        <img src={escudo} alt="Escudo" className="escudo" />
      </div>

      <div className="resumen-grid">
        <div>
          <strong>Alumno:</strong> {data.alumno.nombre}
        </div>
        <div>
          <strong>DNI:</strong> {data.alumno.dni}
        </div>
        <div>
          <strong>Año actual:</strong> {data.alumno.anio_actual}
        </div>
        <div>
          <strong>Cursando:</strong>{" "}
          {`Curso ${data.alumno.cursando.curso} • División ${data.alumno.cursando.division}`}
        </div>
      </div>

      <h3 style={{ marginTop: 12 }}>Materias adeudadas</h3>
      <div className="materias-grid">
        {materiasOrdenadas.map((m) => {
          const checked = seleccion.has(m.id_materia);
          return (
            <label
              key={m.id_materia}
              className={`materia-card ${checked ? "selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(m.id_materia)}
              />
              <span className="nombre">{m.materia}</span>
              <small className="sub">{`(Curso ${m.curso} • Div. ${m.division})`}</small>
            </label>
          );
        })}
      </div>

      <div className="resumen-actions" style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <button type="button" className="btn-secondary" onClick={onVolver}>
          Volver
        </button>
        <button type="button" className="btn-primary" onClick={handleConfirm}>
          Confirmar inscripción
        </button>
      </div>
    </div>
  );
};

/* ============== Formulario principal ============== */
const Formulario = () => {
  const [gmail, setGmail] = useState("");
  const [dni, setDni] = useState("");
  const [toast, setToast] = useState(null);
  const [cargando, setCargando] = useState(false);

  // Paso 2 (vista): si `dataAlumno` existe, mostramos ResumenAlumno
  const [dataAlumno, setDataAlumno] = useState(null);

  const mostrarToast = useCallback((tipo, mensaje, duracion = 3800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  const isValidGmail = useCallback(
    (v) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(v.trim()),
    []
  );
  const isValidDni = useCallback((v) => /^[0-9]{7,9}$/.test(v), []);

  const onSubmit = async (e) => {
    e.preventDefault();

    if (!isValidGmail(gmail)) {
      mostrarToast(
        "error",
        "Ingresá un Gmail válido (debe terminar en @gmail.com)."
      );
      return;
    }
    if (!isValidDni(dni)) {
      mostrarToast(
        "error",
        "Ingresá un DNI válido (solo números, 7 a 9 dígitos)."
      );
      return;
    }

    try {
      setCargando(true);
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_buscar_previas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail: gmail.trim(), dni }),
        }
      );

      // leemos siempre el cuerpo (el backend ahora devuelve 200 con exito:true/false)
      const json = await resp.json();

      if (!json.exito) {
        mostrarToast(
          "advertencia",
          json.mensaje || "No se encontraron previas para el DNI."
        );
        return;
      }

      // 🚫 si ya está inscripto, SOLO mostrar toast y NO pasar a elegir materias
      if (json.ya_inscripto) {
        mostrarToast(
          "advertencia",
          `Este alumno ya fue inscripto en las mesas de examen ${json.anio_inscripcion}.`
        );
        return; // <- clave: no seteamos dataAlumno
      }

      // si no está inscripto, seguimos al resumen para elegir materias
      setDataAlumno(json);
    } catch (err) {
      console.error(err);
      mostrarToast("error", "Error consultando el servidor.");
    } finally {
      setCargando(false);
    }
  };

  const confirmarInscripcion = async ({ dni, gmail: _gmail, materias }) => {
    if (!materias?.length) {
      mostrarToast("advertencia", "Seleccioná al menos una materia.");
      return;
    }
    try {
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_registrar_inscripcion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dni, materias }), // la tabla inscripcion no guarda gmail
        }
      );

      const json = await resp.json();

      if (!json.exito) {
        mostrarToast(
          "error",
          json?.mensaje || `No se pudo registrar la inscripción.`
        );
        return;
      }

      mostrarToast(
        "exito",
        `Inscripción registrada (${json.insertados} materia/s).`
      );
      // limpiar y volver al formulario
      setDataAlumno(null);
      setDni("");
      setGmail("");
    } catch (e) {
      console.error(e);
      mostrarToast("error", "Error de red al registrar la inscripción.");
    }
  };

  // Vista 2: Resumen
  if (dataAlumno) {
    return (
      <div className="form-page">
        {toast && (
          <Toast
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            duracion={toast.duracion}
            onClose={() => setToast(null)}
          />
        )}
        <ResumenAlumno
          data={dataAlumno}
          onVolver={() => setDataAlumno(null)}
          onConfirmar={confirmarInscripcion}
        />
      </div>
    );
  }

  // Vista 1: Formulario (solo Gmail y DNI)
  return (
    <div className="form-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <form className="formulario" onSubmit={onSubmit} noValidate>
        <div className="form-header">
          <h2 className="titulo">Inscripción a mesas de examen — IPET N°50</h2>
        <img src={escudo} alt="Escudo" className="escudo" />
        </div>

        <div className="form-group">
          <label htmlFor="gmail">Gmail</label>
          <input
            id="gmail"
            type="email"
            inputMode="email"
            placeholder="tuusuario@gmail.com"
            value={gmail}
            onChange={(e) => setGmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label htmlFor="dni">DNI</label>
          <input
            id="dni"
            type="text"
            inputMode="numeric"
            placeholder="Solo números"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D+/g, ""))}
            required
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn-submit" disabled={cargando}>
          {cargando ? "Buscando..." : "Continuar"}
        </button>
      </form>
    </div>
  );
};

export default Formulario;
