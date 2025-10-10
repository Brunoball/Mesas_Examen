<?php
// backend/modules/mesas/armar_mesa_grupo.php
// -----------------------------------------------------------------------------
// Versión: "correlatividad estricta por DNI+área" + split selectivo por DNI
// - Si una mesa de curso MAYOR queda antes que otra de curso MENOR del mismo
//   alumno (mismo DNI) y misma área, primero INTENTA separar sólo a ese alumno
//   del numero_mesa problemático SI ese numero_mesa tiene “muchos alumnos”
//   (umbral configurable: 3 o más). Se le asigna un numero_mesa nuevo con el
//   mismo docente, se limpian fecha/turno y se deja re-agendar/agrupado luego.
// - Si no aplica split (o falla), se usa el diferimiento que ya existía: quitar
//   fecha/turno del numero_mesa mayor (o del grupo) para reubicar después.
// - Mantiene: no duplicar DNIs en el mismo slot, prioridad=1 se agenda temprano,
//   indisponibilidades de docentes y agrupación 2/3/4 por área.
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

// ---------------- Config ----------------
const UMBRAL_SPLIT_MUCHOS_ALUMNOS = 3; // si el numero_mesa tiene ≥3 DNIs, se habilita split selectivo

// ---------------- Utils ----------------
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
  if(!$s) return false;
  $d=DateTime::createFromFormat('Y-m-d',$s);
  return $d && $d->format('Y-m-d')===$s;
}
function rangoFechas(string $inicio,string $fin): array {
  $di=new DateTime($inicio); $df=new DateTime($fin);
  if($df<$di) return [];
  $out=[]; while($di<=$df){ $out[]=$di->format('Y-m-d'); $di->modify('+1 day'); }
  return $out;
}
function pad4(array $g): array {
  $n = count($g);
  if ($n===1) return [$g[0],0,0,0];
  if ($n===2) return [$g[0],$g[1],0,0];
  if ($n===3) return [$g[0],$g[1],$g[2],0];
  return [$g[0],$g[1],$g[2],$g[3]];
}

// ---------------- DNI helpers ----------------
/** [numero_mesa => array<string dni>] */
function mapDNIsPorNumero(PDO $pdo): array {
  $sql = "
    SELECT m.numero_mesa, p.dni
    FROM mesas_examen.mesas m
    INNER JOIN mesas_examen.previas p ON p.id_previa = m.id_previa
  ";
  $res = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
  $out=[];
  foreach($res as $r){
    $nm=(int)$r['numero_mesa']; $dni=(string)$r['dni'];
    if(!isset($out[$nm])) $out[$nm]=[];
    $out[$nm][$dni]=true;
  }
  foreach($out as $nm=>$set){ $out[$nm]=array_keys($set); }
  return $out;
}
function numeroChocaSet(array $dnisMap, int $nm, array $set): bool {
  if ($nm===0) return false;
  $A=$dnisMap[$nm]??[];
  if(!$A || !$set) return false;
  $h=array_flip($set);
  foreach($A as $x){ if(isset($h[$x])) return true; }
  return false;
}
function unionDNIs(array $dnisMap, array $numeros): array {
  $u=[];
  foreach($numeros as $nm){
    foreach(($dnisMap[$nm]??[]) as $d){ $u[$d]=true; }
  }
  return array_keys($u);
}

// ---------------- Armado sin choques (3->2->4) ----------------
/** Crea grupos evitando choques internos de DNI; 3 -> 2 -> 4; luego singles */
function crearGruposSinChoque(array $nums, array $dnisMap): array {
  sort($nums, SORT_NUMERIC);
  $rest = $nums;
  $grupos = [];

  $forma = function(int $target, array &$rest, array $dnisMap){
    $n = count($rest);
    if ($n===0) return null;
    for ($i=0; $i<$n; $i++){
      $seed = $rest[$i];
      $grupo = [$seed];
      $acum = unionDNIs($dnisMap, $grupo);
      for ($j=0; $j<$n && count($grupo)<$target; $j++){
        if ($j===$i) continue;
        $cand = $rest[$j];
        if (!numeroChocaSet($dnisMap, $cand, $acum)) {
          $grupo[] = $cand;
          $acum = unionDNIs($dnisMap, $grupo);
        }
      }
      if (count($grupo)===$target) {
        $rest = array_values(array_diff($rest, $grupo));
        return $grupo;
      }
    }
    return null;
  };

  while (true) { $g = $forma(3, $rest, $dnisMap); if ($g===null) break; $grupos[] = $g; }
  while (true) { $g = $forma(2, $rest, $dnisMap); if ($g===null) break; $grupos[] = $g; }
  while (count($rest)>=4) {
    $tmp = $rest;
    $g = $forma(4, $tmp, $dnisMap);
    if ($g===null) break;
    $rest = array_values(array_diff($rest, $g));
    $grupos[] = $g;
  }
  foreach ($rest as $x) $grupos[] = [$x];
  return $grupos;
}

