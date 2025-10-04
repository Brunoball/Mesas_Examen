<?php
// backend/modules/mesas/obtener_info_mesas.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

function respond($ok, $payload = null, $status = 200) {
  http_response_code($status);
  if ($ok) {
    echo json_encode(['exito' => true, 'data' => $payload], JSON_UNESCAPED_UNICODE);
  } else {
    $msg = is_string($payload) ? $payload : 'Error desconocido';
    echo json_encode(['exito' => false, 'mensaje' => $msg], JSON_UNESCAPED_UNICODE);
  }
  exit;
}

try {
  $id_mesa = null;
  if (isset($_GET['id_mesa']))  $id_mesa = $_GET['id_mesa'];
  if (isset($_POST['id_mesa'])) $id_mesa = $_POST['id_mesa'];

  $id_mesa = is_numeric($id_mesa) ? (int)$id_mesa : null;
  if (!$id_mesa) {
    respond(false, 'Parámetro id_mesa inválido.', 400);
  }

  /**
   * Traemos nombres legibles:
   * - turnos.turno         -> turno_nombre
   * - materias.materia     -> nombre_materia
   * - curso.nombre_curso   -> curso_nombre
   * - mesas_examen.division.nombre_division -> division_nombre
   */
  $sql = "
    SELECT
      -- Mesa
      m.id_mesa,
      m.id_catedra,
      m.id_previa,
      m.id_docente_1,
      m.id_docente_2,
      m.id_docente_3,
      m.fecha_mesa,
      m.id_turno,

      -- Previas (datos del alumno y materia)
      p.dni,
      p.alumno,
      p.cursando_id_curso    AS curso,        -- id (por si no hubiera nombre)
      p.cursando_id_division AS division,     -- id (por si no hubiera nombre)
      p.id_materia,
      p.materia_id_curso,
      p.materia_id_division,
      p.id_condicion,
      p.inscripcion,
      p.anio,

      -- Cátedra
      c.id_materia  AS cat_id_materia,
      c.id_curso    AS cat_id_curso,
      c.id_division AS cat_id_division,

      -- Docentes (nombres)
      d1.docente AS docente_1,
      d2.docente AS docente_2,
      d3.docente AS docente_3,

      -- Nombres legibles
      t.turno                 AS turno_nombre,
      mat.materia             AS nombre_materia,
      cur.nombre_curso        AS curso_nombre,
      dv.nombre_division      AS division_nombre

    FROM mesas_examen.mesas AS m
    LEFT JOIN mesas_examen.previas   AS p  ON p.id_previa  = m.id_previa
    LEFT JOIN mesas_examen.catedras  AS c  ON c.id_catedra = m.id_catedra

    LEFT JOIN mesas_examen.docentes  AS d1 ON d1.id_docente = m.id_docente_1
    LEFT JOIN mesas_examen.docentes  AS d2 ON d2.id_docente = m.id_docente_2
    LEFT JOIN mesas_examen.docentes  AS d3 ON d3.id_docente = m.id_docente_3

    LEFT JOIN mesas_examen.turnos    AS t   ON t.id_turno   = m.id_turno
    LEFT JOIN mesas_examen.materias  AS mat ON mat.id_materia = p.id_materia

    -- nombres de curso/división (ajusta el schema/nombre si difiere)
    LEFT JOIN curso                  AS cur ON cur.id_curso     = c.id_curso
    LEFT JOIN mesas_examen.division  AS dv  ON dv.id_division   = c.id_division

    WHERE m.id_mesa = :id_mesa
    LIMIT 1
  ";

  $st = $pdo->prepare($sql);
  $st->bindValue(':id_mesa', $id_mesa, PDO::PARAM_INT);
  $st->execute();
  $row = $st->fetch(PDO::FETCH_ASSOC);

  if (!$row) {
    respond(false, 'Mesa no encontrada.', 404);
  }

  // Salida normalizada para el frontend
  $data = [
    'id_mesa'      => (int)$row['id_mesa'],
    'id_catedra'   => $row['id_catedra'] !== null ? (int)$row['id_catedra'] : null,
    'id_previa'    => $row['id_previa']  !== null ? (int)$row['id_previa']  : null,
    'id_turno'     => $row['id_turno']   !== null ? (int)$row['id_turno']   : null,

    // Fecha
    'fecha_mesa'   => $row['fecha_mesa'],

    // Previas / alumno
    'dni'          => $row['dni'],
    'alumno'       => $row['alumno'],

    // Curso/División legibles (nombre si existe, si no id)
    'curso'            => $row['curso_nombre']    ?? $row['curso'],
    'division'         => $row['division_nombre'] ?? $row['division'],

    // Materia (id + nombre)
    'id_materia'       => $row['id_materia'],
    'materia_id_curso' => $row['materia_id_curso'],
    'materia_id_division' => $row['materia_id_division'],

    'id_condicion'  => $row['id_condicion'],
    'inscripcion'   => $row['inscripcion'],
    'anio'          => $row['anio'],

    // Cátedra
    'cat_id_materia'  => $row['cat_id_materia'],
    'cat_id_curso'    => $row['cat_id_curso'],
    'cat_id_division' => $row['cat_id_division'],

    // Docentes
    'id_docente_1' => $row['id_docente_1'],
    'id_docente_2' => $row['id_docente_2'],
    'id_docente_3' => $row['id_docente_3'],
    'docente_1'    => $row['docente_1'],
    'docente_2'    => $row['docente_2'],
    'docente_3'    => $row['docente_3'],

    // Extras legibles (por si el frontend los usa)
    'turno_nombre'    => $row['turno_nombre'] ?? null,
    'nombre_materia'  => $row['nombre_materia'] ?? null,
    'curso_nombre'    => $row['curso_nombre'] ?? null,
    'division_nombre' => $row['division_nombre'] ?? null,
  ];

  // Tribunal como arreglo de nombres
  $data['tribunal'] = array_values(array_filter([
    $data['docente_1'] ?? null,
    $data['docente_2'] ?? null,
    $data['docente_3'] ?? null,
  ]));

  respond(true, $data, 200);

} catch (Throwable $e) {
  respond(false, 'Excepción: ' . $e->getMessage(), 500);
}
