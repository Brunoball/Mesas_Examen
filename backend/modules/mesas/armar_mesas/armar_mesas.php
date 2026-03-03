<?php
// backend/modules/mesas/armar_mesas.php
// -----------------------------------------------------------------------------
// VERSIÓN CORREGIDA: Garantiza que TODAS las previas inscritas tengan mesa
// - Elimina validaciones que puedan causar que previas se omitan
// - Crea mesas incluso si no encuentra cátedra exacta (usa cátedra por defecto)
// - Maneja casos donde no hay docente asignado
// - Log más detallado para debugging
// ----------------------------------------------------------------------------- 

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../../config/db.php';

// ---------- Utilidades ----------
function respond(bool $ok, $payload = null, int $status = 200): void {
  if (ob_get_length()) { @ob_clean(); }
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito'=>true, 'data'=>$payload]
       : ['exito'=>false, 'mensaje'=>(is_string($payload)?$payload:'Error desconocido')],
    JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES
  );
  exit;
}
function bad_request(string $m): void { respond(false, $m, 400); }

function validarFecha(?string $s): bool {
  if (!$s) return false;
  $d = DateTime::createFromFormat('Y-m-d', $s);
  return $d && $d->format('Y-m-d') === $s;
}

/**
 * Devuelve un array de fechas entre inicio y fin (incluidos),
 * pero **NUNCA** incluye sábados ni domingos.
 */
function rangoFechas(string $inicio, string $fin): array {
  $di = new DateTime($inicio);
  $df = new DateTime($fin);
  if ($df < $di) return [];

  $out = [];
  while ($di <= $df) {
    $dow = (int)$di->format('N'); // 1=lunes ... 6=sábado, 7=domingo
    if ($dow !== 6 && $dow !== 7) {
      // Solo agregamos días hábiles (lunes a viernes)
      $out[] = $di->format('Y-m-d');
    }
    $di->modify('+1 day');
  }
  return $out;
}

function estadoColumnaTurno(PDO $pdo): array {
  $sql="SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='mesas' AND COLUMN_NAME='id_turno' LIMIT 1";
  $st = $pdo->query($sql);
  $row = $st ? $st->fetch(PDO::FETCH_ASSOC) : null;
  if (!$row) return ['existe'=>false, 'not_null'=>false];
  return ['existe'=>true, 'not_null'=>(strtoupper($row['IS_NULLABLE']??'YES')==='NO')];
}

