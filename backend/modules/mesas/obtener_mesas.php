<?php
// backend/modules/mesas/obtener_mesas.php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

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
  if (!($pdo instanceof PDO)) {
    respond(false, 'Conexión PDO no disponible.', 500);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  /**
   * IMPORTANTE:
   * - No se referencia el nombre del schema/base de datos en ningún lado.
   * - Ajusta los nombres de TABLAS si en tu esquema difieren:
   *     mesas, catedras, previas, materias, turnos, docentes, curso, division
   *
   * id_materia se toma DESDE PREVIAS (pedido explícito).
   */
  $sql = "
    SELECT
      -- Mesas
      m.id_mesa,
      m.id_catedra,
      m.id_previa,
      m.fecha_mesa,
      m.id_turno,

      -- Turno
      t.turno,

      -- Cátedra (curso/div de la mesa)
      c.id_curso,
      c.id_division,

      -- PREVIA -> id_materia (clave del requerimiento)
      p.id_materia AS id_materia_previa,

      -- Materia legible
      mat.materia AS materia,

      -- Nombres de curso/división
      cur.nombre_curso   AS curso,
      dv.nombre_division AS division,

      -- Tribunal (ids y nombres)
      m.id_docente_1, d1.docente AS docente_1,
      m.id_docente_2, d2.docente AS docente_2,
      m.id_docente_3, d3.docente AS docente_3

    FROM mesas      AS m
    INNER JOIN catedras  AS c   ON c.id_catedra   = m.id_catedra
    INNER JOIN turnos    AS t   ON t.id_turno     = m.id_turno

    -- Traer id_materia desde PREVIAS
    INNER JOIN previas   AS p   ON p.id_previa    = m.id_previa
    INNER JOIN materias  AS mat ON mat.id_materia = p.id_materia

    -- Nombres de curso/división (si existen estas tablas)
    LEFT  JOIN curso     AS cur ON cur.id_curso   = c.id_curso
    LEFT  JOIN division  AS dv  ON dv.id_division = c.id_division

    -- Docentes del tribunal
    LEFT  JOIN docentes  AS d1  ON d1.id_docente  = m.id_docente_1
    LEFT  JOIN docentes  AS d2  ON d2.id_docente  = m.id_docente_2
    LEFT  JOIN docentes  AS d3  ON d3.id_docente  = m.id_docente_3

    ORDER BY
      m.fecha_mesa ASC,
      t.turno ASC,
      cur.nombre_curso ASC,
      dv.nombre_division ASC,
      mat.materia ASC,
      m.id_mesa ASC
  ";

  $stmt = $pdo->query($sql);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $toIntOrNull = function ($v) {
    if ($v === null || $v === '' || !is_numeric($v)) return null;
    return (int)$v;
  };

  // Normalización para el frontend
  $data = array_map(function ($r) use ($toIntOrNull) {
    $prof_principal = $r['docente_1'] ?: ($r['docente_2'] ?: $r['docente_3']);
    $idMateria = isset($r['id_materia_previa']) ? (int)$r['id_materia_previa'] : null;

    return [
      'id'            => $toIntOrNull($r['id_mesa']),
      'id_mesa'       => $toIntOrNull($r['id_mesa']),
      'id_catedra'    => $toIntOrNull($r['id_catedra']),
      'id_previa'     => $toIntOrNull($r['id_previa']),

      'fecha'         => (string)($r['fecha_mesa'] ?? ''),
      'id_turno'      => $toIntOrNull($r['id_turno']),
      'turno'         => (string)($r['turno'] ?? ''),

      // Curso / División legibles
      'curso'         => (string)($r['curso'] ?? ''),
      'division'      => (string)($r['division'] ?? ''),

      // Materia tomada desde PREVIAS -> MATERIAS
      'id_materia'    => $idMateria,
      'materia'       => (string)($r['materia'] ?? ''),

      // Tribunal
      'id_docente_1'  => $toIntOrNull($r['id_docente_1'] ?? null),
      'id_docente_2'  => $toIntOrNull($r['id_docente_2'] ?? null),
      'id_docente_3'  => $toIntOrNull($r['id_docente_3'] ?? null),

      'docente_1'     => (string)($r['docente_1'] ?? ''),
      'docente_2'     => (string)($r['docente_2'] ?? ''),
      'docente_3'     => (string)($r['docente_3'] ?? ''),

      'profesor'      => (string)($prof_principal ?? ''),
      'tribunal'      => array_values(array_filter([
                          $r['docente_1'] ?? null,
                          $r['docente_2'] ?? null,
                          $r['docente_3'] ?? null,
                        ])),
    ];
  }, $rows);

  respond(true, $data, 200);

} catch (Throwable $e) {
  respond(false, 'Error: ' . $e->getMessage(), 500);
}