// ---------------- Expansiones a 4 ----------------
function expandirATresMasUnoEnSlot(array $grupo3, array &$rest, array $dnisMap, array $docPorNM,
                                   callable $slotProhibido, string $fecha, int $turno,
                                   array $dnisSlotActual): array {
  $dnisG = unionDNIs($dnisMap, $grupo3);
  foreach ($rest as $k => $nm) {
    $doc = $docPorNM[$nm] ?? 0;
    if ($doc>0 && $slotProhibido($doc, $fecha, $turno)) continue;
    if (numeroChocaSet($dnisMap, $nm, $dnisG)) continue;
    if (numeroChocaSet($dnisMap, $nm, $dnisSlotActual)) continue;
    unset($rest[$k]);
    return array_values(array_merge($grupo3, [$nm]));
  }
  return $grupo3;
}
function expandirATresMasUnoSinSlot(array $grupo3, array &$rest, array $dnisMap): array {
  $dnisG = unionDNIs($dnisMap, $grupo3);
  foreach ($rest as $k=>$nm) {
    if (!numeroChocaSet($dnisMap, $nm, $dnisG)) {
      unset($rest[$k]);
      return array_values(array_merge($grupo3, [$nm]));
    }
  }
  return $grupo3;
}

// ---------------- Split selectivo por DNI (NUEVO) ----------------
/**
 * Separa las filas del alumno ($dni) que están dentro del numero_mesa $nmOrigen
 * y les asigna un numero_mesa NUEVO (MAX+1), preservando id_docente por fila,
 * y limpiando fecha_mesa/id_turno para re-agendar.
 * Devuelve el numero_mesa nuevo si hubo split, o null si no hizo nada.
 */