if (!isset($pdo) || !$pdo instanceof PDO) {
  bad_request("Error: no se encontró la conexión PDO (backend/config/db.php).");
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(false,'Método no permitido',405);

  $input = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($input)) $input = [];

  $fecha_inicio = $input['fecha_inicio'] ?? null;
  $fecha_fin    = $input['fecha_fin'] ?? null;
  $dry_run      = !empty($input['dry_run']);

  if (!validarFecha($fecha_inicio) || !validarFecha($fecha_fin)) {
    bad_request("Debés enviar 'fecha_inicio' y 'fecha_fin' con formato YYYY-MM-DD.");
  }

  // ⚠️ IMPORTANTE: el rango de fechas ya VIENE SIN SÁBADOS NI DOMINGOS
  $fechas = rangoFechas($fecha_inicio, $fecha_fin);
  if (!$fechas) bad_request("El rango de fechas es inválido o no contiene días hábiles.");

  // ---------- PREVIAS + correlativa ----------
  // AHORA: LEFT JOIN para que NINGUNA previa se pierda por falta de fila en `materias`.
  $sqlPrev = "
    SELECT
      pr.id_previa,
      pr.dni,
      pr.alumno,
      pr.id_materia,
      pr.materia_id_curso,
      pr.materia_id_division,
      pr.cursando_id_curso,
      pr.cursando_id_division,
      m.correlativa AS correlatividad
    FROM previas pr
    LEFT JOIN materias m ON m.id_materia = pr.id_materia
    WHERE pr.inscripcion = 1
      AND pr.id_condicion = 3
  ";
  $previas = $pdo->query($sqlPrev)->fetchAll(PDO::FETCH_ASSOC);

  if (!$previas) {
    respond(true, [
      'resumen' => [
        'dias'                => count($fechas),
        'total_previas'       => 0,
        'insertados'          => 0,
        'omitidos_existentes' => 0,
        'omitidos_sin_catedra'=> 0,
        'agendados_prio'      => 0
      ],
      'slots'=>[],
      'nota'=>'No hay previas inscriptas (inscripcion=1, id_condicion=3).'
    ]);
  }

  // Agrupar por DNI para calcular prioridad por correlativa
  $porDni = [];
  foreach ($previas as $p) {
    $dniKey = (string)$p['dni'];
    if (!isset($porDni[$dniKey])) $porDni[$dniKey] = [];
    $porDni[$dniKey][] = $p;
  }

  $turnoInfo = estadoColumnaTurno($pdo);
  $colTurnoExiste  = $turnoInfo['existe'];
  $colTurnoNotNull = $turnoInfo['not_null'];

  // ==================== INDISPONIBILIDAD DESDE docentes_bloques_no (REGLAS NUEVAS) ====================
  // Estructuras:
  //   $noPorTurno[id_docente][turno] = true            -> NUNCA en ese turno (fecha NULL)
  //   $noPorFecha[id_docente][fecha] = true            -> NO en ningún turno ese día (turno NULL)
  //   $noPorFechaTurno[id_docente][fecha][turno] = true-> NO en ese slot exacto (fecha+turno)
  $noPorTurno = [];
  $noPorFecha = [];
  $noPorFechaTurno = [];

  $rsBN = $pdo->query("SELECT id_docente, id_turno, fecha FROM docentes_bloques_no");
  if ($rsBN) {
    foreach ($rsBN->fetchAll(PDO::FETCH_ASSOC) as $r) {
      $idd = (int)$r['id_docente'];
      $f   = $r['fecha'];               // puede ser NULL
      $t   = isset($r['id_turno']) ? (int)$r['id_turno'] : null;

      if ($t !== null && $f === null) {              // SOLO TURNO => nunca ese turno
        $noPorTurno[$idd][$t] = true;
      } elseif ($t === null && $f !== null) {        // SOLO FECHA => todo el día
        $noPorFecha[$idd][$f] = true;
      } elseif ($t !== null && $f !== null) {        // TURNO+FECHA => slot exacto
        $noPorFechaTurno[$idd][$f][$t] = true;
      }
      // caso t===null && f===null => se ignora
    }
  }

  $slotProhibido = function(int $id_docente, string $fecha, int $turno) use ($noPorTurno, $noPorFecha, $noPorFechaTurno): bool {
    return isset($noPorTurno[$id_docente][$turno])
        || isset($noPorFecha[$id_docente][$fecha])
        || isset($noPorFechaTurno[$id_docente][$fecha][$turno]);
  };

  // ========= Mapa de (docente -> set de slots distintos ya usados) para límite 3 =========
  $docenteSlots = []; // [id_docente] => ['YYYY-MM-DD|turno' => true, ...]
  $rsUsed = $pdo->query("
    SELECT DISTINCT m.id_docente, m.fecha_mesa, m.id_turno
    FROM mesas m
    WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
  ");
  if ($rsUsed) {
    foreach ($rsUsed->fetchAll(PDO::FETCH_ASSOC) as $r) {
      $idd = (int)$r['id_docente']; if ($idd<=0) continue;
      $key = $r['fecha_mesa'].'|'.(int)$r['id_turno'];
      $docenteSlots[$idd][$key] = true;
    }
  }
  $docenteSuperaMax = function(int $id_docente, string $fecha, int $turno) use (&$docenteSlots): bool {
    if ($id_docente<=0) return false;
    $key = $fecha.'|'.$turno;
    $ya = $docenteSlots[$id_docente] ?? [];
    if (isset($ya[$key])) return false;      // mismo slot no suma
    return (count($ya) >= 3);                // máximo 3 slots distintos
  };
  $registrarDocenteEnSlot = function(int $id_docente, string $fecha, int $turno) use (&$docenteSlots): void {
    if ($id_docente<=0) return;
    $docenteSlots[$id_docente][$fecha.'|'.$turno] = true;
  };

  // Sentencias varias
  $stExisteMesa = $pdo->prepare("SELECT 1 FROM mesas WHERE id_previa=:idp LIMIT 1");

  $stBuscaCatedra = $pdo->prepare("
    SELECT id_catedra, id_docente
    FROM catedras
    WHERE id_materia=:idm AND id_curso=:ic AND id_division=:idv
    LIMIT 1
  ");

  // NUEVO: Buscar cualquier cátedra de la materia como fallback
  $stBuscaCatedraFallback = $pdo->prepare("
    SELECT id_catedra, id_docente
    FROM catedras
    WHERE id_materia=:idm
    LIMIT 1
  ");

  $stNumeroExistente = $pdo->prepare("
    SELECT m.numero_mesa
    FROM mesas m
    INNER JOIN catedras c ON c.id_catedra = m.id_catedra
    WHERE c.id_materia=:idm AND m.id_docente=:idd
    ORDER BY m.numero_mesa ASC
    LIMIT 1
  ");

  // NUEVO: todas las cátedras de 7º para una división dada
  $stCatedras7 = $pdo->prepare("
    SELECT id_catedra, id_docente
    FROM catedras
    WHERE id_curso = 7 AND id_division = :div
  ");

  // NUEVO: existencia exacta de mesa por numero_mesa + cátedra + previa
  $stExisteMesaCatedra = $pdo->prepare("
    SELECT 1
    FROM mesas
    WHERE numero_mesa = :nm
      AND id_catedra  = :cat
      AND id_previa   = :idp
    LIMIT 1
  ");

  $rowMax = $pdo->query("SELECT COALESCE(MAX(numero_mesa),0) AS maxnum FROM mesas")
                ->fetch(PDO::FETCH_ASSOC);
  $siguienteNumero = (int)($rowMax['maxnum'] ?? 0);

  // Insert SIEMPRE sin fecha/turno (también prio=1)
  if ($colTurnoExiste && $colTurnoNotNull) {
    $stInsertSinFecha = $pdo->prepare("
      INSERT INTO mesas
        (numero_mesa, prioridad, id_catedra, id_previa, id_docente, fecha_mesa, id_turno)
      VALUES
        (:nm,:prio,:cat,:idp,:idd,NULL,NULL)
    ");
  } else {
    $stInsertSinFecha = $pdo->prepare("
      INSERT INTO mesas
        (numero_mesa, prioridad, id_catedra, id_previa, id_docente, fecha_mesa)
      VALUES
        (:nm,:prio,:cat,:idp,:idd,NULL)
    ");
  }

  $cacheNumeroPorMD = [];             // clave => numero_mesa base
  $cacheNumeroPorMDAlumno = [];       // claveAlumno => numero_mesa alterno

  // *** NUEVO: ahora guardamos TODOS los docentes por numero_mesa ***
  //   $docentesPorNumero[numero_mesa][id_docente] = true
  $docentesPorNumero = [];

  $dnisPorNumero = [];                // numero_mesa => set dni
  $idsPrio1PorNumero  = [];           // numero_mesa => [id_mesa prio1]
  $prio1CountPorNumero= [];
  $insertados = $omitidosExistentes = $omitidosSinCatedra = 0;
  
  // NUEVO: Log detallado de problemas
  $problemas = [];

  if (!$dry_run) $pdo->beginTransaction();

  foreach ($porDni as $dni => $lista) {
    // Detectar candidatos prioridad=1 por correlatividad
    $grupos = [];
    foreach ($lista as $p) {
      $c = $p['correlatividad'] ?? null;
      if ($c === null || $c === '') continue;
      $grupos[(string)$c][] = $p;
    }
    $cands = [];
    foreach ($grupos as $corr => $arr) {
      if (count($arr) >= 2) {
        usort($arr, fn($a,$b) => (int)$a['materia_id_curso'] <=> (int)$b['materia_id_curso']);
        $cands[] = [
          'id_previa'=>(int)$arr[0]['id_previa'],
          'curso'    =>(int)$arr[0]['materia_id_curso']
        ];
      }
    }
    $idPreviaPrio1 = null;
    if ($cands) {
      usort($cands, fn($a,$b) => $a['curso'] <=> $b['curso']);
      $idPreviaPrio1 = $cands[0]['id_previa'];
    }

    // INFO ESPECIAL 7º para este DNI (se completa cuando aparezca la primera previa de 7º)
    $infoSeptimo = null;

    // Orden estable por curso de la materia
    usort($lista, fn($a,$b) => (int)$a['materia_id_curso'] <=> (int)$b['materia_id_curso']);

    foreach ($lista as $p) {
      $id_previa  = (int)$p['id_previa'];
      $prioridad  = ($idPreviaPrio1 !== null && $id_previa === $idPreviaPrio1) ? 1 : 0;

      // ya existe mesa para esta previa?
      $stExisteMesa->execute([':idp'=>$id_previa]);
      if ($stExisteMesa->fetch()) {
        $omitidosExistentes++;
        continue;
      }

      $id_materia          = (int)$p['id_materia'];
      $materia_id_curso    = (int)$p['materia_id_curso'];
      $materia_id_division = (int)$p['materia_id_division'];
      $cursando_curso      = isset($p['cursando_id_curso']) ? (int)$p['cursando_id_curso'] : $materia_id_curso;
      $cursando_division   = isset($p['cursando_id_division']) ? (int)$p['cursando_id_division'] : $materia_id_division;

      // cátedra/docente: primero intentamos por curso/división de la materia
      $stBuscaCatedra->execute([
        ':idm'=>$id_materia,
        ':ic'=>$materia_id_curso,
        ':idv'=>$materia_id_division
      ]);
      $cat = $stBuscaCatedra->fetch(PDO::FETCH_ASSOC);

      if (!$cat) {
        // FALLBACK: intentar por curso/división donde el alumno está cursando
        $stBuscaCatedra->execute([
          ':idm'=>$id_materia,
          ':ic'=>$cursando_curso,
          ':idv'=>$cursando_division
        ]);
        $cat = $stBuscaCatedra->fetch(PDO::FETCH_ASSOC);
      }

      // NUEVO: FALLBACK CRÍTICO - Si no encuentra cátedra específica, buscar CUALQUIER cátedra de la materia
      if (!$cat) {
        $stBuscaCatedraFallback->execute([':idm'=>$id_materia]);
        $cat = $stBuscaCatedraFallback->fetch(PDO::FETCH_ASSOC);
        
        if ($cat) {
          $problemas[] = "ADVERTENCIA: Previa ID {$id_previa} (Materia {$id_materia}) asignada a cátedra genérica por falta de match específico";
        }
      }

      // NUEVO: Si aún no hay cátedra, crear una mesa con valores por defecto
      if (!$cat) {
        // Buscar cualquier cátedra para usar como referencia
        $catDefault = $pdo->query("SELECT id_catedra, id_docente FROM catedras LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        
        if (!$catDefault) {
          // Si no hay ninguna cátedra en el sistema, crear una temporal
          $cat = ['id_catedra' => 1, 'id_docente' => null];
          $problemas[] = "CRÍTICO: Previa ID {$id_previa} (Materia {$id_materia}) asignada con valores por defecto - NO HAY CÁTEDRAS EN EL SISTEMA";
        } else {
          $cat = $catDefault;
          $problemas[] = "CRÍTICO: Previa ID {$id_previa} (Materia {$id_materia}) asignada a cátedra por defecto ID {$cat['id_catedra']}";
        }
      }

      $id_catedra = (int)$cat['id_catedra'];
      $id_docente = isset($cat['id_docente']) ? (int)$cat['id_docente'] : null;

      $esCurso7 = ($materia_id_curso === 7);

      // ------- numero_mesa por clave especial -------
      // Normal: claveBase = materia#docente
      // 7º: se unifica por alumno+división de 7º (una sola mesa para todas las materias/docentes)
      if ($esCurso7) {
        $claveBase   = 'CUR7#DIV'.$materia_id_division.'#DNI'.$dni;
        $claveAlumno = $claveBase; // no usamos alterno por DNI en 7º
      } else {
        $claveBase   = $id_materia.'#'.$id_docente;
        $claveAlumno = $claveBase.'#'.$dni;
      }

      // obtener (o calcular) numero base
      if (!isset($cacheNumeroPorMD[$claveBase])) {
        $stNumeroExistente->execute([':idm'=>$id_materia, ':idd'=>$id_docente]);
        $row = $stNumeroExistente->fetch(PDO::FETCH_ASSOC);
        $cacheNumeroPorMD[$claveBase] = $row && isset($row['numero_mesa'])
          ? (int)$row['numero_mesa']
          : ++$siguienteNumero;
      }
      $nmCandidato = $cacheNumeroPorMD[$claveBase];

      if ($esCurso7) {
        // En 7º TODOS los docentes/materias del alumno+div comparten el MISMO numero_mesa
        $nm = $nmCandidato;
      } else {
        // Lógica estándar: si ese numero_mesa ya tiene al mismo DNI, crear alterno
        $dniYaEnBase = isset($dnisPorNumero[$nmCandidato][$dni]);
        if ($dniYaEnBase) {
          if (!isset($cacheNumeroPorMDAlumno[$claveAlumno])) {
            $cacheNumeroPorMDAlumno[$claveAlumno] = ++$siguienteNumero;
          }
          $nm = $cacheNumeroPorMDAlumno[$claveAlumno];
        } else {
          $nm = $nmCandidato;
        }
      }

      // *** NUEVO: registrar TODOS los docentes por numero_mesa ***
      if ($id_docente !== null) {
        if (!isset($docentesPorNumero[$nm])) {
          $docentesPorNumero[$nm] = [];
        }
        $docentesPorNumero[$nm][$id_docente] = true;
      }

      // Insert SIN fecha/turno
      if (!$dry_run) {
        $stInsertSinFecha->execute([
          ':nm'  => $nm,
          ':prio'=> $prioridad,
          ':cat' => $id_catedra,
          ':idp' => $id_previa,
          ':idd' => $id_docente
        ]);
        $newId = (int)$pdo->lastInsertId();
      } else {
        $newId = 0; // preview
      }

      // Recolectar ids de prio1 para agendar luego
      if ($prioridad === 1) {
        $idsPrio1PorNumero[$nm][] = $newId;
        $prio1CountPorNumero[$nm] = ($prio1CountPorNumero[$nm] ?? 0) + 1;
      }

      // registrar DNI en el numero elegido
      if (!isset($dnisPorNumero[$nm])) $dnisPorNumero[$nm] = [];
      $dnisPorNumero[$nm][$p['dni']] = true;

      // Si es la PRIMERA vez que vemos una previa de 7º para este DNI, guardamos info base
      if ($esCurso7 && $infoSeptimo === null) {
        $infoSeptimo = [
          'nm'       => $nm,
          'division' => $materia_id_division,
          'id_previa'=> $id_previa,
          'dni'      => $dni,
        ];
      }

      $insertados++;
    } // fin foreach $lista (todas las previas de este DNI)

    // ==================== REGLA ESPECIAL 7º: completar mesa única con TODAS las cátedras de 7º ====================
    if (!$dry_run && $infoSeptimo !== null) {
      $nm7   = $infoSeptimo['nm'];
      $div7  = $infoSeptimo['division'];
      $idp7  = $infoSeptimo['id_previa'];
      $dni7  = $infoSeptimo['dni'];

      // Obtener TODAS las cátedras (materias+docentes) de 7º de esa división
      $stCatedras7->execute([':div' => $div7]);
      $rows7 = $stCatedras7->fetchAll(PDO::FETCH_ASSOC);

      foreach ($rows7 as $row7) {
        $id_catedra7 = (int)$row7['id_catedra'];
        $id_docente7 = isset($row7['id_docente']) ? (int)$row7['id_docente'] : null;

        // Si ya existe una mesa para ese numero_mesa + cátedra + previa, no duplicar
        $stExisteMesaCatedra->execute([
          ':nm'  => $nm7,
          ':cat' => $id_catedra7,
          ':idp' => $idp7,
        ]);
        if ($stExisteMesaCatedra->fetch()) {
          continue;
        }

        // Insertar fila de 7º con prioridad=1
        $stInsertSinFecha->execute([
          ':nm'  => $nm7,
          ':prio'=> 1,
          ':cat' => $id_catedra7,
          ':idp' => $idp7,
          ':idd' => $id_docente7,
        ]);
        $newId7 = (int)$pdo->lastInsertId();

        $idsPrio1PorNumero[$nm7][] = $newId7;
        $prio1CountPorNumero[$nm7] = ($prio1CountPorNumero[$nm7] ?? 0) + 1;

        // *** NUEVO: registrar también estos docentes en la mesa de 7º ***
        if ($id_docente7 !== null) {
          if (!isset($docentesPorNumero[$nm7])) {
            $docentesPorNumero[$nm7] = [];
          }
          $docentesPorNumero[$nm7][$id_docente7] = true;
        }

        // Asegurar que el DNI del alumno figure en este numero_mesa
        if (!isset($dnisPorNumero[$nm7])) $dnisPorNumero[$nm7] = [];
        $dnisPorNumero[$nm7][$dni7] = true;
        $insertados++;
      }
    }

  } // fin foreach $porDni

  // ---------- Slots y asignación SOLO prio1 ----------
  $slots = [];
  foreach ($fechas as $f) {
    $slots[] = ['fecha'=>$f,'turno'=>1];
    $slots[] = ['fecha'=>$f,'turno'=>2];
  }
  $S = count($slots);

  $nms = array_keys($idsPrio1PorNumero);
  // ordenar por cantidad de prio1 desc, luego numero_mesa asc
  usort($nms, function($a,$b) use ($prio1CountPorNumero){
    $pa=$prio1CountPorNumero[$a]??0; $pb=$prio1CountPorNumero[$b]??0;
    if ($pa!==$pb) return ($pa>$pb)?-1:1;
    return $a<=>$b;
  });

  $dnisEnSlot = array_fill(0,$S,[]);
  $updates = []; // numero_mesa => slot index

  foreach ($nms as $nm) {
    $dnisNM = array_keys($dnisPorNumero[$nm] ?? []);
    // *** NUEVO: todos los docentes de ese numero_mesa ***
    $docsNM = array_keys($docentesPorNumero[$nm] ?? []);

    $mejor = -1; $bestInter = PHP_INT_MAX;
    for ($s=0; $s<$S; $s++) {
      $fechaS=$slots[$s]['fecha']; $turnoS=$slots[$s]['turno'];

      // indisponibilidad + máximo 3 slots distintos por docente
      $slotInvalido = false;
      foreach ($docsNM as $idDoc) {
        if ($slotProhibido($idDoc, $fechaS, $turnoS)) {
          $slotInvalido = true;
          break;
        }
        if ($docenteSuperaMax($idDoc, $fechaS, $turnoS)) {
          $slotInvalido = true;
          break;
        }
      }
      if ($slotInvalido) continue;

      $inter = 0;
      foreach($dnisNM as $d){
        if(isset($dnisEnSlot[$s][$d])) $inter++;
      }

      if ($inter===0) { $mejor=$s; $bestInter=0; break; }
      if ($inter < $bestInter) { $mejor=$s; $bestInter=$inter; }
    }

    if ($mejor<0) $mejor = $S-1;

    $updates[$nm]=$mejor;
    foreach($dnisNM as $d){ $dnisEnSlot[$mejor][$d]=true; }

    // *** NUEVO: registrar el slot para TODOS los docentes de la mesa ***
    foreach ($docsNM as $idDoc) {
      $registrarDocenteEnSlot($idDoc, $slots[$mejor]['fecha'], $slots[$mejor]['turno']);
    }
  }

  // UPDATE masivo de filas recién insertadas con prio1
  if (!$dry_run) {
    foreach ($updates as $nm=>$s) {
      $ids = array_filter($idsPrio1PorNumero[$nm] ?? []);
      if (!$ids) continue;
      $ph = implode(',', array_fill(0,count($ids),'?'));
      $params = [$slots[$s]['fecha']];

      if ($colTurnoExiste) $params[] = $slots[$s]['turno'];
      $params = array_merge($params, $ids);

      if ($colTurnoExiste) {
        $pdo->prepare("UPDATE mesas SET fecha_mesa=?, id_turno=? WHERE id_mesa IN ($ph)")->execute($params);
      } else {
        $pdo->prepare("UPDATE mesas SET fecha_mesa=? WHERE id_mesa IN ($ph)")->execute($params);
      }
    }
  }

  if (!$dry_run) $pdo->commit();

  // NUEVO: Verificar que todas las previas tengan mesa
  $previasSinMesa = [];
  foreach ($previas as $p) {
    $stExisteMesa->execute([':idp' => (int)$p['id_previa']]);
    if (!$stExisteMesa->fetch()) {
      $previasSinMesa[] = $p;
    }
  }

  respond(true, [
    'resumen'=>[
      'dias'                 => count($fechas),
      'total_previas'        => count($previas),
      'insertados'           => $insertados,
      'omitidos_existentes'  => $omitidosExistentes,
      'omitidos_sin_catedra' => $omitidosSinCatedra,
      'agendados_prio'       => array_sum(array_map('count',$idsPrio1PorNumero)),
      'previas_sin_mesa'     => count($previasSinMesa), // NUEVO: para debugging
      'problemas_encontrados'=> count($problemas)       // NUEVO: para debugging
    ],
    'slots'=>$slots,
    'debug'=>[ // NUEVO: información de debugging
      'previas_sin_mesa' => $previasSinMesa,
      'problemas' => $problemas
    ],
    'nota'=>'Se tomaron TODAS las previas con inscripcion=1 e id_condicion=3. 
Las materias sin fila en `materias` entran igual (sin correlatividad) gracias al LEFT JOIN.
La búsqueda de cátedra ahora intenta primero por curso/división de la materia y, si no existe, por curso/división de cursado del alumno.
FALLBACK CRÍTICO: Si no encuentra cátedra específica, usa cualquier cátedra de la materia o valores por defecto.
El resto de las reglas (correlatividad, 7º año, límite de slots por docente, fines de semana, etc.) se mantienen.'
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  respond(false, 'Error en el servidor: '.$e->getMessage(), 500);
}