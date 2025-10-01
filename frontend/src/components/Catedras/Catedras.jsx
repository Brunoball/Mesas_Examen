import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faSearch, faBookOpen, faPen } from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../config/config";
import "./Catedras.css";
import ModalAgregar from "./Modales/ModalAgregar";

const normalizar = (s = "") =>
  s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const Catedras = () => {
  const navigate = useNavigate();

  const [listas, setListas] = useState({ cursos: [], divisiones: [] });
  const [catedras, setCatedras] = useState([]);
  const [q, setQ] = useState("");
  const [cursoSel, setCursoSel] = useState("");
  const [divisionSel, setDivisionSel] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Modal asignar/editar docente
  const [showModal, setShowModal] = useState(false);
  const [catedraSel, setCatedraSel] = useState(null);

  const fetchListas = useCallback(async () => {
    try {
      const url = `${BASE_URL}/api.php?action=listas_basicas`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.exito) throw new Error(json.mensaje || "Error al obtener listas");
      setListas({
        cursos: json.listas?.cursos ?? [],
        divisiones: json.listas?.divisiones ?? [],
      });
    } catch (e) {
      console.error("Error cargando listas:", e);
      setError(`No se pudieron cargar las listas. ${e.message}`);
    }
  }, []);

  const fetchCatedras = useCallback(async () => {
    try {
      setCargando(true);
      const url = `${BASE_URL}/api.php?action=catedras_list`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.exito) throw new Error(json.mensaje || "Error al obtener cátedras");
      setCatedras(json.catedras || []);
      setError("");
    } catch (e) {
      console.error("Error cargando cátedras:", e);
      setError(`No se pudieron cargar las cátedras. ${e.message}`);
      setCatedras([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    fetchListas();
    fetchCatedras();
  }, [fetchListas, fetchCatedras]);

  const filtradas = useMemo(() => {
    let arr = catedras;
    if (cursoSel) arr = arr.filter((c) => Number(c.id_curso) === Number(cursoSel));
    if (divisionSel) arr = arr.filter((c) => Number(c.id_division) === Number(divisionSel));
    if (q) {
      const nq = normalizar(q);
      arr = arr.filter((c) =>
        [c.materia, c.docente, c.nombre_curso, c.nombre_division].some((v) =>
          normalizar(v).includes(nq)
        )
      );
    }
    return arr;
  }, [catedras, cursoSel, divisionSel, q]);

  const handleRetry = () => fetchCatedras();

  const abrirModal = (catedra) => {
    setCatedraSel(catedra);
    setShowModal(true);
  };
  const cerrarModal = () => setShowModal(false);
  const refrescarTrasAsignar = () => fetchCatedras();

  return (
    <div className="catedras-page">
      <header className="catedras-header">
        <button
          type="button"
          className="btn-volver"
          onClick={() => navigate("/panel")}
          aria-label="Volver al panel"
          title="Volver"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          <span>Volver</span>
        </button>

        <h1 className="catedras-title">
          <FontAwesomeIcon icon={faBookOpen} /> <span>Cátedras</span>
        </h1>

        <div className="catedras-search">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por materia, curso, división o docente…"
            aria-label="Buscar cátedra"
          />
        </div>
      </header>

      {/* Filtros */}
      <section className="catedras-filtros">
        <label>
          Curso:
          <select value={cursoSel} onChange={(e) => setCursoSel(e.target.value)}>
            <option value="">Todos</option>
            {listas.cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          División:
          <select value={divisionSel} onChange={(e) => setDivisionSel(e.target.value)}>
            <option value="">Todas</option>
            {listas.divisiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
      </section>

      <main className="catedras-content">
        {cargando ? (
          <div className="catedras-estado">Cargando…</div>
        ) : error ? (
          <div className="catedras-estado error">
            {error}
            <button onClick={handleRetry} className="btn-reintentar">
              Reintentar
            </button>
          </div>
        ) : (
          <div className="catedras-table-wrapper">
            <table className="catedras-table">
              <thead>
                <tr>
                  <th>Materia</th>
                  <th>Curso</th>
                  <th>División</th>
                  <th>Docente</th>
                  <th style={{ width: 80, textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 18 }}>
                      Sin resultados
                    </td>
                  </tr>
                ) : (
                  filtradas.map((c) => (
                    <tr key={c.id_catedra}>
                      <td>{c.materia}</td>
                      <td>{c.nombre_curso}</td>
                      <td>{c.nombre_division}</td>
                      <td>{c.docente || "-"}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className="btn-icon"
                          title="Asignar / cambiar docente"
                          aria-label="Asignar / cambiar docente"
                          onClick={() => abrirModal(c)}
                        >
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal para asignar/editar docente */}
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
