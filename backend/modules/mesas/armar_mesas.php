<?php
// backend/modules/mesas/armar_mesas.php
// -----------------------------------------------------------------------------
// Inserta MESAS desde PREVIAS (inscripcion=1, id_condicion=3) con mejoras:
// - Evita que un mismo DNI quede dos veces en la MISMA numero_mesa (cuando
//   el alumno tiene la misma materia y el mismo docente en distintos cursos):
//   si el DNI ya está presente en el numero_mesa base (materia+docente),
//   se crea un numero_mesa alternativo exclusivo para ese DNI.
// - Mantiene prioridad=1 por correlatividad y agenda SOLO esas filas en los
//   primeros slots posibles respetando disponibilidad del docente y minimizando
//   choques de DNIs.
// - NUEVO: respeta un máximo de 3 TURNOS DISTINTOS por docente (fecha+turno).
//   Si el slot ya lo usa el docente, no cuenta como “vez” nueva; si sería un
//   4º turno distinto, se evita asignarlo a ese slot.
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

// ---------- Utilidades ----------
function respond(bool $ok, $payload = null, int $status = 200): void {
  if (ob_get_length()) { @ob_clean(); }
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito'=>true, 'data'=>$payload]
       : ['exito'=>false, 'mensaje'=>(is_string($payload)?$payload:'Error desconocido')],
    JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES
  ); exit;
}
function bad_request(string $m): void { respond(false, $m, 400); }
function validarFecha(?string $s): bool {
  if (!$s) return false;
  $d = DateTime::createFromFormat('Y-m-d', $s);
  return $d && $d->format('Y-m-d') === $s;
}
function rangoFechas(string $inicio, string $fin): array {
  $di = new DateTime($inicio); $df = new DateTime($fin);
  if ($df < $di) return [];
  $out=[]; while ($di <= $df) { $out[] = $di->format('Y-m-d'); $di->modify('+1 day'); }
  return $out;
}
function estadoColumnaTurno(PDO $pdo): array {
  $sql="SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='mesas' AND COLUMN_NAME='id_turno' LIMIT 1";
  $st = $pdo->query($sql); $row = $st ? $st->fetch(PDO::FETCH_ASSOC) : null;
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
  $fechas = rangoFechas($fecha_inicio, $fecha_fin);
  if (!$fechas) bad_request("El rango de fechas es inválido.");

  // ---------- PREVIAS + correlativa ----------
  $sqlPrev = "
    SELECT
      pr.id_previa, pr.dni, pr.alumno,
      pr.id_materia, pr.materia_id_curso, pr.materia_id_division,
      m.correlativa AS correlatividad
    FROM mesas_examen.previas pr
    INNER JOIN mesas_examen.materias m ON m.id_materia = pr.id_materia
    WHERE pr.inscripcion = 1 AND pr.id_condicion = 3
  ";
  $previas = $pdo->query($sqlPrev)->fetchAll(PDO::FETCH_ASSOC);

  if (!$previas) {
    respond(true, [
      'resumen' => [
        'dias'=>count($fechas),
        'total_previas'=>0,
        'insertados'=>0,
        'omitidos_existentes'=>0,
        'omitidos_sin_catedra'=>0,
        'agendados_prio'=>0
      ],
      'slots'=>[],
      'nota'=>'No hay previas inscriptas.'
    ]);
  }

  // Agrupar por DNI para calcular prioridad por correlativa
  $porDni = [];
  foreach ($previas as $p) { $porDni[$p['dni']][] = $p; }

  $turnoInfo = estadoColumnaTurno($pdo);
  $colTurnoExiste  = $turnoInfo['existe'];
  $colTurnoNotNull = $turnoInfo['not_null'];

  // Disponibilidad docentes
  $docNo = []; // id_docente => ['fecha_no'=>?string,'turno_no'=>?int]
  $rsDoc = $pdo->query("SELECT id_docente, id_turno_no, fecha_no FROM mesas_examen.docentes WHERE activo=1");
  if ($rsDoc) {
    foreach ($rsDoc->fetchAll(PDO::FETCH_ASSOC) as $d) {
      $docNo[(int)$d['id_docente']] = [
        'fecha_no' => $d['fecha_no'] ?? null,
        'turno_no' => isset($d['id_turno_no']) ? (int)$d['id_turno_no'] : null
      ];
    }
  }
  $slotProhibido = function(int $id_docente, string $fecha, int $turno) use ($docNo): bool {
    if (!isset($docNo[$id_docente])) return false;
    $fno = $docNo[$id_docente]['fecha_no'] ?? null;
    $tno = $docNo[$id_docente]['turno_no'] ?? null;
    if ($fno && $fno === $fecha) return true;     // bloquea todo el día
    if ($tno !== null && $tno === $turno) return true; // bloquea turno cada día
    return false;
  };

  // ========= NUEVO: mapa de (docente -> set de slots distintos ya usados) =========
  $docenteSlots = []; // [id_docente] => ['YYYY-MM-DD|turno' => true, ...]
  $rsUsed = $pdo->query("
    SELECT DISTINCT m.id_docente, m.fecha_mesa, m.id_turno
    FROM mesas_examen.mesas m
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
    // si ya usa ESTE MISMO slot, permitir (no suma “vez”)
    if (isset($ya[$key])) return false;
    // si ya tiene 3 slots distintos, NO permitir un 4º
    return (count($ya) >= 3);
  };
  $registrarDocenteEnSlot = function(int $id_docente, string $fecha, int $turno) use (&$docenteSlots): void {
    if ($id_docente<=0) return;
    $docenteSlots[$id_docente][$fecha.'|'.$turno] = true;
  };

  // Sentencias
  $stExisteMesa = $pdo->prepare("SELECT 1 FROM mesas_examen.mesas WHERE id_previa=:idp LIMIT 1");
  $stBuscaCatedra = $pdo->prepare("
    SELECT id_catedra, id_docente
    FROM mesas_examen.catedras
    WHERE id_materia=:idm AND id_curso=:ic AND id_division=:idv
    LIMIT 1
  ");
  $stNumeroExistente = $pdo->prepare("
    SELECT m.numero_mesa
    FROM mesas_examen.mesas m
    INNER JOIN mesas_examen.catedras c ON c.id_catedra = m.id_catedra
    WHERE c.id_materia=:idm AND m.id_docente=:idd
    ORDER BY m.numero_mesa ASC
    LIMIT 1
  ");
  $rowMax = $pdo->query("SELECT COALESCE(MAX(numero_mesa),0) AS maxnum FROM mesas_examen.mesas")
                ->fetch(PDO::FETCH_ASSOC);
  $siguienteNumero = (int)($rowMax['maxnum'] ?? 0);

  // Insert SIEMPRE sin fecha/turno (también prio=1)
  if ($colTurnoExiste && $colTurnoNotNull) {
    $stInsertSinFecha = $pdo->prepare("
      INSERT INTO mesas_examen.mesas
        (numero_mesa, prioridad, id_catedra, id_previa, id_docente, fecha_mesa, id_turno)
      VALUES
        (:nm,:prio,:cat,:idp,:idd,NULL,NULL)
    ");
  } else {
    $stInsertSinFecha = $pdo->prepare("
      INSERT INTO mesas_examen.mesas
        (numero_mesa, prioridad, id_catedra, id_previa, id_docente, fecha_mesa)
      VALUES
        (:nm,:prio,:cat,:idp,:idd,NULL)
    ");
  }

  $cacheNumeroPorMD = [];             // "materia#docente" => numero_mesa base
  $cacheNumeroPorMDAlumno = [];       // "materia#docente#dni" => numero_mesa alterno
  $docentePorNumero = [];
  $dnisPorNumero = [];                // numero_mesa => set dni
  $idsPrio1PorNumero  = [];           // numero_mesa => [id_mesa prio1]
  $prio1CountPorNumero= [];
  $insertados = $omitidosExistentes = $omitidosSinCatedra = 0;

  if (!$dry_run) $pdo->beginTransaction();

  foreach ($porDni as $dni => $lista) {
    // Detectar candidatos prioridad=1 por correlatividad
    $grupos = [];
    foreach ($lista as $p) {
      $c = $p['correlatividad'];
      if ($c===null || $c==='') continue;
      $grupos[(string)$c][] = $p;
    }
    $cands = [];
    foreach ($grupos as $corr => $arr) {
      if (count($arr) >= 2) {
        usort($arr, fn($a,$b) => (int)$a['materia_id_curso'] <=> (int)$b['materia_id_curso']);
        $cands[] = ['id_previa'=>(int)$arr[0]['id_previa'], 'curso'=>(int)$arr[0]['materia_id_curso']];
      }
    }
    $idPreviaPrio1 = null;
    if ($cands) {
      usort($cands, fn($a,$b) => $a['curso'] <=> $b['curso']);
      $idPreviaPrio1 = $cands[0]['id_previa'];
    }

    // Orden estable por curso
    usort($lista, fn($a,$b) => (int)$a['materia_id_curso'] <=> (int)$b['materia_id_curso']);

    foreach ($lista as $p) {
      $id_previa  = (int)$p['id_previa'];
      $prioridad  = ($idPreviaPrio1 !== null && $id_previa === $idPreviaPrio1) ? 1 : 0;

      // ya existe?
      $stExisteMesa->execute([':idp'=>$id_previa]);
      if ($stExisteMesa->fetch()) { $omitidosExistentes++; continue; }

      // cátedra/docente
      $stBuscaCatedra->execute([
        ':idm'=>$p['id_materia'], ':ic'=>$p['materia_id_curso'], ':idv'=>$p['materia_id_division']
      ]);
      $cat = $stBuscaCatedra->fetch(PDO::FETCH_ASSOC);
      if (!$cat) { $omitidosSinCatedra++; continue; }

      $id_catedra = (int)$cat['id_catedra'];
      $id_docente = (int)$cat['id_docente'];
      $id_materia = (int)$p['id_materia'];

      // ------- numero_mesa por (materia,docente) con salvaguarda por DNI -------
      $claveBase = $id_materia.'#'.$id_docente;
      $claveAlumno = $claveBase.'#'.$dni;

      // obtener (o calcular) numero base
      if (!isset($cacheNumeroPorMD[$claveBase])) {
        $stNumeroExistente->execute([':idm'=>$id_materia, ':idd'=>$id_docente]);
        $row = $stNumeroExistente->fetch(PDO::FETCH_ASSOC);
        $cacheNumeroPorMD[$claveBase] = $row && isset($row['numero_mesa'])
          ? (int)$row['numero_mesa']
          : ++$siguienteNumero;
      }
      $nmCandidato = $cacheNumeroPorMD[$claveBase];

      // si ese numero_mesa ya tiene al mismo DNI, asignar/crear alterno
      $dniYaEnBase = isset($dnisPorNumero[$nmCandidato][$dni]);
      if ($dniYaEnBase) {
        if (!isset($cacheNumeroPorMDAlumno[$claveAlumno])) {
          $cacheNumeroPorMDAlumno[$claveAlumno] = ++$siguienteNumero;
        }
        $nm = $cacheNumeroPorMDAlumno[$claveAlumno];
      } else {
        $nm = $nmCandidato;
      }

      $docentePorNumero[$nm] = $id_docente;

      // Insert SIN fecha/turno
      if (!$dry_run) {
        $stInsertSinFecha->execute([':nm'=>$nm, ':prio'=>$prioridad, ':cat'=>$id_catedra, ':idp'=>$id_previa, ':idd'=>$id_docente]);
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
      $dnisPorNumero[$nm][$p['dni']] = true;

      $insertados++;
    }
  }

  // ---------- Slots y asignación SOLO prio1 ----------
  $slots=[]; foreach($fechas as $f){ $slots[]=['fecha'=>$f,'turno'=>1]; $slots[]=['fecha'=>$f,'turno'=>2]; }
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
    $idDoc  = (int)($docentePorNumero[$nm] ?? 0);

    $mejor = -1; $bestInter = PHP_INT_MAX;
    for ($s=0; $s<$S; $s++) {
      $fechaS=$slots[$s]['fecha']; $turnoS=$slots[$s]['turno'];

      // indisponibilidad + NUEVO: máximo 3 slots distintos por docente
      if ($idDoc>0) {
        if ($slotProhibido($idDoc, $fechaS, $turnoS)) continue;
        if ($docenteSuperaMax($idDoc, $fechaS, $turnoS)) continue;
      }

      $inter=0; foreach($dnisNM as $d){ if(isset($dnisEnSlot[$s][$d])) $inter++; }

      if ($inter===0) { $mejor=$s; $bestInter=0; break; }

      if ($inter < $bestInter) { $mejor=$s; $bestInter=$inter; }
    }

    if ($mejor<0) $mejor = $S-1;

    $updates[$nm]=$mejor;
    foreach($dnisNM as $d){ $dnisEnSlot[$mejor][$d]=true; }

    // registrar uso del slot por el docente (solo si no lo tenía)
    if ($idDoc>0) {
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
        $pdo->prepare("UPDATE mesas_examen.mesas SET fecha_mesa=?, id_turno=? WHERE id_mesa IN ($ph)")->execute($params);
      } else {
        $pdo->prepare("UPDATE mesas_examen.mesas SET fecha_mesa=? WHERE id_mesa IN ($ph)")->execute($params);
      }
    }
  }

  if (!$dry_run) $pdo->commit();

  respond(true, [
    'resumen'=>[
      'dias'=>count($fechas),
      'total_previas'=>count($previas),
      'insertados'=>$insertados,
      'omitidos_existentes'=>$omitidosExistentes,
      'omitidos_sin_catedra'=>$omitidosSinCatedra,
      'agendados_prio'=>array_sum(array_map('count',$idsPrio1PorNumero))
    ],
    'slots'=>$slots,
    'nota'=>'Se agendaron SOLO prioridad=1. Se evitó duplicar al mismo alumno dentro de un mismo numero_mesa y se respetó el máximo de 3 turnos distintos por docente.'
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  respond(false, 'Error en el servidor: '.$e->getMessage(), 500);
}
