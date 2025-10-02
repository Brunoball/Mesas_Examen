import React, { useMemo, useState, useCallback } from "react";
import "./Formulario.css";
import Toast from "../global/Toast";
import escudo from "../../imagenes/Escudo.png";
import BASE_URL from "../../config/config";

/* ============== Subvista: Resumen Alumno (hero rojo + materias en blanco) ============== */
const ResumenAlumno = ({ data, onVolver, onConfirmar }) => {
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

  const a = data.alumno;

  return (
    <div className="auth-card">
      {/* ===== Panel izquierdo (HERO ROJO con resumen y formulario readonly) ===== */}
      <aside className="auth-hero">
        <div className="hero-inner">
          <div className="hero-top">
            <img src={escudo} alt="Escudo IPET 50" className="hero-logo" />
            <h1 className="hero-title">¡Bienvenido!</h1>
            <p className="hero-sub">Revisá tus datos de inscripción.</p>
          </div>

          {/* Formulario SOLO LECTURA */}
          <div className="hero-form" aria-label="Datos del alumno (solo lectura)">
            <label className="hf-field">
              <span className="hf-label">Nombre y Apellido</span>
              <input className="hf-input" value={a?.nombre ?? ""} readOnly />
            </label>

            <label className="hf-field">
              <span className="hf-label">DNI</span>
              <input className="hf-input" value={a?.dni ?? ""} readOnly />
            </label>

            {/* Fila con tres columnas: Año actual · Curso · División */}
            <div className="hf-row-3">
              <label className="hf-field">
                <span className="hf-label ">Año actual</span>
                <input className="hf-input ACD-field" value={a?.anio_actual ?? ""} readOnly />
              </label>

              <label className="hf-field">
                <span className="hf-label">Curso</span>
                <input
                  className="hf-input ACD-field"
                  value={a?.cursando?.curso ?? ""}
                  readOnly
                />
              </label>

              <label className="hf-field">
                <span className="hf-label">División</span>
                <input
                  className="hf-input ACD-field"
                  value={a?.cursando?.division ?? ""}
                  readOnly
                />
              </label>
            </div>

            <label className="hf-field">
              <span className="hf-label">Gmail</span>
              <input className="hf-input" value={data?.gmail ?? ""} readOnly />
            </label>

            <div className="hf-hint">Estos datos no se pueden modificar aquí.</div>
          </div>

          {/* Acciones secundarias (volver) en el héroe */}
          <div className="hero-actions">
            <button type="button" className="btn-hero-secondary" onClick={onVolver}>
              Volver
            </button>
          </div>
        </div>
      </aside>

      {/* ===== Panel derecho (MATERIAS ADEUDADAS en tarjetas) ===== */}
      <section className="auth-body">
        <header className="auth-header">
          <h2 className="auth-title">Materias adeudadas</h2>
          <p className="auth-sub">Seleccioná con qué materias te querés inscribir.</p>
        </header>

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

        <div className="actions">
          <button type="button" className="btn-primary" onClick={handleConfirm}>
            Confirmar inscripción
          </button>
        </div>
      </section>
    </div>
  );
};

/* ============== Formulario principal (login) ============== */
const Formulario = () => {
  const [gmail, setGmail] = useState("");
  const [dni, setDni] = useState("");
  const [toast, setToast] = useState(null);
  const [cargando, setCargando] = useState(false);
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
      mostrarToast("error", "Ingresá un Gmail válido (@gmail.com).");
      return;
    }
    if (!isValidDni(dni)) {
      mostrarToast("error", "Ingresá un DNI válido (7 a 9 dígitos).");
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
      const json = await resp.json();

      if (!json.exito) {
        mostrarToast("advertencia", json.mensaje || "No se encontraron previas para el DNI.");
        return;
      }

      if (json.ya_inscripto) {
        mostrarToast(
          "advertencia",
          `Este alumno ya fue inscripto en las mesas de examen ${json.anio_inscripcion}.`
        );
        return;
      }

      // Guardamos también el gmail enviado para mostrarlo en el héroe
      setDataAlumno({ ...json, gmail: gmail.trim() });
    } catch (err) {
      console.error(err);
      mostrarToast("error", "Error consultando el servidor.");
    } finally {
      setCargando(false);
    }
  };

  const confirmarInscripcion = async ({ dni, materias }) => {
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
          body: JSON.stringify({ dni, materias }),
        }
      );
      const json = await resp.json();

      if (!json.exito) {
        mostrarToast("error", json?.mensaje || `No se pudo registrar la inscripción.`);
        return;
      }

      mostrarToast("exito", `Inscripción registrada (${json.insertados} materia/s).`);
      setDataAlumno(null);
      setDni("");
      setGmail("");
    } catch (e) {
      console.error(e);
      mostrarToast("error", "Error de red al registrar la inscripción.");
    }
  };

  return (
    <div className="auth-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      {dataAlumno ? (
        <ResumenAlumno
          data={dataAlumno}
          onVolver={() => setDataAlumno(null)}
          onConfirmar={confirmarInscripcion}
        />
      ) : (
        <div className="auth-card">
          {/* Panel izquierdo (hero) - LOGIN */}
          <aside className="auth-hero is-login">
            <div className="hero-inner">
              <div className="her-container">
              <h1 className="hero-title">Mesas de Examen · IPET 50</h1>
              <p className="hero-sub">
                Ingresá tu Gmail y DNI para consultar e inscribirte.
              </p>
              </div>
                            <img
                src={escudo}
                alt="Escudo IPET 50"
                className="hero-logo hero-logo--big"
              />
            </div>
          </aside>

          {/* Panel derecho (formulario) */}
          <section className="auth-body">
            <header className="auth-header">
              <h2 className="auth-title">Iniciar sesión</h2>
              <p className="auth-sub">¡Nos alegra verte! Ingresá para continuar.</p>
            </header>

            <form className="auth-form" onSubmit={onSubmit} noValidate>
              <label className="field">
                <span className="field-label">Gmail</span>
                <input
                  className="field-input"
                  id="gmail"
                  type="email"
                  inputMode="email"
                  placeholder="tuusuario@gmail.com"
                  value={gmail}
                  onChange={(e) => setGmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>

              <label className="field">
                <span className="field-label">DNI</span>
                <input
                  className="field-input"
                  id="dni"
                  type="text"
                  inputMode="numeric"
                  placeholder="Solo números"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D+/g, ""))}
                  required
                  autoComplete="off"
                />
              </label>

              <div className="form-extra">
                <label className="remember">
                  <input type="checkbox" /> <span>Recordarme</span>
                </label>
              </div>

              <button type="submit" className="btn-cta" disabled={cargando}>
                {cargando ? "Buscando..." : "Continuar"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default Formulario;
