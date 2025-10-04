<?php
// backend/modules/mesas/armar_mesas.php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO conectado)

function bad_request($msg) {
  http_response_code(400);
  echo json_encode(['exito' => false, 'mensaje' => $msg]);
  exit;
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido.']);
    exit;
  }

  // ---------- Entrada (JSON o form-data) ----------
  $input = [];
  $ct = $_SERVER['CONTENT_TYPE'] ?? '';
  if (stripos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?: [];
  } else {
    $input = $_POST;
  }

  // ---------- Parámetros opcionales (filtros / overrides) ----------
  $id_materia_in  = isset($input['id_materia'])  ? (int)$input['id_materia']  : 0;
  $id_curso_in    = isset($input['id_curso'])    ? (int)$input['id_curso']    : 0;
  $id_division_in = isset($input['id_division']) ? (int)$input['id_division'] : 0;

  $fecha_mesa     = trim($input['fecha_mesa'] ?? '');
  $id_turno       = isset($input['id_turno']) ? (int)$input['id_turno'] : 0;
  $anio_in        = isset($input['anio'])     ? (int)$input['anio']     : 0;

  // Defaults razonables
  if ($fecha_mesa === '') { $fecha_mesa = date('Y-m-d'); }
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_mesa)) {
    bad_request('Formato de fecha_mesa inválido. Use YYYY-MM-DD.');
  }
  if ($id_turno <= 0) { $id_turno = 1; }

  // ============================================================
  // 1) ELEGIR UNA PREVIA DISPONIBLE (sin mesa para esa fecha+turno)
  // ============================================================
  $params = [ ':fecha' => $fecha_mesa, ':turno' => $id_turno ];

  // Intento A: id_condicion = 3 + inscripcion = 1
  $whereA = ["p.id_condicion = 3", "p.inscripcion = 1"];
  if ($anio_in > 0)         { $whereA[] = "p.anio = :anio";                    $params[':anio'] = $anio_in; }
  if ($id_curso_in > 0)     { $whereA[] = "p.materia_id_curso = :curso_in";    $params[':curso_in'] = $id_curso_in; }
  if ($id_division_in > 0)  { $whereA[] = "p.materia_id_division = :div_in";   $params[':div_in'] = $id_division_in; }
  if ($id_materia_in > 0)   { $whereA[] = "p.id_materia = :materia_in";        $params[':materia_in'] = $id_materia_in; }

  $sqlPrevA = "
    SELECT p.id_previa, p.dni, p.alumno,
           p.cursando_id_curso, p.cursando_id_division,
           p.id_materia,
           p.materia_id_curso, p.materia_id_division,
           p.id_condicion, p.inscripcion, p.anio, p.fecha_carga
    FROM previas p
    LEFT JOIN mesas m
      ON m.id_previa = p.id_previa
     AND m.fecha_mesa = :fecha
     AND m.id_turno   = :turno
    WHERE " . implode(' AND ', $whereA) . "
      AND m.id_mesa IS NULL
    ORDER BY p.fecha_carga ASC, p.id_previa ASC
    LIMIT 1
  ";
  $stPrev = $pdo->prepare($sqlPrevA);
  $stPrev->execute($params);
  $previa = $stPrev->fetch(PDO::FETCH_ASSOC);

  $fallback_usado = false;

  // Intento B: cualquier previa con inscripcion = 1
  if (!$previa) {
    $paramsB = [ ':fecha' => $fecha_mesa, ':turno' => $id_turno ];
    $whereB = ["p.inscripcion = 1"];
    if ($id_curso_in > 0)     { $whereB[] = "p.materia_id_curso = :curso_in";  $paramsB[':curso_in'] = $id_curso_in; }
    if ($id_division_in > 0)  { $whereB[] = "p.materia_id_division = :div_in"; $paramsB[':div_in'] = $id_division_in; }
    if ($id_materia_in > 0)   { $whereB[] = "p.id_materia = :materia_in";      $paramsB[':materia_in'] = $id_materia_in; }

    $sqlPrevB = "
      SELECT p.id_previa, p.dni, p.alumno,
             p.cursando_id_curso, p.cursando_id_division,
             p.id_materia,
             p.materia_id_curso, p.materia_id_division,
             p.id_condicion, p.inscripcion, p.anio, p.fecha_carga
      FROM previas p
      LEFT JOIN mesas m
        ON m.id_previa = p.id_previa
       AND m.fecha_mesa = :fecha
       AND m.id_turno   = :turno
      WHERE " . implode(' AND ', $whereB) . "
        AND m.id_mesa IS NULL
      ORDER BY p.fecha_carga ASC, p.id_previa ASC
      LIMIT 1
    ";
    $stPrevB = $pdo->prepare($sqlPrevB);
    $stPrevB->execute($paramsB);
    $previa = $stPrevB->fetch(PDO::FETCH_ASSOC);
    $fallback_usado = (bool)$previa;
  }

  if (!$previa) {
    echo json_encode([
      'exito'    => false,
      'mensaje'  => 'No hay previas (inscripcion=1) disponibles para esa fecha/turno.',
      'creadas'  => 0,
      'detalles' => []
    ]);
    exit;
  }

  // Bloqueo por id_previa global
  $stPreviaUsada = $pdo->prepare("
    SELECT id_mesa, fecha_mesa, id_turno
    FROM mesas
    WHERE id_previa = :id_previa
    LIMIT 1
  ");
  $stPreviaUsada->execute([':id_previa' => (int)$previa['id_previa']]);
  if ($stPreviaUsada->fetch(PDO::FETCH_ASSOC)) {
    echo json_encode([
      'exito'    => false,
      'mensaje'  => 'Esta PREVIA ya fue utilizada para crear una mesa y no puede reutilizarse.',
      'creadas'  => 0
    ]);
    exit;
  }

  // IDs para cátedra
  $id_materia  = (int)$previa['id_materia'];
  $id_curso    = (int)$previa['materia_id_curso'];
  $id_division = (int)$previa['materia_id_division'];

  if ($id_curso_in > 0)    { $id_curso    = $id_curso_in; }
  if ($id_division_in > 0) { $id_division = $id_division_in; }
  if ($id_materia_in > 0)  { $id_materia  = $id_materia_in; }

  if ($id_curso <= 0 || $id_division <= 0 || $id_materia <= 0) {
    echo json_encode([
      'exito'    => false,
      'mensaje'  => 'La previa seleccionada no posee materia_id_curso / materia_id_division válidos (ni overrides).',
      'creadas'  => 0
    ]);
    exit;
  }

  // Área
  $stArea = $pdo->prepare("SELECT id_area FROM materias WHERE id_materia = :m LIMIT 1");
  $stArea->execute([':m' => $id_materia]);
  $id_area = ($row = $stArea->fetch(PDO::FETCH_ASSOC)) ? (int)$row['id_area'] : 0;

  // Cátedra exacta
  $stCat = $pdo->prepare("
    SELECT c.id_catedra, c.id_docente
    FROM catedras c
    WHERE c.id_curso = :curso
      AND c.id_division = :division
      AND c.id_materia = :materia
    LIMIT 1
  ");
  $stCat->execute([
    ':curso'    => $id_curso,
    ':division' => $id_division,
    ':materia'  => $id_materia
  ]);
  $cat = $stCat->fetch(PDO::FETCH_ASSOC);
  if (!$cat) {
    echo json_encode([
      'exito'    => false,
      'mensaje'  => 'No se encontró cátedra (curso/división/materia).',
      'creadas'  => 0
    ]);
    exit;
  }

  $id_catedra = (int)$cat['id_catedra'];
  $titular_id = (int)$cat['id_docente'];

  // Tribunal (2 docentes adicionales)
  $otros = [];
  if ($id_area > 0) {
    $stA = $pdo->prepare("
      SELECT DISTINCT d.id_docente
      FROM docentes d
      JOIN catedras c2 ON c2.id_docente = d.id_docente
      JOIN materias mt ON mt.id_materia = c2.id_materia
      WHERE d.activo = 1
        AND d.id_docente <> :titular
        AND mt.id_area = :area
        AND (d.id_turno_no IS NULL OR d.id_turno_no <> :turno)
        AND (d.id_turno_si IS NULL OR d.id_turno_si = :turno)
      ORDER BY RAND()
      LIMIT 2
    ");
    $stA->execute([
      ':titular' => $titular_id,
      ':area'    => $id_area,
      ':turno'   => $id_turno
    ]);
    $otros = $stA->fetchAll(PDO::FETCH_COLUMN);

    if (count($otros) < 2) {
      $faltan = 2 - count($otros);
      $place  = count($otros) ? implode(',', array_map('intval', $otros)) : '0';
      $stB = $pdo->prepare("
        SELECT DISTINCT d.id_docente
        FROM docentes d
        JOIN catedras c2 ON c2.id_docente = d.id_docente
        JOIN materias mt ON mt.id_materia = c2.id_materia
        WHERE d.activo = 1
          AND d.id_docente <> :titular
          AND mt.id_area = :area
          AND d.id_docente NOT IN ($place)
        ORDER BY RAND()
        LIMIT {$faltan}
      ");
      $stB->execute([':titular' => $titular_id, ':area' => $id_area]);
      $otros = array_merge($otros, $stB->fetchAll(PDO::FETCH_COLUMN));
    }
  }
  if (count($otros) < 2) {
    $faltan = 2 - count($otros);
    $place  = count($otros) ? implode(',', array_map('intval', $otros)) : '0';
    $stC = $pdo->prepare("
      SELECT d.id_docente
      FROM docentes d
      WHERE d.activo = 1
        AND d.id_docente <> :titular
        AND d.id_docente NOT IN ($place)
        AND (d.id_turno_no IS NULL OR d.id_turno_no <> :turno)
        AND (d.id_turno_si IS NULL OR d.id_turno_si = :turno)
      ORDER BY RAND()
      LIMIT {$faltan}
    ");
    $stC->execute([':titular' => $titular_id, ':turno' => $id_turno]);
    $otros = array_merge($otros, $stC->fetchAll(PDO::FETCH_COLUMN));
  }
  if (count($otros) < 2) {
    echo json_encode([
      'exito'    => false,
      'mensaje'  => 'No hay suficientes docentes para el tribunal.',
      'creadas'  => 0
    ]);
    exit;
  }
  $doc2 = (int)$otros[0];
  $doc3 = (int)$otros[1];

  // Doble seguridad por fecha+turno
  $stExiste = $pdo->prepare("
    SELECT id_mesa
    FROM mesas
    WHERE id_previa = :id_previa
      AND fecha_mesa = :fecha
      AND id_turno = :turno
    LIMIT 1
  ");
  $stExiste->execute([
    ':id_previa' => (int)$previa['id_previa'],
    ':fecha'     => $fecha_mesa,
    ':turno'     => $id_turno
  ]);
  if ($stExiste->fetch(PDO::FETCH_ASSOC)) {
    echo json_encode([
      'exito'    => false,
      'mensaje'  => 'Ya existe una mesa para esa PREVIA con la misma fecha y turno.',
      'creadas'  => 0
    ]);
    exit;
  }

  // INSERTAR
  $pdo->beginTransaction();
  $stIns = $pdo->prepare("
    INSERT INTO mesas
      (id_catedra, id_previa, id_docente_1, id_docente_2, id_docente_3, fecha_mesa, id_turno)
    VALUES
      (:id_catedra, :id_previa, :d1, :d2, :d3, :fecha, :turno)
  ");
  $stIns->execute([
    ':id_catedra' => $id_catedra,
    ':id_previa'  => (int)$previa['id_previa'],
    ':d1'         => $titular_id,
    ':d2'         => $doc2,
    ':d3'         => $doc3,
    ':fecha'      => $fecha_mesa,
    ':turno'      => $id_turno
  ]);
  $id_mesa = (int)$pdo->lastInsertId();
  $pdo->commit();

  echo json_encode([
    'exito'    => true,
    'mensaje'  => $fallback_usado
      ? 'Mesa generada (fallback: no había previas con id_condicion = 3).'
      : 'Mesa generada correctamente.',
    'creadas'  => 1,
    'detalles' => [ ['id_mesa' => $id_mesa] ]
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error al generar la mesa.',
    'detalle' => $e->getMessage()
  ]);
}