function splitAlumnoEnNumeroMesa(PDO $pdo, int $nmOrigen, string $dni): ?int {
  // ¿Cuántos DNIs únicos tiene el numero_mesa origen?
  $stCount = $pdo->prepare("
    SELECT COUNT(DISTINCT p.dni) AS cnt
    FROM mesas_examen.mesas m
    INNER JOIN mesas_examen.previas p ON p.id_previa = m.id_previa
    WHERE m.numero_mesa = :nm
  ");
  $stCount->execute([':nm'=>$nmOrigen]);
  $cnt = (int)($stCount->fetchColumn() ?: 0);
  if ($cnt < UMBRAL_SPLIT_MUCHOS_ALUMNOS) return null; // no aplica split

  // nuevo numero_mesa
  $rowMax = $pdo->query("SELECT COALESCE(MAX(numero_mesa),0) FROM mesas_examen.mesas")->fetch(PDO::FETCH_NUM);
  $nmNuevo = (int)($rowMax[0] ?? 0) + 1;

  // Mover filas del alumno: mantener id_docente / id_catedra / prioridad; limpiar fecha/turno
  // Usamos UPDATE con JOIN a previas por DNI
  $stUpd = $pdo->prepare("
    UPDATE mesas_examen.mesas m
    INNER JOIN mesas_examen.previas p ON p.id_previa = m.id_previa
    SET m.numero_mesa = :nmNuevo,
        m.fecha_mesa  = NULL,
        m.id_turno    = NULL
    WHERE m.numero_mesa = :nmOrigen
      AND p.dni = :dni
  ");
  $stUpd->execute([':nmNuevo'=>$nmNuevo, ':nmOrigen'=>$nmOrigen, ':dni'=>$dni]);

  // Validar que realmente se movió algo
  $moved = $stUpd->rowCount();
  if ($moved <= 0) return null;

  // limpiar cualquier rastro en "no_agrupadas" del origen en el slot actual (si hubiera)
  // (no es estrictamente necesario, luego purgamos por consistencia)
  return $nmNuevo;
}

if (!isset($pdo) || !$pdo instanceof PDO) {
  bad_request("Error: no se encontró la conexión PDO (backend/config/db.php).");
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(false,'Método no permitido',405);

  $input = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($input)) $input = [];

  $dryRun       = !empty($input['dry_run']);
  $agendar      = !empty($input['agendar_no_fechadas']);
  $filtroFecha  = $input['fecha_mesa'] ?? null;
  $filtroTurno  = $input['id_turno']   ?? null;

  if ($filtroFecha!==null && !validarFecha((string)$filtroFecha)) bad_request("Parametro 'fecha_mesa' inválido (YYYY-MM-DD).");
  if ($filtroTurno!==null && !in_array((int)$filtroTurno,[1,2],true)) bad_request("Parametro 'id_turno' inválido (1|2).");

  $fechasRango=[];
  if ($agendar) {
    $fi = $input['fecha_inicio'] ?? null;
    $ff = $input['fecha_fin'] ?? null;
    if (!validarFecha($fi) || !validarFecha($ff)) bad_request("Para 'agendar_no_fechadas'=1 debés enviar 'fecha_inicio' y 'fecha_fin'.");
    $fechasRango = rangoFechas($fi,$ff);
    if (!$fechasRango) bad_request("Rango de fechas inválido.");
  }

  // indisponibilidades docentes
  $docNo=[];
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
    if ($fno && $fno===$fecha) return true;           // bloquea todo el día
    if ($tno!==null && $tno===$turno) return true;    // bloquea ese turno siempre
    return false;
  };

  // ===== Datos base: DNIs por numero, curso por DNI/numero y área por numero =====
  $dnisPorNumero = mapDNIsPorNumero($pdo);

  $cursoPorNumeroPorDni = [];   // [nm][dni] => min(curso)
  $areaPorNumero        = [];   // [nm] => id_area
  $docPorNM             = [];   // [nm] => id_docente
  $resCur = $pdo->query("
    SELECT m.numero_mesa, p.dni, p.materia_id_curso AS curso, mat.id_area, MIN(m.id_docente) AS id_docente
    FROM mesas_examen.mesas m
    INNER JOIN mesas_examen.previas p  ON p.id_previa = m.id_previa
    INNER JOIN mesas_examen.catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN mesas_examen.materias mat ON mat.id_materia = c.id_materia
    GROUP BY m.numero_mesa, p.dni, p.materia_id_curso, mat.id_area
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach ($resCur as $r) {
    $nm=(int)$r['numero_mesa']; $dni=(string)$r['dni']; $curso=(int)$r['curso']; $area=(int)$r['id_area'];
    if (!isset($cursoPorNumeroPorDni[$nm])) $cursoPorNumeroPorDni[$nm]=[];
    if (!isset($cursoPorNumeroPorDni[$nm][$dni]) || $curso < $cursoPorNumeroPorDni[$nm][$dni]) {
      $cursoPorNumeroPorDni[$nm][$dni]=$curso;
    }
    $areaPorNumero[$nm] = $area;
    $docPorNM[$nm] = (int)$r['id_docente'];
  }

  // Prioridad por numero_mesa (si alguna fila del numero tiene prioridad=1)
  $prioPorNumero = [];
  $resPr = $pdo->query("
    SELECT numero_mesa, MAX(prioridad) AS prio
    FROM mesas_examen.mesas
    GROUP BY numero_mesa
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach ($resPr as $r) { $prioPorNumero[(int)$r['numero_mesa']] = (int)$r['prio']; }

  // ---------------- Mesas ya fechadas ----------------
  $paramsF=[];
  $sqlFechadas = "
    SELECT m.numero_mesa, m.fecha_mesa, m.id_turno,
           MIN(m.id_docente) AS id_docente,
           mat.id_area AS id_area
    FROM mesas_examen.mesas m
    INNER JOIN mesas_examen.catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN mesas_examen.materias mat ON mat.id_materia = c.id_materia
    WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
  ";
  if ($filtroFecha!==null) { $sqlFechadas.=" AND m.fecha_mesa=:f "; $paramsF[':f']=$filtroFecha; }
  if ($filtroTurno!==null) { $sqlFechadas.=" AND m.id_turno=:t ";   $paramsF[':t']=(int)$filtroTurno; }
  $sqlFechadas.=" GROUP BY m.numero_mesa,m.fecha_mesa,m.id_turno,mat.id_area
                  ORDER BY m.fecha_mesa,m.id_turno,mat.id_area,m.numero_mesa";
  $stF=$pdo->prepare($sqlFechadas); $stF->execute($paramsF);
  $rowsFechadas=$stF->fetchAll(PDO::FETCH_ASSOC);

  // ----- Orden y mapa de slots (fecha+turno) para comparar precedencias -----
  $slotsOrden = []; $seen = [];
  foreach ($rowsFechadas as $r) {
    $key=$r['fecha_mesa'].'|'.$r['id_turno'];
    if(!isset($seen[$key])){ $seen[$key]=true; $slotsOrden[]=['fecha'=>$r['fecha_mesa'],'turno'=>(int)$r['id_turno']]; }
  }
  if ($agendar) {
    foreach ($fechasRango as $f) {
      foreach ([1,2] as $t) {
        $key="$f|$t";
        if (!isset($seen[$key])) { $seen[$key]=true; $slotsOrden[]=['fecha'=>$f,'turno'=>$t]; }
      }
    }
  }
  usort($slotsOrden, fn($A,$B)=>strcmp($A['fecha'],$B['fecha']) ?: ($A['turno']<=>$B['turno']));
  $slotIdxMap = [];
  foreach ($slotsOrden as $i=>$s) { $slotIdxMap[$s['fecha'].'|'.$s['turno']]=$i; }

  // DNIs ya ocupados por slot
  $dnisEnSlot=[];
  foreach ($rowsFechadas as $r){
    $key=$r['fecha_mesa'].'|'.$r['id_turno'];
    foreach(($dnisPorNumero[(int)$r['numero_mesa']]??[]) as $dni){ $dnisEnSlot[$key][$dni]=true; }
  }

  // ----- Agenda existente por DNI/Área con su curso y slotIndex -----
  $agendaDniArea = []; // [dni][area] => array of ['slot'=>idx,'curso'=>int,'nm'=>int]
  foreach ($rowsFechadas as $r) {
    $nm=(int)$r['numero_mesa']; $area=(int)$r['id_area'];
    $key=$r['fecha_mesa'].'|'.$r['id_turno'];
    $sidx = $slotIdxMap[$key] ?? null;
    if ($sidx===null) continue;
    foreach (($dnisPorNumero[$nm]??[]) as $dni) {
      $curso = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
      if ($curso===null) continue;
      $agendaDniArea[$dni][$area][] = ['slot'=>$sidx,'curso'=>$curso,'nm'=>$nm];
    }
  }

  // === PRECEDENCIA ESTRICTA (DETECCIÓN + SPLIT SELECTIVO + DIFERIMIENTO) ===
  $stFindGrupo = $pdo->prepare("
    SELECT id_mesa_grupos, numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
    FROM mesas_examen.mesas_grupos
    WHERE fecha_mesa = :f AND id_turno = :t
      AND (:n IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4))
    LIMIT 1
  ");
  $stDelGrupo = $pdo->prepare("DELETE FROM mesas_examen.mesas_grupos WHERE id_mesa_grupos = :id");
  $stUnsetFecha = $pdo->prepare("
    UPDATE mesas_examen.mesas
       SET fecha_mesa=NULL, id_turno=NULL
     WHERE numero_mesa=:n AND fecha_mesa=:f AND id_turno=:t
  ");

  $deferidos = [];        // numeros diferidos => true
  $splitHechos = [];      // [['dni'=>, 'nm_origen'=>, 'nm_nuevo'=>], ...]
  $huboCambiosEstructura = false;

  if (!$dryRun && !empty($agendaDniArea)) {
    // Recorremos por DNI+área
    foreach ($agendaDniArea as $dni => $areas) {
      foreach ($areas as $area => $regs) {
        usort($regs, fn($a,$b)=>$a['slot']<=>$b['slot']); // por orden actual
        // Detectar violaciones: mayor antes que menor en el tiempo
        // Recorremos y si encontramos (curso mayor) en slot < slot de (menor), actuamos
        $minCursoGlobal = PHP_INT_MAX;
        foreach ($regs as $info) { $minCursoGlobal = min($minCursoGlobal, $info['curso']); }

        foreach ($regs as $infoMayor) {
          // ¿existe un MENOR con slot posterior?
          $hayMenorDespues = false;
          foreach ($regs as $infoMenor) {
            if ($infoMenor['curso'] < $infoMayor['curso'] && $infoMenor['slot'] > $infoMayor['slot']) {
              $hayMenorDespues = true;
              break;
            }
          }
          if (!$hayMenorDespues) continue; // no hay violación con este candidato

          // Tenemos violación: primero intentar SPLIT SELECTIVO si el numero_mesa del mayor es "grande"
          $nmMayor = (int)$infoMayor['nm'];

          // ¿cuántos DNIs tiene ese numero_mesa?
          $dnIsDelNM = $dnisPorNumero[$nmMayor] ?? [];
          $cantDnisNM = count($dnIsDelNM);

          $seHizoSplit = false;
          if ($cantDnisNM >= UMBRAL_SPLIT_MUCHOS_ALUMNOS) {
            // Split: mover sólo las filas de ESTE DNI desde nmMayor a un numero_mesa nuevo
            $nmNuevo = splitAlumnoEnNumeroMesa($pdo, $nmMayor, (string)$dni);
            if ($nmNuevo !== null) {
              $splitHechos[] = ['dni'=>$dni, 'nm_origen'=>$nmMayor, 'nm_nuevo'=>$nmNuevo];
              $huboCambiosEstructura = true;
              $seHizoSplit = true;
            }
          }

          if (!$seHizoSplit) {
            // Si no se puede splittear (o no corresponde), diferir como antes
            // hallar fecha/turno actuales del nmMayor
            $fecha=null; $turno=null;
            foreach ($rowsFechadas as $rF) {
              if ((int)$rF['numero_mesa']===$nmMayor) { $fecha=$rF['fecha_mesa']; $turno=(int)$rF['id_turno']; break; }
            }
            if ($fecha!==null && $turno!==null) {
              // ¿pertenece a un grupo? si sí, eliminarlo y diferir a TODOS los de ese grupo
              $stFindGrupo->execute([':f'=>$fecha,':t'=>$turno,':n'=>$nmMayor]);
              if ($g=$stFindGrupo->fetch(PDO::FETCH_ASSOC)) {
                $numsG = array_values(array_filter([
                  (int)$g['numero_mesa_1'], (int)$g['numero_mesa_2'], (int)$g['numero_mesa_3'], (int)$g['numero_mesa_4']
                ]));
                $stDelGrupo->execute([':id'=>(int)$g['id_mesa_grupos']]);
                foreach ($numsG as $nx) {
                  $stUnsetFecha->execute([':n'=>$nx,':f'=>$fecha,':t'=>$turno]);
                  $deferidos[$nx]=true;
                }
              } else {
                // single o no agrupada -> sólo esa mesa
                $stUnsetFecha->execute([':n'=>$nmMayor,':f'=>$fecha,':t'=>$turno]);
                $deferidos[$nmMayor]=true;
              }
              $huboCambiosEstructura = true;
            }
          }
        }
      }
    }

    if ($huboCambiosEstructura) {
      // Refrescar estructuras base luego de splits/diferimientos
      $dnisPorNumero = mapDNIsPorNumero($pdo);
      $cursoPorNumeroPorDni = [];
      $areaPorNumero = [];
      $docPorNM = [];

      $resCur = $pdo->query("
        SELECT m.numero_mesa, p.dni, p.materia_id_curso AS curso, mat.id_area, MIN(m.id_docente) AS id_docente
        FROM mesas_examen.mesas m
        INNER JOIN mesas_examen.previas p  ON p.id_previa = m.id_previa
        INNER JOIN mesas_examen.catedras c ON c.id_catedra = m.id_catedra
        INNER JOIN mesas_examen.materias mat ON mat.id_materia = c.id_materia
        GROUP BY m.numero_mesa, p.dni, p.materia_id_curso, mat.id_area
      ")->fetchAll(PDO::FETCH_ASSOC);
      foreach ($resCur as $r) {
        $nm=(int)$r['numero_mesa']; $dni=(string)$r['dni']; $curso=(int)$r['curso']; $area=(int)$r['id_area'];
        if (!isset($cursoPorNumeroPorDni[$nm])) $cursoPorNumeroPorDni[$nm]=[];
        if (!isset($cursoPorNumeroPorDni[$nm][$dni]) || $curso < $cursoPorNumeroPorDni[$nm][$dni]) {
          $cursoPorNumeroPorDni[$nm][$dni]=$curso;
        }
        $areaPorNumero[$nm] = $area;
        $docPorNM[$nm] = (int)$r['id_docente'];
      }

      // Recalcular rowsFechadas, dnisEnSlot y agendaDniArea
      $stF = $pdo->prepare($sqlFechadas); $stF->execute($paramsF);
      $rowsFechadas = $stF->fetchAll(PDO::FETCH_ASSOC);

      $dnisEnSlot=[];
      foreach ($rowsFechadas as $r){
        $key=$r['fecha_mesa'].'|'.$r['id_turno'];
        foreach(($dnisPorNumero[(int)$r['numero_mesa']]??[]) as $dni){ $dnisEnSlot[$key][$dni]=true; }
      }
      $agendaDniArea=[];
      foreach ($rowsFechadas as $r) {
        $nm=(int)$r['numero_mesa']; $area=(int)$r['id_area'];
        $key=$r['fecha_mesa'].'|'.$r['id_turno'];
        $sidx = $slotIdxMap[$key] ?? null;
        if ($sidx===null) continue;
        foreach (($dnisPorNumero[$nm]??[]) as $dni) {
          $curso = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
          if ($curso===null) continue;
          $agendaDniArea[$dni][$area][] = ['slot'=>$sidx,'curso'=>$curso,'nm'=>$nm];
        }
      }
    }
  }

  // ---------------- Libres (tras split/diferimientos) ----------------
  $rowsLibres = $pdo->query("
    SELECT m.numero_mesa,
           MIN(m.id_docente) AS id_docente,
           mat.id_area AS id_area
    FROM mesas_examen.mesas m
    INNER JOIN mesas_examen.catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN mesas_examen.materias mat ON mat.id_materia = c.id_materia
    WHERE m.fecha_mesa IS NULL AND (m.id_turno IS NULL OR m.id_turno=0)
    GROUP BY m.numero_mesa, mat.id_area
    ORDER BY mat.id_area, m.numero_mesa
  ")->fetchAll(PDO::FETCH_ASSOC);

  $libresPorArea=[];
  foreach($rowsLibres as $r){
    $nm=(int)$r['numero_mesa']; $a=(int)$r['id_area']; $doc=(int)$r['id_docente'];
    $docPorNM[$nm]=$doc; $libresPorArea[$a][]=$nm;
  }

  // ---------------- SQL helpers grupos / no_agrupadas ----------------
  $stDupGroup = $pdo->prepare("
    SELECT 1 FROM mesas_examen.mesas_grupos
    WHERE fecha_mesa=:f AND id_turno=:t
      AND numero_mesa_1=:a AND numero_mesa_2=:b AND numero_mesa_3=:c AND numero_mesa_4=:d
    LIMIT 1
  ");
  $stInsGroup = $pdo->prepare("
    INSERT INTO mesas_examen.mesas_grupos
    (numero_mesa_1,numero_mesa_2,numero_mesa_3,numero_mesa_4,fecha_mesa,id_turno)
    VALUES (:a,:b,:c,:d,:f,:t)
  ");
  $stDupLeft = $pdo->prepare("
    SELECT 1 FROM mesas_examen.mesas_no_agrupadas
    WHERE numero_mesa=:n AND fecha_mesa=:f AND id_turno=:t LIMIT 1
  ");
  $stInsLeft = $pdo->prepare("
    INSERT INTO mesas_examen.mesas_no_agrupadas (numero_mesa,fecha_mesa,id_turno)
    VALUES (:n,:f,:t)
  ");
  $stDelLeftExact = $pdo->prepare("
    DELETE FROM mesas_examen.mesas_no_agrupadas
    WHERE numero_mesa=:n AND fecha_mesa=:f AND id_turno=:t
  ");

  $estaAgrupada = function(int $n, string $f, int $t) use ($pdo): bool {
    $sql="
      SELECT 1
      FROM mesas_examen.mesas_grupos g
      WHERE g.fecha_mesa=:f AND g.id_turno=:t
        AND (:n IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4))
      LIMIT 1
    ";
    $st=$pdo->prepare($sql);
    $st->execute([':f'=>$f,':t'=>$t,':n'=>$n]);
    return (bool)$st->fetch();
  };

  $purgaGlobalSQL = "
    DELETE l
    FROM mesas_examen.mesas_no_agrupadas l
    JOIN mesas_examen.mesas_grupos g
      ON g.fecha_mesa = l.fecha_mesa AND g.id_turno = l.id_turno
    WHERE l.numero_mesa IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4)
  ";

  if (!$dryRun) $pdo->beginTransaction();

  $creados=[]; $remanentes=[]; $omitidosDup=[]; $parejas=0; $ternas=0; $cuaternas=0;
  $singlesNoAgrupadas=[];

  // =============================== FASE A ===============================
  // Completar slots fijos (después de posibles splits/diferimientos); expandir 3->4.
  $buckets=[];
  foreach($rowsFechadas as $r){
    $f=$r['fecha_mesa']; $t=(int)$r['id_turno']; $a=(int)$r['id_area']; $nm=(int)$r['numero_mesa'];
    if (!empty($deferidos[$nm])) continue; // ya diferido
    $key="$f|$t|$a";
    if(!isset($buckets[$key])) $buckets[$key]=['f'=>$f,'t'=>$t,'a'=>$a,'nums'=>[]];
    $buckets[$key]['nums'][]=$nm;
  }

  foreach ($buckets as $bk){
    $f=$bk['f']; $t=$bk['t']; $a=$bk['a']; $numsFijos=$bk['nums'];
    $slotKey="$f|$t";

    // candidatos libres del área válidos para el slot y sin choque con DNIs del slot
    $cands=[];
    foreach (($libresPorArea[$a]??[]) as $nm){
      $doc=$docPorNM[$nm]??0;
      if ($doc>0 && $slotProhibido($doc,$f,$t)) continue;
      if (numeroChocaSet($dnisPorNumero, $nm, array_keys($dnisEnSlot[$slotKey]??[]))) continue;

      // Precedencia: todos los DNIs de este nm deben respetar menor->mayor
      $okPrec = true;
      foreach (($dnisPorNumero[$nm]??[]) as $dni) {
        $cursoActual = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
        if ($cursoActual===null) continue;
        foreach (($agendaDniArea[$dni][$a]??[]) as $reg) {
          if ($cursoActual > $reg['curso'] && $slotIdxMap[$slotKey] < $reg['slot']) { $okPrec=false; break; }
        }
        if (!$okPrec) break;
      }
      if (!$okPrec) continue;

      $cands[]=$nm;
    }

    // armar grupos SIN choque interno
    $pool = array_values(array_unique(array_merge($numsFijos, $cands)));
    $grupos = crearGruposSinChoque($pool, $dnisPorNumero);

    // --- intentar subir terna -> cuaterna con candidatos restantes válidos en el slot
    $usados=[]; foreach ($grupos as $g) foreach ($g as $x) $usados[$x]=true;
    $rest = array_values(array_filter($cands, fn($x)=>!isset($usados[$x])));

    $dnisSlotActual = array_keys($dnisEnSlot[$slotKey]??[]);
    foreach ($grupos as &$g) {
      if (count($g)===3) {
        $g = expandirATresMasUnoEnSlot($g, $rest, $dnisPorNumero, $docPorNM, $slotProhibido, $f, $t, $dnisSlotActual);
      }
    } unset($g);

    foreach ($grupos as $g){
      // sólo crear grupos que contengan al menos un fijo
      $tieneFijo=false; foreach($g as $nm) if (in_array($nm,$numsFijos,true)) { $tieneFijo=true; break; }
      if (!$tieneFijo) continue;

      $tamGrupo = count($g);
      if ($tamGrupo===1) {
        // single fijo -> mesas_no_agrupadas
        $nm = $g[0];
        if($estaAgrupada($nm,$f,$t)) continue;
        if ($dryRun) {
          $singlesNoAgrupadas[] = ['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'origen'=>'fijo'];
        } else {
          $stDupLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
          if(!$stDupLeft->fetch()) $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
          $singlesNoAgrupadas[] = ['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'origen'=>'fijo'];
        }
        foreach (unionDNIs($dnisPorNumero, [$nm]) as $dni) { $dnisEnSlot[$slotKey][$dni]=true; }
        continue;
      }

      // registrar DNIs del grupo en el slot
      foreach (unionDNIs($dnisPorNumero,$g) as $dni) { $dnisEnSlot[$slotKey][$dni]=true; }

      // sacar de libres los usados aquí
      foreach($g as $nm){
        if (isset($docPorNM[$nm])) {
          $libresPorArea[$a] = array_values(array_diff($libresPorArea[$a], [$nm]));
        }
      }

      [$a1,$b1,$c1,$d1]=pad4($g);
      $stDupGroup->execute([':f'=>$f,':t'=>$t,':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1]);
      if ($stDupGroup->fetch()) {
        $omitidosDup[]=['fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1,'motivo'=>'duplicado(fijado)'];
      } else {
        if ($dryRun) {
          $creados[]=['accion'=>'preview','fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
        } else {
          $stInsGroup->execute([':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1,':f'=>$f,':t'=>$t]);
          $creados[]=['accion'=>'creado','id_mesa_grupos'=>(int)$pdo->lastInsertId(),'fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
          foreach([$a1,$b1,$c1,$d1] as $nm) if($nm) $stDelLeftExact->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
        }
        $tam=count(array_filter([$a1,$b1,$c1,$d1],fn($x)=>$x>0));
        if($tam===2) $parejas++; elseif($tam===3) $ternas++; elseif($tam===4) $cuaternas++;
      }
    }

    // fijos que sigan sueltos -> no_agrupadas
    foreach($numsFijos as $nm){
      if($estaAgrupada($nm,$f,$t)) continue;
      $yaSingle = array_filter($singlesNoAgrupadas, fn($x)=>$x['numero_mesa']===$nm && $x['fecha']===$f && $x['turno']===$t);
      if ($yaSingle) continue;
      if ($dryRun) {
        $remanentes[]=['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'motivo'=>'sin_pareja_en_slot_fijo'];
      } else {
        $stDupLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
        if(!$stDupLeft->fetch()) $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
        $remanentes[]=['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'motivo'=>'sin_pareja_en_slot_fijo'];
      }
    }
  }

  // =============================== FASE B ===============================
  // Agrupar y agendar libres; respetar precedencia estricta + prioridad=1.
  $slotsAsignados=[]; $agendadas=0;

  if ($agendar) {
    $slots=[]; foreach($fechasRango as $f){ $slots[]=['fecha'=>$f,'turno'=>1]; $slots[]=['fecha'=>$f,'turno'=>2]; }
    // asegurar orden y map índice
    foreach ($slots as $s) {
      $k=$s['fecha'].'|'.$s['turno'];
      if (!isset($slotIdxMap[$k])) {
        $slotsOrden[]=$s;
        $slotIdxMap[$k]=count($slotIdxMap);
      }
    }
    usort($slotsOrden, fn($A,$B)=>strcmp($A['fecha'],$B['fecha']) ?: ($A['turno']<=>$B['turno']));
    $slotIdxMap = [];
    foreach ($slotsOrden as $i=>$s) { $slotIdxMap[$s['fecha'].'|'.$s['turno']]=$i; }

    $S=count($slots);
    $slotCarga=array_fill(0,$S,0);

    $eligeSlot = function(array $grupo) use (&$slots,&$slotCarga,&$docPorNM,&$slotProhibido,&$dnisEnSlot,&$dnisPorNumero,&$agendaDniArea,&$areaPorNumero,&$slotIdxMap,&$prioPorNumero){
      $dnisG = unionDNIs($dnisPorNumero,$grupo);
      $tienePrio = false;
      $areaRef = $areaPorNumero[$grupo[0]] ?? null;
      foreach ($grupo as $nm) { if (($prioPorNumero[$nm]??0) > 0) { $tienePrio=true; break; } }

      $cands=[];
      for($s=0;$s<count($slots);$s++){
        $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotKey="$f|$t";
        $ok=true;
        // docente disponible
        foreach($grupo as $nm){
          $doc=$docPorNM[$nm]??0;
          if($doc>0 && $slotProhibido($doc,$f,$t)){ $ok=false; break; }
        }
        if(!$ok) continue;
        // DNIs contra el slot
        $enSlot = array_keys($dnisEnSlot[$slotKey]??[]);
        if ($enSlot) {
          $h=array_flip($enSlot);
          foreach($dnisG as $dni){ if(isset($h[$dni])) { $ok=false; break; } }
        }
        if(!$ok) continue;
        // **Precedencia estricta**
        foreach ($grupo as $nm) {
          foreach (($dnisPorNumero[$nm]??[]) as $dni) {
            $cursoActual = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
            if ($cursoActual===null) continue;
            foreach (($agendaDniArea[$dni][$areaRef]??[]) as $reg) {
              if ($cursoActual > $reg['curso'] && ($slotIdxMap[$slotKey] ?? PHP_INT_MAX) < $reg['slot']) { $ok=false; break 3; }
            }
          }
        }

        $scoreCarga = $slotCarga[$s];
        $scoreOrden = $slotIdxMap[$slotKey] ?? 1e9;
        $cands[] = ['s'=>$s,'carga'=>$scoreCarga,'orden'=>$scoreOrden];
      }
      if(!$cands) return -1;

      // Si hay prioridad=1 en el grupo, preferir slots más tempranos primero, luego menor carga
      usort($cands, function($A,$B) use ($tienePrio){
        if ($tienePrio) {
          return ($A['orden'] <=> $B['orden']) ?: ($A['carga'] <=> $B['carga']) ?: ($A['s'] <=> $B['s']);
        }
        // caso normal: menor carga, luego más temprano
        return ($A['carga'] <=> $B['carga']) ?: ($A['orden'] <=> $B['orden']) ?: ($A['s'] <=> $B['s']);
      });
      return $cands[0]['s'];
    };

    foreach ($libresPorArea as $area=>$nums) {
      if (!$nums) continue;

      // grupos sin choque
      $gruposBase = crearGruposSinChoque($nums, $dnisPorNumero);

      // rest para expansiones
      $usados=[]; foreach($gruposBase as $g) foreach($g as $x) $usados[$x]=true;
      $rest = array_values(array_filter($nums, fn($x)=>!isset($usados[$x])));

      foreach ($gruposBase as $g) {
        // single -> no_agrupadas
        if (count($g)===1) {
          $s = $eligeSlot($g);
          $nm = $g[0];
          if ($s<0) {
            $remanentes[]=['numero_mesa'=>$nm,'fecha'=>null,'turno'=>null,'motivo'=>'single_sin_slot'];
            continue;
          }
          $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotCarga[$s]++;

          if(!$dryRun){
            $pdo->prepare("
              UPDATE mesas_examen.mesas
                 SET fecha_mesa=?, id_turno=?
               WHERE (fecha_mesa IS NULL) AND (id_turno IS NULL OR id_turno=0)
                 AND numero_mesa = ?
            ")->execute([$f,$t,$nm]);

            $stDupLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
            if(!$stDupLeft->fetch()) $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
          } else {
            $creados[]=['accion'=>'preview_no_agrupada','fecha'=>$f,'turno'=>$t,'numero_mesa'=>$nm];
          }

          foreach(unionDNIs($dnisPorNumero,[$nm]) as $dni){ $dnisEnSlot["$f|$t"][$dni]=true; }
          // actualizar agendaDniArea
          foreach(($dnisPorNumero[$nm]??[]) as $dni){
            $curso = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
            if ($curso!==null) $agendaDniArea[$dni][$area][]=['slot'=>$slotIdxMap["$f|$t"] ?? 0,'curso'=>$curso,'nm'=>$nm];
          }

          $agendadas += 1;
          $slotsAsignados[]=['nums'=>[$nm],'fecha'=>$f,'turno'=>$t,'area'=>$area,'tipo'=>'single_no_agrupada'];
          $singlesNoAgrupadas[] = ['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'origen'=>'libre'];
          continue;
        }

        // intentar expandir 3->4 con rest
        if (count($g)===3 && $rest) {
          $g4 = expandirATresMasUnoSinSlot($g, $rest, $dnisPorNumero);
          if (count($g4)===4) {
            $s = $eligeSlot($g4);
            if ($s>=0) { $g = $g4; } else { $rest[] = $g4[3]; }
          }
        }

        // elegir slot (para 2/3/4)
        $s = $eligeSlot($g);
        if ($s<0) {
          foreach($g as $nm){
            $remanentes[]=['numero_mesa'=>$nm,'fecha'=>null,'turno'=>null,'motivo'=>'sin_slot_sin_choque'];
          }
          continue;
        }

        $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotCarga[$s]++;
        if(!$dryRun){
          $ph = implode(',', array_fill(0,count($g),'?'));
          $params = array_merge([$f,$t], $g);
          $pdo->prepare("
            UPDATE mesas_examen.mesas
               SET fecha_mesa=?, id_turno=?
             WHERE (fecha_mesa IS NULL) AND (id_turno IS NULL OR id_turno=0)
               AND numero_mesa IN ($ph)
          ")->execute($params);
        }

        [$a1,$b1,$c1,$d1]=pad4($g);
        $stDupGroup->execute([':f'=>$f,':t'=>$t,':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1]);
        if ($stDupGroup->fetch()) {
          $omitidosDup[]=['fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1,'motivo'=>'duplicado(libres)'];
        } else {
          if ($dryRun) {
            $creados[]=['accion'=>'preview','fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
          } else {
            $stInsGroup->execute([':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1,':f'=>$f,':t'=>$t]);
            $creados[]=['accion'=>'creado','id_mesa_grupos'=>(int)$pdo->lastInsertId(),'fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
            foreach([$a1,$b1,$c1,$d1] as $nm) if($nm) $stDelLeftExact->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
          }
          $tam=count(array_filter([$a1,$b1,$c1,$d1],fn($x)=>$x>0));
          if($tam===2) $parejas++; elseif($tam===3) $ternas++; elseif($tam===4) $cuaternas++;
        }

        foreach(unionDNIs($dnisPorNumero,$g) as $dni){ $dnisEnSlot["$f|$t"][$dni]=true; }
        foreach($g as $nmG){
          foreach(($dnisPorNumero[$nmG]??[]) as $dni){
            $curso = $cursoPorNumeroPorDni[$nmG][$dni] ?? null;
            if ($curso!==null) $agendaDniArea[$dni][$area][]=['slot'=>$slotIdxMap["$f|$t"] ?? 0,'curso'=>$curso,'nm'=>$nmG];
          }
        }

        $agendadas += count($g);
        $slotsAsignados[]=['nums'=>$g,'fecha'=>$f,'turno'=>$t,'area'=>$area];
      }
    }
  }

  // Limpieza global
  if(!$dryRun){ $pdo->exec($purgaGlobalSQL); }
  if(!$dryRun) $pdo->commit();

  respond(true, [
    'resumen'=>[
      'grupos_creados'      => count($creados),
      'parejas'             => $parejas,
      'ternas'              => $ternas,
      'cuaternas'           => $cuaternas,
      'remanentes'          => count($remanentes),
      'omitidos_duplicados' => count($omitidosDup),
      'agendar_no_fechadas' => $agendar?1:0,
      'agendadas'           => $agendar?$agendadas:0,
      'singles_no_agrupadas'=> count($singlesNoAgrupadas),
      'diferidas_por_precedencia'=> count($deferidos),
      'splits_realizados'   => count($splitHechos)
    ],
    'detalle'=>[
      'creados'               => $creados,
      'remanentes'            => $remanentes,
      'omitidos_dup'          => $omitidosDup,
      'slots_asignados'       => $slotsAsignados,
      'singles_no_agrupadas'  => $singlesNoAgrupadas,
      'deferidos'             => array_keys($deferidos),
      'splits'                => $splitHechos
    ],
    'nota'=>'Se aplicó un split selectivo por DNI cuando el numero_mesa mayor tenía muchos alumnos (≥ '.UMBRAL_SPLIT_MUCHOS_ALUMNOS.'). Solo se movieron las filas de ese DNI a un numero_mesa nuevo, limpiando fecha/turno para reubicar sin romper el resto. Si no aplicaba split, se difería como antes.'
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  respond(false, 'Error en el servidor: '.$e->getMessage(), 500);
}
