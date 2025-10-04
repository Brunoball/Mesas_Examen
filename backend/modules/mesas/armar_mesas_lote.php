<?php
// backend/modules/mesas/armar_mesas_lote.php
// Crea mesas para TODAS las previas con inscripcion=1 que aún no tengan mesa.
// Si falta cátedra o tribunal u otros datos -> NO inserta esa mesa y continúa.

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

  // ---------- Entrada ----------
  $input = [];
  $ct = $_SERVER['CONTENT_TYPE'] ?? '';
  if (stripos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?: [];
  } else {
    $input = $_POST;
  }

  // Parámetros opcionales
  $fecha_mesa     = trim($input['fecha_mesa'] ?? '');
  $id_turno       = isset($input['id_turno']) ? (int)$input['id_turno'] : 0;
  $anio_in        = isset($input['anio'])     ? (int)$input['anio']     : 0;

  // Posibles filtros para acotar el lote (opcionales)
  $id_materia_in  = isset($input['id_materia'])  ? (int)$input['id_materia']  : 0;
  $id_curso_in    = isset($input['id_curso'])    ? (int)$input['id_curso']    : 0;
  $id_division_in = isset($input['id_division']) ? (int)$input['id_division'] : 0;

  // Defaults
  if ($fecha_mesa === '') { $fecha_mesa = date('Y-m-d'); }
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_mesa)) {
    bad_request('Formato de fecha_mesa inválido. Use YYYY-MM-DD.');
  }
  if ($id_turno <= 0) { $id_turno = 1; }

  // ============================================================
  // A) Traer TODAS las previas inscriptas (inscripcion=1) sin mesa (por id_previa).
  // ============================================================
  $where = ["p.inscripcion = 1"];
  $params = [];

  if ($anio_in > 0)        { $where[] = "p.anio = :anio";                    $params[':anio'] = $anio_in; }
  if ($id_materia_in > 0)  { $where[] = "p.id_materia = :materia_in";        $params[':materia_in'] = $id_materia_in; }
  if ($id_curso_in > 0)    { $where[] = "p.materia_id_curso = :curso_in";    $params[':curso_in'] = $id_curso_in; }
  if ($id_division_in > 0) { $where[] = "p.materia_id_division = :div_in";   $params[':div_in'] = $id_division_in; }

  $sqlPrevias = "
    SELECT p.*
    FROM previas p
    LEFT JOIN mesas m ON m.id_previa = p.id_previa
    WHERE " . implode(' AND ', $where) . "
      AND m.id_mesa IS NULL
    ORDER BY p.fecha_carga ASC, p.id_previa ASC
  ";
  $stPrev = $pdo->prepare($sqlPrevias);
  $stPrev->execute($params);
  $previas = $stPrev->fetchAll(PDO::FETCH_ASSOC);

  $total_previas = count($previas);
  if ($total_previas === 0) {
    echo json_encode([
      'exito' => true,
      'mensaje' => 'No hay previas inscriptas pendientes.',
      'total_previas' => 0,
      'creadas_ok' => 0,
      'omitidas_duplicadas' => 0,
      'omitidas_por_faltantes' => 0,
      'creadas_total' => 0,
      'detalles' => []
    ]);
    exit;
  }

  // Helpers
  $stExisteGlobal = $pdo->prepare("SELECT id_mesa FROM mesas WHERE id_previa = :id_previa LIMIT 1");
  $stArea   = $pdo->prepare("SELECT id_area FROM materias WHERE id_materia = :m LIMIT 1");
  $stCat    = $pdo->prepare("
    SELECT c.id_catedra, c.id_docente
    FROM catedras c
    WHERE c.id_curso = :curso
      AND c.id_division = :division
      AND c.id_materia = :materia
    LIMIT 1
  ");

  $creadas_ok = 0;
  $omitidas_duplicadas = 0;
  $omitidas_por_faltantes = 0;
  $detalles = [];

  foreach ($previas as $previa) {
    $id_previa = (int)$previa['id_previa'];

    // Evitar duplicar por id_previa globalmente.
    $stExisteGlobal->execute([':id_previa' => $id_previa]);
    if ($stExisteGlobal->fetch(PDO::FETCH_ASSOC)) {
      $omitidas_duplicadas++;
      $detalles[] = [
        'id_previa' => $id_previa,
        'accion' => 'omitida',
        'motivo' => 'duplicada_por_id_previa'
      ];
      continue;
    }

    // Tomar SIEMPRE ids desde materia_id_* de la PREVIA
    $id_materia  = (int)$previa['id_materia'];
    $id_curso    = (int)$previa['materia_id_curso'];
    $id_division = (int)$previa['materia_id_division'];

    // 1) Validaciones básicas
    if ($id_materia <= 0 || $id_curso <= 0 || $id_division <= 0) {
      $omitidas_por_faltantes++;
      $detalles[] = [
        'id_previa' => $id_previa,
        'accion' => 'omitida',
        'motivo' => 'faltan_ids_materia_curso_division',
        'ids' => compact('id_materia', 'id_curso', 'id_division')
      ];
      continue;
    }

    // 2) Área
    $stArea->execute([':m' => $id_materia]);
    $rowArea = $stArea->fetch(PDO::FETCH_ASSOC);
    $id_area = $rowArea ? (int)$rowArea['id_area'] : 0;
    if ($id_area <= 0) {
      $omitidas_por_faltantes++;
      $detalles[] = [
        'id_previa' => $id_previa,
        'accion' => 'omitida',
        'motivo' => 'sin_area_para_materia',
        'ids' => ['id_materia' => $id_materia]
      ];
      continue;
    }

    // 3) Cátedra exacta
    $stCat->execute([
      ':curso'    => $id_curso,
      ':division' => $id_division,
      ':materia'  => $id_materia
    ]);
    $cat = $stCat->fetch(PDO::FETCH_ASSOC);
    if (!$cat) {
      $omitidas_por_faltantes++;
      $detalles[] = [
        'id_previa' => $id_previa,
        'accion' => 'omitida',
        'motivo' => 'sin_catedra_para_curso_division_materia',
        'ids' => compact('id_materia', 'id_curso', 'id_division')
      ];
      continue;
    }

    $id_catedra = (int)$cat['id_catedra'];
    $titular_id = (int)$cat['id_docente'];

    // 4) Tribunal (2 docentes del mismo área, evitando titular)
    $otros = [];
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
      $omitidas_por_faltantes++;
      $detalles[] = [
        'id_previa' => $id_previa,
        'accion' => 'omitida',
        'motivo' => 'sin_tribunal_suficiente',
        'ids' => [
          'id_catedra' => $id_catedra,
          'doc1'       => $titular_id
        ]
      ];
      continue;
    }

    $doc2 = (int)$otros[0];
    $doc3 = (int)$otros[1];

    // 5) Insertar (completa)
    $stIns = $pdo->prepare("
      INSERT INTO mesas
        (id_catedra, id_previa, id_docente_1, id_docente_2, id_docente_3, fecha_mesa, id_turno)
      VALUES
        (:id_catedra, :id_previa, :d1, :d2, :d3, :fecha, :turno)
    ");
    $stIns->execute([
      ':id_catedra' => $id_catedra,
      ':id_previa'  => $id_previa,
      ':d1'         => $titular_id,
      ':d2'         => $doc2,
      ':d3'         => $doc3,
      ':fecha'      => $fecha_mesa,
      ':turno'      => $id_turno
    ]);

    $id_mesa = (int)$pdo->lastInsertId();
    $creadas_ok++;
    $detalles[] = [
      'id_mesa'   => $id_mesa,
      'id_previa' => $id_previa,
      'accion'    => 'creada_ok'
    ];
  }

  echo json_encode([
    'exito' => true,
    'mensaje' => 'Proceso de armado de mesas finalizado.',
    'total_previas' => $total_previas,
    'creadas_ok' => $creadas_ok,
    'omitidas_duplicadas' => $omitidas_duplicadas,
    'omitidas_por_faltantes' => $omitidas_por_faltantes,
    'creadas_total' => $creadas_ok, // sólo completas
    'detalles' => $detalles
  ]);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error al generar mesas en lote.',
    'detalle' => $e->getMessage()
  ]);
}
