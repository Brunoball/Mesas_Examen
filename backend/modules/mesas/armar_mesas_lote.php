<?php
// backend/modules/mesas/armar_mesas_lote.php
// LOTE: crea mesas para TODAS las previas (inscripcion=1 y sin mesa) DENTRO de un rango.
// Reglas por DNI (máx 2 materias):
// - 1 materia: asignar primer hueco según patrón global (días turno1, luego días turno2), evitando choque DNI mismo día/turno.
// - 2 materias: intentar mismo día T1/T2; si choca, repartir en días siguientes evitando mismo día/turno para ese DNI.
// Sin límite de capacidad por día/turno. Evita duplicar por id_previa y por (id_previa, fecha, turno).

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

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

  // -------- Entrada --------
  $input = [];
  $ct = $_SERVER['CONTENT_TYPE'] ?? '';
  if (stripos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?: [];
  } else {
    $input = $_POST;
  }

  // -------- Rango obligatorio --------
  $fecha_inicio = trim($input['fecha_inicio'] ?? '');
  $fecha_fin    = trim($input['fecha_fin'] ?? '');
  if ($fecha_inicio === '' || $fecha_fin === '') bad_request('Debés enviar fecha_inicio y fecha_fin (YYYY-MM-DD).');
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_inicio) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_fin)) {
    bad_request('Formato inválido. Usá YYYY-MM-DD para fecha_inicio y fecha_fin.');
  }
  if ($fecha_inicio > $fecha_fin) bad_request('fecha_inicio no puede ser mayor que fecha_fin.');

  // Días del rango (inclusivo)
  $days = [];
  $di = new DateTime($fecha_inicio);
  $df = new DateTime($fecha_fin);
  while ($di <= $df) { $days[] = $di->format('Y-m-d'); $di->modify('+1 day'); }
  $daysCount = count($days);
  if ($daysCount === 0) bad_request('El rango no contiene días válidos.');

  // -------- Filtros opcionales --------
  $anio_in        = isset($input['anio']) ? (int)$input['anio'] : 0;
  $id_materia_in  = isset($input['id_materia'])  ? (int)$input['id_materia']  : 0;
  $id_curso_in    = isset($input['id_curso'])    ? (int)$input['id_curso']    : 0;
  $id_division_in = isset($input['id_division']) ? (int)$input['id_division'] : 0;

  // -------- SQL base --------
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $where  = ["p.inscripcion = 1"];
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
      'rango' => ['inicio'=>$fecha_inicio,'fin'=>$fecha_fin],
      'total_previas' => 0,
      'creadas_ok' => 0,
      'omitidas_duplicadas' => 0,
      'omitidas_por_faltantes' => 0,
      'creadas_total' => 0,
      'detalles' => []
    ]);
    exit;
  }

  // -------- Helpers preparados --------
  $stExisteGlobal = $pdo->prepare("SELECT 1 FROM mesas WHERE id_previa = :id_previa LIMIT 1");
  $stExisteFecha  = $pdo->prepare("
    SELECT 1 FROM mesas
    WHERE id_previa = :id_previa AND fecha_mesa = :fecha AND id_turno = :turno
    LIMIT 1
  ");
  $stChoqueDni = $pdo->prepare("
    SELECT 1
    FROM mesas ms
    JOIN previas pv ON pv.id_previa = ms.id_previa
    WHERE pv.dni = :dni AND ms.fecha_mesa = :f AND ms.id_turno = :t
    LIMIT 1
  ");

  // Caches para reducir consultas repetidas
  $cacheArea = [];     // [id_materia] => id_area
  $cacheCat  = [];     // ["curso|division|materia"] => [id_catedra, id_docente]
  $stArea = $pdo->prepare("SELECT id_area FROM materias WHERE id_materia = :m LIMIT 1");
  $stCat  = $pdo->prepare("
    SELECT c.id_catedra, c.id_docente
    FROM catedras c
    WHERE c.id_curso = :curso AND c.id_division = :division AND c.id_materia = :materia
    LIMIT 1
  ");

  // Tribunal helper (con el mismo fallback encadenado)
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
  $getTribunal = function(int $titular_id, int $id_area, int $turno) use ($pdo, $stA) {
    $stA->execute([':titular'=>$titular_id, ':area'=>$id_area, ':turno'=>$turno]);
    $otros = $stA->fetchAll(PDO::FETCH_COLUMN);
    if (count($otros) >= 2) return [ (int)$otros[0], (int)$otros[1] ];

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
    if (count($otros) >= 2) return [ (int)$otros[0], (int)$otros[1] ];

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
    $stC->execute([':titular'=>$titular_id, ':turno'=>$turno]);
    $otros = array_merge($otros, $stC->fetchAll(PDO::FETCH_COLUMN));

    return (count($otros) >= 2) ? [ (int)$otros[0], (int)$otros[1] ] : [0,0];
  };

  // Patrón global (sin límite de capacidad): llena Turno 1 en todos los días, luego Turno 2, y vuelve.
  $slotGlobal = 0;
  $pickByGlobal = function(int $slot) use ($days, $daysCount) {
    $round = intdiv($slot, $daysCount);          // 0 => T1, 1 => T2, 2 => T1, ...
    $turno = ($round % 2 === 0) ? 1 : 2;
    $dayIdx = $slot % $daysCount;
    return [$days[$dayIdx], $turno, $dayIdx];
  };

  // ------- Agrupar por DNI (máx 2 materias) -------
  $byDni = [];
  foreach ($previas as $p) {
    $dni = trim($p['dni'] ?? '');
    if ($dni === '') $dni = '__SIN_DNI__' . $p['id_previa'];
    if (!isset($byDni[$dni])) $byDni[$dni] = [];
    $byDni[$dni][] = $p;
  }
  // Ordenar por correlatividad (menor curso, luego menor año, luego id_previa)
  foreach ($byDni as &$list) {
    usort($list, function($a, $b) {
      $ac = (int)($a['materia_id_curso'] ?? 0);
      $bc = (int)($b['materia_id_curso'] ?? 0);
      if ($ac !== $bc) return $ac <=> $bc;
      $aa = (int)($a['anio'] ?? 0);
      $bb = (int)($b['anio'] ?? 0);
      if ($aa !== $bb) return $aa <=> $bb;
      return ((int)$a['id_previa']) <=> ((int)$b['id_previa']);
    });
    // Garantizar como mucho 2
    if (count($list) > 2) $list = array_slice($list, 0, 2);
  }
  unset($list);

  // Ocupación de esta corrida (evita mismo DNI mismo día/turno en memoria)
  $ocupadoPorDni = []; // $ocupadoPorDni[$dni]["$fecha|$turno"] = true

  // Utilidades de validación/cálculo
  $getArea = function(int $id_materia) use (&$cacheArea, $stArea) {
    if (isset($cacheArea[$id_materia])) return $cacheArea[$id_materia];
    $stArea->execute([':m'=>$id_materia]);
    $row = $stArea->fetch(PDO::FETCH_ASSOC);
    $cacheArea[$id_materia] = $row ? (int)$row['id_area'] : 0;
    return $cacheArea[$id_materia];
  };
  $getCat = function(int $curso, int $division, int $materia) use (&$cacheCat, $stCat) {
    $key = $curso.'|'.$division.'|'.$materia;
    if (isset($cacheCat[$key])) return $cacheCat[$key];
    $stCat->execute([':curso'=>$curso, ':division'=>$division, ':materia'=>$materia]);
    $row = $stCat->fetch(PDO::FETCH_ASSOC);
    $cacheCat[$key] = $row ? ['id_catedra'=>(int)$row['id_catedra'], 'id_docente'=>(int)$row['id_docente']] : null;
    return $cacheCat[$key];
  };
  $choqueDni = function(string $dni, string $fecha, int $turno) use ($stChoqueDni, &$ocupadoPorDni) {
    $key = $fecha.'|'.$turno;
    if (isset($ocupadoPorDni[$dni][$key])) return true;
    $stChoqueDni->execute([':dni'=>$dni, ':f'=>$fecha, ':t'=>$turno]);
    return (bool)$stChoqueDni->fetch();
  };

  $creadas_ok = 0; $omitidas_duplicadas = 0; $omitidas_por_faltantes = 0; $detalles = [];

  // ------- Recorremos DNI -------
  foreach ($byDni as $dni => $lista) {
    $k = count($lista);
    if ($k === 0) continue;

    // Normalizador de overrides a partir de la previa (con filtros opcionales globales)
    $resolveIds = function(array $previa) use ($id_materia_in, $id_curso_in, $id_division_in) {
      $id_materia  = $id_materia_in  > 0 ? $id_materia_in  : (int)$previa['id_materia'];
      $id_curso    = $id_curso_in    > 0 ? $id_curso_in    : (int)$previa['materia_id_curso'];
      $id_division = $id_division_in > 0 ? $id_division_in : (int)$previa['materia_id_division'];
      return [$id_materia, $id_curso, $id_division];
    };

    // Helper para insertar UNA mesa (con todas las validaciones/cátedra/tribunal/duplicados)
    $insertMesa = function(array $previa, string $fecha, int $turno) use (
      $pdo, $stExisteGlobal, $stExisteFecha, $getArea, $getCat, $getTribunal,
      &$omitidas_duplicadas, &$omitidas_por_faltantes, &$detalles, &$creadas_ok
    ) {
      $id_previa = (int)$previa['id_previa'];

      // duplicado por id_previa global
      $stExisteGlobal->execute([':id_previa'=>$id_previa]);
      if ($stExisteGlobal->fetch()) {
        $omitidas_duplicadas++;
        $detalles[] = ['id_previa'=>$id_previa,'accion'=>'omitida','motivo'=>'duplicada_por_id_previa'];
        return false;
      }

      // IDs curso/división/materia
      [$id_materia, $id_curso, $id_division] = [
        (int)$previa['id_materia'],
        (int)$previa['materia_id_curso'],
        (int)$previa['materia_id_division']
      ];
      if ($id_materia <= 0 || $id_curso <= 0 || $id_division <= 0) {
        $omitidas_por_faltantes++;
        $detalles[] = [
          'id_previa'=>$id_previa,'accion'=>'omitida',
          'motivo'=>'faltan_ids_materia_curso_division',
          'ids'=>compact('id_materia','id_curso','id_division')
        ];
        return false;
      }

      // Area
      $id_area = $getArea($id_materia);
      if ($id_area <= 0) {
        $omitidas_por_faltantes++;
        $detalles[] = ['id_previa'=>$id_previa,'accion'=>'omitida','motivo'=>'sin_area_para_materia','ids'=>['id_materia'=>$id_materia]];
        return false;
      }

      // Cátedra (y titular)
      $cat = $getCat($id_curso, $id_division, $id_materia);
      if (!$cat) {
        $omitidas_por_faltantes++;
        $detalles[] = [
          'id_previa'=>$id_previa,'accion'=>'omitida','motivo'=>'sin_catedra_para_curso_division_materia',
          'ids'=>compact('id_materia','id_curso','id_division'),'fecha'=>$fecha,'turno'=>$turno
        ];
        return false;
      }
      $id_catedra = $cat['id_catedra']; $titular_id = $cat['id_docente'];

      // Tribunal
      [$doc2, $doc3] = $getTribunal($titular_id, $id_area, $turno);
      if ($doc2 === 0 || $doc3 === 0) {
        $omitidas_por_faltantes++;
        $detalles[] = [
          'id_previa'=>$id_previa,'accion'=>'omitida','motivo'=>'sin_tribunal_suficiente',
          'ids'=>['id_catedra'=>$id_catedra,'doc1'=>$titular_id],'fecha'=>$fecha,'turno'=>$turno
        ];
        return false;
      }

      // Duplicado exacto por fecha/turno
      $stExisteFecha->execute([':id_previa'=>$id_previa, ':fecha'=>$fecha, ':turno'=>$turno]);
      if ($stExisteFecha->fetch()) {
        $omitidas_duplicadas++;
        $detalles[] = ['id_previa'=>$id_previa,'accion'=>'omitida','motivo'=>'ya_existe_para_fecha_y_turno','fecha'=>$fecha,'turno'=>$turno];
        return false;
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
        ':id_previa' =>$id_previa,
        ':d1'        =>$titular_id,
        ':d2'        =>$doc2,
        ':d3'        =>$doc3,
        ':fecha'     =>$fecha,
        ':turno'     =>$turno
      ]);
      $id_mesa = (int)$pdo->lastInsertId();
      $pdo->commit();

      $creadas_ok++;
      $detalles[] = ['id_mesa'=>$id_mesa,'id_previa'=>$id_previa,'accion'=>'creada_ok','fecha'=>$fecha,'turno'=>$turno];
      return true;
    };

    // Normalizar lista a 1 o 2 previas
    if ($k === 1) {
      // Asignar por patrón global evitando choque DNI
      $asignada = false;
      for ($guard=0; $guard < $daysCount * 4 && !$asignada; $guard++) {
        [$fecha, $turno] = $pickByGlobal($slotGlobal);
        $slotGlobal++;
        if (!$choqueDni($dni, $fecha, $turno)) {
          if ($insertMesa($lista[0], $fecha, $turno)) {
            $ocupadoPorDni[$dni][$fecha.'|'.$turno] = true;
            $asignada = true;
          }
        }
      }
      if (!$asignada) {
        // sin hueco: dejar registro
        $omitidas_por_faltantes++;
        $detalles[] = ['id_previa'=>(int)$lista[0]['id_previa'],'accion'=>'omitida','motivo'=>'sin_hueco_para_dni_en_rango'];
      }
      continue;
    }

    // k === 2
    // Preferir mismo día: menor curso/año (lista[0]) => Turno 1, la otra => Turno 2
    // 1) Intento mismo día
    $asignada1 = $asignada2 = false;
    for ($round = 0; $round < 2 && (!$asignada1 || !$asignada2); $round++) {
      // Día base propuesto por patrón global (no importa turno aquí, lo forzamos T1/T2)
      [$fechaBase, , $baseDayIdx] = $pickByGlobal($slotGlobal);
      $slotGlobal++;

      // Intento sobre ese día y si choca, avanzar días
      for ($shift = 0; $shift < $daysCount; $shift++) {
        $dayIdx = ($baseDayIdx + $shift) % $daysCount;
        $fecha  = $days[$dayIdx];

        // Intenta T1/T2 en ese día
        $ok1 = !$choqueDni($dni, $fecha, 1);
        $ok2 = !$choqueDni($dni, $fecha, 2);

        // Si ambos libres, listo (ideal)
        if ($ok1 && $ok2) {
          if ($insertMesa($lista[0], $fecha, 1)) {
            $ocupadoPorDni[$dni][$fecha.'|1'] = true; $asignada1 = true;
          }
          if ($insertMesa($lista[1], $fecha, 2)) {
            $ocupadoPorDni[$dni][$fecha.'|2'] = true; $asignada2 = true;
          }
          break 2;
        }

        // Si uno choca y el otro no, probamos repartir en día siguiente para la segunda
        if ($ok1 && !$asignada1) {
          if ($insertMesa($lista[0], $fecha, 1)) {
            $ocupadoPorDni[$dni][$fecha.'|1'] = true; $asignada1 = true;
          }
        }
        if ($ok2 && !$asignada2) {
          if ($insertMesa($lista[1], $fecha, 2)) {
            $ocupadoPorDni[$dni][$fecha.'|2'] = true; $asignada2 = true;
          }
        }

        if ($asignada1 && $asignada2) break 2;

        // Si una quedó sin asignar, intentá ubicarla en otro día con el turno que le falta
        if ($asignada1 && !$asignada2) {
          for ($s=1; $s<$daysCount; $s++) {
            $fecha2 = $days[($dayIdx + $s) % $daysCount];
            if (!$choqueDni($dni, $fecha2, 2)) {
              if ($insertMesa($lista[1], $fecha2, 2)) {
                $ocupadoPorDni[$dni][$fecha2.'|2'] = true; $asignada2 = true; break 3;
              }
            }
          }
        }
        if ($asignada2 && !$asignada1) {
          for ($s=1; $s<$daysCount; $s++) {
            $fecha1 = $days[($dayIdx + $s) % $daysCount];
            if (!$choqueDni($dni, $fecha1, 1)) {
              if ($insertMesa($lista[0], $fecha1, 1)) {
                $ocupadoPorDni[$dni][$fecha1.'|1'] = true; $asignada1 = true; break 3;
              }
            }
          }
        }
        // si ninguna avanzó, seguimos probando otro día (shift++)
      }
    }

    // Si quedó alguna sin asignar, último intento “libre” por patrón global
    if (!$asignada1) {
      for ($guard=0; $guard < $daysCount * 4 && !$asignada1; $guard++) {
        [$fecha, $turno] = $pickByGlobal($slotGlobal);
        $slotGlobal++;
        if (!$choqueDni($dni, $fecha, $turno)) {
          if ($insertMesa($lista[0], $fecha, $turno)) {
            $ocupadoPorDni[$dni][$fecha.'|'.$turno] = true; $asignada1 = true;
          }
        }
      }
    }
    if (!$asignada2) {
      for ($guard=0; $guard < $daysCount * 4 && !$asignada2; $guard++) {
        [$fecha, $turno] = $pickByGlobal($slotGlobal);
        $slotGlobal++;
        if (!$choqueDni($dni, $fecha, $turno)) {
          if ($insertMesa($lista[1], $fecha, $turno)) {
            $ocupadoPorDni[$dni][$fecha.'|'.$turno] = true; $asignada2 = true;
          }
        }
      }
    }

    // Si aún así no se pudo
    if (!$asignada1) {
      $omitidas_por_faltantes++;
      $detalles[] = ['id_previa'=>(int)$lista[0]['id_previa'],'accion'=>'omitida','motivo'=>'sin_hueco_para_dni_en_rango'];
    }
    if (!$asignada2) {
      $omitidas_por_faltantes++;
      $detalles[] = ['id_previa'=>(int)$lista[1]['id_previa'],'accion'=>'omitida','motivo'=>'sin_hueco_para_dni_en_rango'];
    }
  }

  echo json_encode([
    'exito' => true,
    'mensaje' => 'Proceso de armado de mesas finalizado dentro del rango.',
    'rango' => ['inicio'=>$fecha_inicio,'fin'=>$fecha_fin],
    'total_previas' => $total_previas,
    'creadas_ok' => $creadas_ok,
    'omitidas_duplicadas' => $omitidas_duplicadas,
    'omitidas_por_faltantes' => $omitidas_por_faltantes,
    'creadas_total' => $creadas_ok,
    'detalles' => $detalles
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
  http_response_code(500);
  echo json_encode(['exito'=>false,'mensaje'=>'Error al generar mesas en lote.','detalle'=>$e->getMessage()]);
}
