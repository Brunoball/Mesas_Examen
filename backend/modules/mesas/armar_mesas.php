<?php
// backend/modules/mesas/armar_mesas.php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php';

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

  // Entrada
  $input = [];
  $ct = $_SERVER['CONTENT_TYPE'] ?? '';
  if (stripos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?: [];
  } else {
    $input = $_POST;
  }

  $id_materia_in  = isset($input['id_materia'])  ? (int)$input['id_materia']  : 0;
  $id_curso_in    = isset($input['id_curso'])    ? (int)$input['id_curso']    : 0;
  $id_division_in = isset($input['id_division']) ? (int)$input['id_division'] : 0;

  $fecha_mesa_in  = trim($input['fecha_mesa'] ?? '');
  $id_turno_in    = isset($input['id_turno']) ? (int)$input['id_turno'] : 0;
  $anio_in        = isset($input['anio'])     ? (int)$input['anio']     : 0;
  $auto           = isset($input['auto']) ? (int)$input['auto'] : 0;

  // Rango opcional para modo auto
  $fecha_inicio = trim($input['fecha_inicio'] ?? '');
  $fecha_fin    = trim($input['fecha_fin'] ?? '');
  $usarRango    = ($fecha_inicio !== '' && $fecha_fin !== '');

  if ($usarRango) {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_inicio) ||
        !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_fin)) {
      bad_request('Formato de fecha_inicio/fecha_fin inválido. Use YYYY-MM-DD.');
    }
    if ($fecha_inicio > $fecha_fin) {
      bad_request('fecha_inicio no puede ser mayor que fecha_fin.');
    }
    // Construir días del rango
    $days = [];
    $di = new DateTime($fecha_inicio);
    $df = new DateTime($fecha_fin);
    while ($di <= $df) {
      $days[] = $di->format('Y-m-d');
      $di->modify('+1 day');
    }
  }

  // ---------- Elegir previa disponible ----------
  $params = [];
  $where  = ["p.inscripcion = 1"];
  if ($anio_in > 0)         { $where[] = "p.anio = :anio";                    $params[':anio'] = $anio_in; }
  if ($id_curso_in > 0)     { $where[] = "p.materia_id_curso = :curso_in";    $params[':curso_in'] = $id_curso_in; }
  if ($id_division_in > 0)  { $where[] = "p.materia_id_division = :div_in";   $params[':div_in'] = $id_division_in; }
  if ($id_materia_in > 0)   { $where[] = "p.id_materia = :materia_in";        $params[':materia_in'] = $id_materia_in; }

  $sqlPrev = "
    SELECT p.*
    FROM previas p
    LEFT JOIN mesas m ON m.id_previa = p.id_previa
    WHERE " . implode(' AND ', $where) . "
      AND m.id_mesa IS NULL
    ORDER BY p.fecha_carga ASC, p.id_previa ASC
    LIMIT 1
  ";
  $stPrev = $pdo->prepare($sqlPrev);
  $stPrev->execute($params);
  $previa = $stPrev->fetch(PDO::FETCH_ASSOC);

  if (!$previa) {
    echo json_encode(['exito'=>false,'mensaje'=>'No hay previas inscriptas disponibles.','creadas'=>0]);
    exit;
  }

  // Bloqueo por id_previa global
  $stPreviaUsada = $pdo->prepare("SELECT 1 FROM mesas WHERE id_previa = :id_previa LIMIT 1");
  $stPreviaUsada->execute([':id_previa' => (int)$previa['id_previa']]);
  if ($stPreviaUsada->fetch()) {
    echo json_encode(['exito'=>false,'mensaje'=>'La PREVIA ya tiene mesa.','creadas'=>0]);
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
    echo json_encode(['exito'=>false,'mensaje'=>'La previa no posee materia_id_curso/division válidos.','creadas'=>0]);
    exit;
  }

  // Área
  $stArea = $pdo->prepare("SELECT id_area FROM materias WHERE id_materia = :m LIMIT 1");
  $stArea->execute([':m'=>$id_materia]);
  $rowA = $stArea->fetch(PDO::FETCH_ASSOC);
  $id_area = $rowA ? (int)$rowA['id_area'] : 0;
  if ($id_area <= 0) {
    echo json_encode(['exito'=>false,'mensaje'=>'La materia no tiene área asignada.','creadas'=>0]);
    exit;
  }

  // Cátedra
  $stCat = $pdo->prepare("
    SELECT c.id_catedra, c.id_docente
    FROM catedras c
    WHERE c.id_curso = :curso AND c.id_division = :division AND c.id_materia = :materia
    LIMIT 1
  ");
  $stCat->execute([':curso'=>$id_curso, ':division'=>$id_division, ':materia'=>$id_materia]);
  $cat = $stCat->fetch(PDO::FETCH_ASSOC);
  if (!$cat) {
    echo json_encode(['exito'=>false,'mensaje'=>'No se encontró cátedra (curso/división/materia).','creadas'=>0]);
    exit;
  }
  $id_catedra = (int)$cat['id_catedra'];
  $titular_id = (int)$cat['id_docente'];

  // ---------- Fechas y turnos ----------
  $dni = trim($previa['dni'] ?? '');
  if ($dni === '') $dni = '__SIN_DNI__' . $previa['id_previa'];

  $usarAuto = $auto === 1 || $fecha_mesa_in === '' || $id_turno_in <= 0;

  if ($usarAuto) {
    // Si hay rango, intentamos primer slot libre DENTRO del rango
    if ($usarRango) {
      // Para evitar chocar mismo dni en mismo día/turno
      $stChoque = $pdo->prepare("
        SELECT 1
        FROM mesas ms
        JOIN previas pv ON pv.id_previa = ms.id_previa
        WHERE pv.dni = :dni AND ms.fecha_mesa = :f AND ms.id_turno = :t
        LIMIT 1
      ");

      $found = false;
      foreach ($days as $d) {
        // Intentar turno 1 y luego 2
        for ($turno_calc = 1; $turno_calc <= 2; $turno_calc++) {
          // ¿ya existe mesa para esta previa en ese día/turno? (extra)
          $stChk = $pdo->prepare("
            SELECT 1 FROM mesas
            WHERE id_previa = :p AND fecha_mesa = :f AND id_turno = :t
            LIMIT 1
          ");
          $stChk->execute([':p'=>(int)$previa['id_previa'], ':f'=>$d, ':t'=>$turno_calc]);
          if ($stChk->fetch()) continue;

          // ¿choca mismo DNI mismo día/turno?
          $stChoque->execute([':dni'=>$dni, ':f'=>$d, ':t'=>$turno_calc]);
          if ($stChoque->fetch()) continue;

          $fecha_mesa = $d;
          $id_turno   = $turno_calc;
          $found = true;
          break 2;
        }
      }

      if (!$found) {
        echo json_encode(['exito'=>false,'mensaje'=>'Sin lugar dentro del rango indicado.','creadas'=>0]);
        exit;
      }
    } else {
      // Auto sin rango: comportamiento anterior (hoy + alternar)
      $fecha_base = date('Y-m-d');
      $stCountGlobal = $pdo->query("SELECT COUNT(*) AS c FROM mesas");
      $cGlobal = (int)($stCountGlobal->fetch(PDO::FETCH_ASSOC)['c'] ?? 0);

      $stCountDni = $pdo->prepare("
        SELECT COUNT(*) AS c
        FROM mesas ms
        JOIN previas pv ON pv.id_previa = ms.id_previa
        WHERE pv.dni = :dni
      ");
      $stCountDni->execute([':dni'=>$dni]);
      $cDni = (int)($stCountDni->fetch(PDO::FETCH_ASSOC)['c'] ?? 0);

      $slot = max(0, $cGlobal + $cDni);
      $day_offset = intdiv($slot, 2);
      $turno_calc = ($slot % 2 === 0) ? 1 : 2;
      $fecha_calc = date('Y-m-d', strtotime($fecha_base . " +{$day_offset} days"));

      $stChoque = $pdo->prepare("
        SELECT 1
        FROM mesas ms
        JOIN previas pv ON pv.id_previa = ms.id_previa
        WHERE pv.dni = :dni AND ms.fecha_mesa = :f AND ms.id_turno = :t
        LIMIT 1
      ");
      $intentos = 0;
      while (true) {
        $stChoque->execute([':dni'=>$dni, ':f'=>$fecha_calc, ':t'=>$turno_calc]);
        if (!$stChoque->fetch()) break;
        $slot++;
        $day_offset = intdiv($slot, 2);
        $turno_calc = ($slot % 2 === 0) ? 1 : 2;
        $fecha_calc = date('Y-m-d', strtotime($fecha_base . " +{$day_offset} days"));
        if (++$intentos > 10000) break;
      }

      $fecha_mesa = $fecha_calc;
      $id_turno   = $turno_calc;
    }
  } else {
    // Usar lo que vino
    $fecha_mesa = $fecha_mesa_in !== '' ? $fecha_mesa_in : date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_mesa)) {
      bad_request('Formato de fecha_mesa inválido. Use YYYY-MM-DD.');
    }
    $id_turno = $id_turno_in > 0 ? $id_turno_in : 1;
  }

  // Tribunal acorde al turno elegido (igual que antes)
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
  $stA->execute([':titular'=>$titular_id, ':area'=>$id_area, ':turno'=>$id_turno]);
  $otros = $stA->fetchAll(PDO::FETCH_COLUMN);

  if (count($otros) < 2) {
    $faltan = 2 - count($otros);
    $place  = count($otros) ? implode(',', array_map('intval',$otros)) : '0';
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
    $stB->execute([':titular'=>$titular_id, ':area'=>$id_area]);
    $otros = array_merge($otros, $stB->fetchAll(PDO::FETCH_COLUMN));
  }

  if (count($otros) < 2) {
    $faltan = 2 - count($otros);
    $place  = count($otros) ? implode(',', array_map('intval',$otros)) : '0';
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
    $stC->execute([':titular'=>$titular_id, ':turno'=>$id_turno]);
    $otros = array_merge($otros, $stC->fetchAll(PDO::FETCH_COLUMN));
  }

  if (count($otros) < 2) {
    echo json_encode(['exito'=>false,'mensaje'=>'No hay suficientes docentes para el tribunal.','creadas'=>0]);
    exit;
  }

  $doc2 = (int)$otros[0];
  $doc3 = (int)$otros[1];

  // Doble seguridad (misma previa/fecha/turno)
  $stExiste = $pdo->prepare("
    SELECT 1 FROM mesas
    WHERE id_previa = :id_previa AND fecha_mesa = :fecha AND id_turno = :turno
    LIMIT 1
  ");
  $stExiste->execute([
    ':id_previa'=>(int)$previa['id_previa'],
    ':fecha'=>$fecha_mesa, ':turno'=>$id_turno
  ]);
  if ($stExiste->fetch()) {
    echo json_encode(['exito'=>false,'mensaje'=>'Ya existe una mesa para esa PREVIA con la misma fecha y turno.','creadas'=>0]);
    exit;
  }

  // INSERT
  $pdo->beginTransaction();
  $stIns = $pdo->prepare("
    INSERT INTO mesas
      (id_catedra, id_previa, id_docente_1, id_docente_2, id_docente_3, fecha_mesa, id_turno)
    VALUES
      (:id_catedra, :id_previa, :d1, :d2, :d3, :fecha, :turno)
  ");
  $stIns->execute([
    ':id_catedra'=>$id_catedra,
    ':id_previa' =>(int)$previa['id_previa'],
    ':d1'        =>$titular_id,
    ':d2'        =>$doc2,
    ':d3'        =>$doc3,
    ':fecha'     =>$fecha_mesa,
    ':turno'     =>$id_turno
  ]);
  $id_mesa = (int)$pdo->lastInsertId();
  $pdo->commit();

  echo json_encode([
    'exito'=>true,
    'mensaje'=> $usarAuto
      ? ($usarRango ? 'Mesa generada (auto dentro de rango).' : 'Mesa generada (auto fecha/turno).')
      : 'Mesa generada.',
    'creadas'=>1,
    'detalles'=>[['id_mesa'=>$id_mesa,'fecha_mesa'=>$fecha_mesa,'id_turno'=>$id_turno]]
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
  http_response_code(500);
  echo json_encode(['exito'=>false,'mensaje'=>'Error al generar la mesa.','detalle'=>$e->getMessage()]);
}
