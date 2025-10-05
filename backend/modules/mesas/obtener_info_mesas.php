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

/**
 * Responder en formato consistente
 */
function respond($ok, $payload = null, $status = 200) {
  http_response_code($status);
  if ($ok) {
    echo json_encode(['exito' => true, 'data' => $payload], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  } else {
    $msg = is_string($payload) ? $payload : 'Error desconocido';
    echo json_encode(['exito' => false, 'mensaje' => $msg], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  }
  exit;
}

try {
  // --------- Entrada ---------
  $id_mesa = null;
  if (isset($_GET['id_mesa']))  $id_mesa = $_GET['id_mesa'];
  if (isset($_POST['id_mesa'])) $id_mesa = $_POST['id_mesa'];

  $id_mesa = is_numeric($id_mesa) ? (int)$id_mesa : null;
  if (!$id_mesa) {
    respond(false, 'Parámetro id_mesa inválido.', 400);
  }

  /**
   * NOTA IMPORTANTE:
   * - No se referencia nunca el nombre de la base de datos, SOLO los nombres de tablas.
   * - Ajusta los nombres de tablas si tu esquema usa otros (p. ej., "cursos" en lugar de "curso").
   *
   * Tablas esperadas:
   *   mesas, previas, catedras, docentes, turnos, materias, curso, division
   */
  $sql = "
    SELECT
      -- Mesa (ids crudos)
      m.id_mesa,
      m.id_catedra,
      m.id_previa,
      m.id_docente_1,
      m.id_docente_2,
      m.id_docente_3,
      m.fecha_mesa,
      m.id_turno,

      -- Previas (alumno y materia/curso/división del acta de previa)
      p.dni,
      p.alumno,
      p.cursando_id_curso    AS curso_id_previa,
      p.cursando_id_division AS division_id_previa,
      p.id_materia           AS id_materia_previa,
      p.materia_id_curso,
      p.materia_id_division,
      p.id_condicion,
      p.inscripcion,
      p.anio,

      -- Cátedra (curso/división/materia asignados a la mesa)
      c.id_materia  AS cat_id_materia,
      c.id_curso    AS cat_id_curso,
      c.id_division AS cat_id_division,

      -- Docentes (nombres legibles)
      d1.docente AS docente_1,
      d2.docente AS docente_2,
      d3.docente AS docente_3,

      -- Catálogos legibles
      t.turno            AS turno_nombre,
      mat.materia        AS nombre_materia,

      cur.nombre_curso   AS curso_nombre,
      dv.nombre_division AS division_nombre

    FROM mesas AS m
    LEFT JOIN previas   AS p  ON p.id_previa  = m.id_previa
    LEFT JOIN catedras  AS c  ON c.id_catedra = m.id_catedra

    LEFT JOIN docentes  AS d1 ON d1.id_docente = m.id_docente_1
    LEFT JOIN docentes  AS d2 ON d2.id_docente = m.id_docente_2
    LEFT JOIN docentes  AS d3 ON d3.id_docente = m.id_docente_3

    LEFT JOIN turnos    AS t   ON t.id_turno     = m.id_turno
    LEFT JOIN materias  AS mat ON mat.id_materia = p.id_materia

    -- nombres de curso/división a partir de la cátedra (si existen esas tablas)
    LEFT JOIN curso     AS cur ON cur.id_curso   = c.id_curso
    LEFT JOIN division  AS dv  ON dv.id_division = c.id_division

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

  // --------- Normalización de salida para el frontend ---------
  // Helper para castear ints o dejar null
  $toIntOrNull = function($v) {
    if ($v === null) return null;
    if ($v === '')   return null;
    if (!is_numeric($v)) return null;
    return (int)$v;
  };

  $data = [
    // Mesa
    'id_mesa'     => $toIntOrNull($row['id_mesa']),
    'id_catedra'  => $toIntOrNull($row['id_catedra']),
    'id_previa'   => $toIntOrNull($row['id_previa']),
    'id_turno'    => $toIntOrNull($row['id_turno']),
    'fecha_mesa'  => $row['fecha_mesa'],

    // Previas / alumno
    'dni'         => $row['dni'],
    'alumno'      => $row['alumno'],

    // Curso / División legibles a partir de la cátedra;
    // si no hay nombre, mandamos los ids provenientes de previas
    'curso'       => ($row['curso_nombre']   ?? null) !== null ? $row['curso_nombre']   : $row['curso_id_previa'],
    'division'    => ($row['division_nombre']?? null) !== null ? $row['division_nombre']: $row['division_id_previa'],

    // Materia (id y nombre, tomando id de previas)
    'id_materia'        => $toIntOrNull($row['id_materia_previa']),
    'nombre_materia'    => $row['nombre_materia'] ?? null,
    'materia_id_curso'  => $toIntOrNull($row['materia_id_curso']),
    'materia_id_division'=> $toIntOrNull($row['materia_id_division']),

    // Condición / inscripción / año
    'id_condicion' => $toIntOrNull($row['id_condicion']),
    'inscripcion'  => $toIntOrNull($row['inscripcion']),
    'anio'         => $toIntOrNull($row['anio']),

    // Cátedra (ids crudos)
    'cat_id_materia'  => $toIntOrNull($row['cat_id_materia']),
    'cat_id_curso'    => $toIntOrNull($row['cat_id_curso']),
    'cat_id_division' => $toIntOrNull($row['cat_id_division']),

    // Docentes
    'id_docente_1' => $toIntOrNull($row['id_docente_1']),
    'id_docente_2' => $toIntOrNull($row['id_docente_2']),
    'id_docente_3' => $toIntOrNull($row['id_docente_3']),
    'docente_1'    => $row['docente_1'] ?? null,
    'docente_2'    => $row['docente_2'] ?? null,
    'docente_3'    => $row['docente_3'] ?? null,

    // Extras legibles
    'turno_nombre'    => $row['turno_nombre'] ?? null,
    'curso_nombre'    => $row['curso_nombre'] ?? null,
    'division_nombre' => $row['division_nombre'] ?? null,
  ];

  // Tribunal (array de nombres presentes)
  $data['tribunal'] = array_values(array_filter([
    $data['docente_1'] ?? null,
    $data['docente_2'] ?? null,
    $data['docente_3'] ?? null,
  ], function($v) {
    return $v !== null && $v !== '';
  }));

  respond(true, $data, 200);

} catch (Throwable $e) {
  respond(false, 'Excepción: ' . $e->getMessage(), 500);
}
