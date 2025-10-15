<?php
// backend/modules/mesas/reoptimizar_mesas.php
// -----------------------------------------------------------------------------
// Reoptimiza mesas NO AGRUPADAS para maximizar parejas/ternas/cuaternas,
// (Ajustado para NUNCA crear grupos de tamaño 1: singles -> mesas_no_agrupadas)
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

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
  $n=count($g);
  if($n===1) return [$g[0],0,0,0];
  if($n===2) return [$g[0],$g[1],0,0];
  if($n===3) return [$g[0],$g[1],$g[2],0];
  return [$g[0],$g[1],$g[2],$g[3]];
}

if (!isset($pdo) || !$pdo instanceof PDO) {
  bad_request("Error: no se encontró la conexión PDO (backend/config/db.php).");
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(false,'Método no permitido',405);
  $input = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($input)) $input = [];

  $dryRun   = !empty($input['dry_run']);
  $maxIter  = max(1, min(20, (int)($input['max_iter'] ?? 5)));
  $soloArea = isset($input['solo_area']) ? (int)$input['solo_area'] : null;

  $fi = $input['fecha_inicio'] ?? null;
  $ff = $input['fecha_fin'] ?? null;
  if (($fi && !validarFecha($fi)) || ($ff && !validarFecha($ff))) {
    bad_request("Parámetros de fecha inválidos (YYYY-MM-DD).");
  }

  // ---------------- Indisponibilidades docentes ----------------
  $docNo=[];
  $rsDoc = $pdo->query("SELECT id_docente, id_turno_no, fecha_no FROM docentes WHERE activo=1");
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
    if ($fno && $fno===$fecha) return true;
    if ($tno!==null && $tno===$turno) return true;
    return false;
  };

  // ---------------- Mapa DNIs por numero_mesa ----------------
  $dnisPorNumero = [];
  $res = $pdo->query("
    SELECT m.numero_mesa, p.dni
    FROM mesas m
    INNER JOIN previas p ON p.id_previa=m.id_previa
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach($res as $r){
    $nm=(int)$r['numero_mesa']; $dni=(string)$r['dni'];
    $dnisPorNumero[$nm][$dni]=true;
  }
  foreach($dnisPorNumero as $nm=>$set){ $dnisPorNumero[$nm]=array_keys($set); }

  $unionDNIs = function(array $numeros) use ($dnisPorNumero){
    $u=[]; foreach($numeros as $nm) foreach(($dnisPorNumero[$nm]??[]) as $dni) $u[$dni]=true;
    return array_keys($u);
  };
  $numeroChocaSet = function(int $nm, array $set) use ($dnisPorNumero) {
    if ($nm===0) return false;
    $A=$dnisPorNumero[$nm]??[];
    if(!$A || !$set) return false;
    $h=array_flip($set);
    foreach($A as $x){ if(isset($h[$x])) return true; }
    return false;
  };

  // ---------- Tabla de horarios del alumno (para evitar doble mesa mismo slot) ----------
  $horarioAlumno = []; // dni => [ "YYYY-MM-DD|turno" => true ]
  $res2 = $pdo->query("
    SELECT p.dni, m.fecha_mesa, m.id_turno
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach($res2 as $r){
    $dni=(string)$r['dni']; $f=$r['fecha_mesa']; $t=(int)$r['id_turno'];
    $horarioAlumno[$dni][$f.'|'.$t]=true;
  }

  // ---------- Deducir rango de fechas si no viene ----------
  if (!$fi || !$ff) {
    $rowMin = $pdo->query("SELECT MIN(fecha_mesa) AS fmin, MAX(fecha_mesa) AS fmax FROM mesas WHERE fecha_mesa IS NOT NULL")->fetch(PDO::FETCH_ASSOC);
    if (!$rowMin || !$rowMin['fmin'] || !$rowMin['fmax']) {
      bad_request("No hay fechas agendadas para deducir rango. Enviá 'fecha_inicio' y 'fecha_fin'.");
    }
    $fi = $fi ?: $rowMin['fmin'];
    $ff = $ff ?: $rowMin['fmax'];
  }
  $fechasRango = rangoFechas($fi, $ff);
  if (!$fechasRango) bad_request("Rango de fechas inválido.");
  $slots = [];
  foreach($fechasRango as $f){ $slots[]=['fecha'=>$f,'turno'=>1]; $slots[]=['fecha'=>$f,'turno'=>2]; }
  $S = count($slots);

  // ---------- Estado actual de grupos (por slot y área) ----------
  $stGr = $pdo->prepare("
    SELECT g.id_mesa_grupos,
           g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4,
           g.fecha_mesa, g.id_turno,
           mat.id_area AS id_area
    FROM mesas_grupos g
    INNER JOIN mesas m1 ON m1.numero_mesa = g.numero_mesa_1
    INNER JOIN catedras c1 ON c1.id_catedra = m1.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c1.id_materia
  ");
  $stGr->execute();
  $grupos = $stGr->fetchAll(PDO::FETCH_ASSOC);

  $bucket = []; // "$f|$t|$area" => [ 'id_g', 'nums'=>[], 'dnis'=>set ]
  foreach($grupos as $g){
    $f = $g['fecha_mesa']; $t=(int)$g['id_turno']; $a=(int)$g['id_area'];
    $key="$f|$t|$a";
    $nums = array_values(array_filter([(int)$g['numero_mesa_1'], (int)$g['numero_mesa_2'], (int)$g['numero_mesa_3'], (int)$g['numero_mesa_4']], fn($x)=>$x>0));
    if (!isset($bucket[$key])) $bucket[$key] = ['id_g'=>$g['id_mesa_grupos'],'fecha'=>$f,'turno'=>$t,'area'=>$a,'nums'=>[],'dnis'=>[]];
    $bucket[$key]['nums'] = array_values(array_unique(array_merge($bucket[$key]['nums'],$nums)));
  }
  // dnis por bucket
  foreach($bucket as $k=>&$b){ $b['dnis'] = array_flip($unionDNIs($b['nums'])); }
  unset($b);

  // ---------- No agrupadas + datos de área/docente ----------
  $sqlNo = "
    SELECT l.numero_mesa, l.fecha_mesa, l.id_turno,
           mat.id_area AS id_area,
           MIN(m.id_docente) AS id_docente
    FROM mesas_no_agrupadas l
    INNER JOIN mesas m ON m.numero_mesa = l.numero_mesa
    INNER JOIN catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c.id_materia
  ";
  if ($soloArea !== null) $sqlNo .= " WHERE mat.id_area = ".(int)$soloArea." ";
  $sqlNo .= " GROUP BY l.numero_mesa, l.fecha_mesa, l.id_turno, mat.id_area
              ORDER BY mat.id_area, l.numero_mesa";
  $noAgr = $pdo->query($sqlNo)->fetchAll(PDO::FETCH_ASSOC);

  // Docente por numero_mesa (para libres y no_agrupadas)
  $docPorNM = [];
  $res3 = $pdo->query("
    SELECT m.numero_mesa, MIN(m.id_docente) AS id_docente
    FROM mesas m
    GROUP BY m.numero_mesa
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach($res3 as $r){ $docPorNM[(int)$r['numero_mesa']] = (int)$r['id_docente']; }

  // ---------- Helpers SQL ----------
  $stUpdMesaSlot = $pdo->prepare("
    UPDATE mesas
       SET fecha_mesa=?, id_turno=?
     WHERE numero_mesa = ?
  ");
  $stInsGroup = $pdo->prepare("
    INSERT INTO mesas_grupos
      (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4, fecha_mesa, id_turno)
    VALUES (:a,:b,:c,:d,:f,:t)
  ");
  $stUpdGroupToAdd = $pdo->prepare("
    UPDATE mesas_grupos
       SET numero_mesa_1 = IF(numero_mesa_1=0, :nm, numero_mesa_1),
           numero_mesa_2 = IF(numero_mesa_2=0, :nm, numero_mesa_2),
           numero_mesa_3 = IF(numero_mesa_3=0, :nm, numero_mesa_3),
           numero_mesa_4 = IF(numero_mesa_4=0, :nm, numero_mesa_4)
     WHERE id_mesa_grupos = :idg
       AND (0 IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4))
  ");
  $stDelLeftExact = $pdo->prepare("
    DELETE FROM mesas_no_agrupadas
     WHERE numero_mesa=:n AND fecha_mesa=:f AND id_turno=:t
  ");
  $stInsLeft = $pdo->prepare("
    INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa,fecha_mesa,id_turno)
    VALUES (:n,:f,:t)
  ");
  $stDupGroupExact = $pdo->prepare("
    SELECT 1 FROM mesas_grupos
     WHERE fecha_mesa=:f AND id_turno=:t
       AND numero_mesa_1=:a AND numero_mesa_2=:b AND numero_mesa_3=:c AND numero_mesa_4=:d
     LIMIT 1
  ");

  // Carga de slot (balanceo leve)
  $slotCarga = array_fill(0,$S,0);
  $slotIndex = function(string $f,int $t) use ($slots): int {
    for($i=0;$i<count($slots);$i++){ if($slots[$i]['fecha']===$f && $slots[$i]['turno']===$t) return $i; }
    return -1;
  };
  foreach($bucket as $k=>$b){
    $s = $slotIndex($b['fecha'],$b['turno']);
    if ($s>=0) $slotCarga[$s] += count($b['nums']);
  }

  // ---------- Elegir mejor slot para un conjunto de numeros ----------
  $eligeSlot = function(array $nums, ?int $areaHint) use (&$slots,&$slotCarga,&$docPorNM,&$slotProhibido,&$dnisPorNumero,&$horarioAlumno){
    $dnis=[];
    foreach($nums as $nm) foreach(($dnisPorNumero[$nm]??[]) as $d) $dnis[$d]=true;
    $dnis = array_keys($dnis);

    $cands=[];
    for ($s=0;$s<count($slots);$s++){
      $f=$slots[$s]['fecha']; $t=$slots[$s]['turno'];
      // docentes
      $ok=true;
      foreach($nums as $nm){
        $doc=$docPorNM[$nm]??0;
        if($doc>0 && $slotProhibido($doc,$f,$t)){ $ok=false; break; }
      }
      if(!$ok) continue;
      // alumnos ya ocupados en este slot (otra mesa)
      foreach($dnis as $dni){
        if(isset($horarioAlumno[$dni]["$f|$t"])) { $ok=false; break; }
      }
      if(!$ok) continue;

      // score = carga, preferir slots con menos carga
      $score = $slotCarga[$s];
      $cands[] = [$s,$score];
    }
    if(!$cands) return -1;
    usort($cands, fn($A,$B) => $A[1]<=>$B[1] ?: $A[0]<=>$B[0]);
    return $cands[0][0];
  };

  // ---------- Util para saber si cabe en un grupo existente ----------
  $cabeEnBucket = function(int $nm, array $b) use ($unionDNIs, $numeroChocaSet){
    if (count($b['nums'])>=4) return false;
    $dnisGrupo = array_keys($b['dnis']);
    if ($numeroChocaSet($nm, $dnisGrupo)) return false;
    // también evitar choque con los del mismo slot (por definición b['dnis'] los incluye)
    return true;
  };

  $iter=0; $cambiosTotales=0;
  $detalleMov=[]; $detalleAgr=[]; $detalleFail=[];

  if (!$dryRun) $pdo->beginTransaction();

  while ($iter < $maxIter) {
    $iter++;
    $cambiosIter=0;

    // Refrescar no_agrupadas (puede cambiar en cada iteración)
    $noAgr = $pdo->query($sqlNo)->fetchAll(PDO::FETCH_ASSOC);

    // 1) Intentar meter cada no_agrupada en un grupo existente del MISMO área
    foreach($noAgr as $row) {
      $nm = (int)$row['numero_mesa'];
      $area = (int)$row['id_area'];
      $doc = (int)$row['id_docente'];

      // buckets candidatos del mismo área
      $cands = [];
      foreach($bucket as $k=>$b){
        if ($b['area'] !== $area) continue;
        // respetar indisponibilidad docente
        if ($doc>0 && $slotProhibido($doc, $b['fecha'], $b['turno'])) continue;
        // evitar que alumnos de $nm ya rindan en ese slot
        $chocaAlumno=false;
        foreach(($dnisPorNumero[$nm]??[]) as $dni) {
          if (isset($horarioAlumno[$dni][$b['fecha'].'|'.$b['turno']])) { $chocaAlumno=true; break; }
        }
        if ($chocaAlumno) continue;

        // evitar choques con DNIs del grupo/bucket
        if (!$cabeEnBucket($nm, $b)) continue;

        // preferir buckets con menor tamaño actual
        $cands[] = [$k, count($b['nums'])];
      }
      if ($cands) {
        usort($cands, fn($A,$B)=>$A[1]<=>$B[1]);
        [$keyBest, $_] = $cands[0];
        $b = $bucket[$keyBest];
        $f=$b['fecha']; $t=$b['turno'];

        // aplicar cambio: mover mesa a (f,t), anexarla al grupo
        if (!$dryRun) {
          $stUpdMesaSlot->execute([$f,$t,$nm]);
          // agregar a grupo (rellenar hueco)
          $stUpdGroupToAdd->execute([':nm'=>$nm,':idg'=>$b['id_g']]);
          // borrar registro no_agrupada previo si existía
          $stDelLeftExact->execute([':n'=>$nm,':f'=>$row['fecha_mesa'],':t'=>$row['id_turno']]);
        }
        // estado en memoria
        $bucket[$keyBest]['nums'][] = $nm;
        foreach(($dnisPorNumero[$nm]??[]) as $dni){
          $bucket[$keyBest]['dnis'][$dni]=true;
          $horarioAlumno[$dni][$f.'|'.$t]=true;
        }

        $detalleMov[] = ['numero_mesa'=>$nm,'to_fecha'=>$f,'to_turno'=>$t,'area'=>$area,'motivo'=>'encaje_en_grupo_existente'];
        $cambiosIter++; $cambiosTotales++;
        continue; // siguiente no_agrupada
      }

      // 2) Si no cabe en grupos existentes, intentar formar grupo NUEVO con otras no_agrupadas del MISMO área
      //    Construimos un pequeño pool local (hasta 6 candidatos) que no choquen por DNI.
      $pool = [$nm];
      foreach($noAgr as $row2){
        if ((int)$row2['numero_mesa']===$nm) continue;
        if ((int)$row2['id_area'] !== $area) continue;
        $nm2=(int)$row2['numero_mesa'];
        // no choques internos
        $d1 = $dnisPorNumero[$nm] ?? [];
        $d2 = $dnisPorNumero[$nm2] ?? [];
        $h=array_flip($d1);
        $ok=true;
        foreach($d2 as $x){ if(isset($h[$x])) { $ok=false; break; } }
        if(!$ok) continue;
        $pool[] = $nm2;
        if (count($pool)>=6) break;
      }

      // intentamos armar mejor grupo 2/3/4 desde pool (greedy)
      $mejorGrupo = [$nm];
      // parejas
      foreach($pool as $a){
        foreach($pool as $b){
          if ($a>=$b) continue;
          $dAB = array_merge($dnisPorNumero[$a]??[], $dnisPorNumero[$b]??[]);
          if (count($dAB)!==count(array_unique($dAB))) continue; // choque
          if (count($mejorGrupo) < 2) $mejorGrupo = [$a,$b];
        }
      }
      // ternas/cuaternas
      foreach($pool as $a){
        foreach($pool as $b){
          foreach($pool as $c){
            $arr = array_unique([$nm,$a,$b,$c]);
            if (count($arr)<3) continue;
            $dAB = [];
            foreach($arr as $x) foreach(($dnisPorNumero[$x]??[]) as $d) $dAB[$d]=true;
            if (count($dAB) !== array_sum(array_map(fn($x)=>count($dnisPorNumero[$x]??[]), $arr))) continue; // hubo choque
            if (count($arr) > count($mejorGrupo)) $mejorGrupo = array_values($arr);
            if (count($mejorGrupo)===4) break 3; // ya está full
          }
        }
      }

      // elegir slot para el mejor grupo
      $slotIdx = $eligeSlot($mejorGrupo, $area);
      if ($slotIdx>=0) {
        $f=$slots[$slotIdx]['fecha']; $t=$slots[$slotIdx]['turno'];

        // *** si el "mejor grupo" tiene tamaño 1 -> single => NO crear grupo, solo no_agrupadas ***
        if (count($mejorGrupo) === 1) {
          if (!$dryRun) {
            foreach($mejorGrupo as $nmX) {
              $stUpdMesaSlot->execute([$f,$t,$nmX]);
              // limpiar registro anterior de no_agrupadas (si lo tenía) y registrar en el nuevo slot
              $stDelLeftExact->execute([':n'=>$nmX,':f'=>$row['fecha_mesa'],':t'=>$row['id_turno']]);
              $stInsLeft->execute([':n'=>$nmX,':f'=>$f,':t'=>$t]);
            }
          }
          // actualizar estructuras en memoria
          foreach($mejorGrupo as $nmX){
            foreach(($dnisPorNumero[$nmX]??[]) as $dni){
              $horarioAlumno[$dni][$f.'|'.$t]=true;
            }
          }
          $slotCarga[$slotIdx] += 1;
          $detalleMov[]=['numero_mesa'=>$mejorGrupo[0],'to_fecha'=>$f,'to_turno'=>$t,'area'=>$area,'motivo'=>'single_no_agrupada'];
          $cambiosIter++; $cambiosTotales++;
          continue; // NO creamos mesas_grupos
        }

        // aplicar cambios para 2/3/4
        if (!$dryRun) {
          foreach($mejorGrupo as $nmX) {
            $stUpdMesaSlot->execute([$f,$t,$nmX]);
            // quitar de no_agrupadas si estuvieran
            $stDelLeftExact->execute([':n'=>$nmX,':f'=>$row['fecha_mesa'],':t'=>$row['id_turno']]);
            // por dudas, insertar su estado actual como no_agrupada y luego se purga si queda en grupo
            $stInsLeft->execute([':n'=>$nmX,':f'=>$f,':t'=>$t]);
          }
          // crear grupo (solo si hay 2+ mesas)
          [$a1,$b1,$c1,$d1] = pad4($mejorGrupo);
          $stDupGroupExact->execute([':f'=>$f,':t'=>$t,':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1]);
          if (!$stDupGroupExact->fetch()) {
            $stInsGroup->execute([':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1,':f'=>$f,':t'=>$t]);
          }
        }
        // actualizar estructuras
        $key="$f|$t|$area";
        if (!isset($bucket[$key])) $bucket[$key]=['id_g'=>0,'fecha'=>$f,'turno'=>$t,'area'=>$area,'nums'=>[],'dnis'=>[]];
        foreach($mejorGrupo as $nmX){
          $bucket[$key]['nums'][]=$nmX;
          foreach(($dnisPorNumero[$nmX]??[]) as $dni){
            $bucket[$key]['dnis'][$dni]=true;
            $horarioAlumno[$dni][$f.'|'.$t]=true;
          }
        }
        $slotCarga[$slotIdx] += count($mejorGrupo);

        $detalleAgr[]=['nums'=>$mejorGrupo,'fecha'=>$f,'turno'=>$t,'area'=>$area,'tipo'=>'nuevo_grupo'];
        $cambiosIter++; $cambiosTotales++;
      } else {
        $detalleFail[]=['numero_mesa'=>$nm,'area'=>$area,'razon'=>'sin_slot_valido_para_grupo_nuevo'];
      }
    }

    if ($cambiosIter===0) break; // convergió
  }

  if (!$dryRun) {
    // --- SANIDAD: mover cualquier grupo de tamaño 1 a no_agrupadas y borrar el grupo ---
    $pdo->exec("
      INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno)
      SELECT
        CASE
          WHEN numero_mesa_1>0 THEN numero_mesa_1
          WHEN numero_mesa_2>0 THEN numero_mesa_2
          WHEN numero_mesa_3>0 THEN numero_mesa_3
          ELSE numero_mesa_4
        END AS numero_mesa,
        fecha_mesa,
        id_turno
      FROM mesas_grupos
      WHERE (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0)=1
    ");
    $pdo->exec("
      DELETE FROM mesas_grupos
      WHERE (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0)=1
    ");

    // Purga: si alguna mesa quedó en un grupo y también figura en no_agrupadas, limpiar no_agrupadas
    $pdo->exec("
      DELETE l
      FROM mesas_no_agrupadas l
      JOIN mesas_grupos g
        ON g.fecha_mesa = l.fecha_mesa AND g.id_turno = l.id_turno
      WHERE l.numero_mesa IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4)
    ");
    $pdo->commit();
  }

  respond(true, [
    'resumen'=>[
      'iteraciones'      => $iter,
      'cambios_totales'  => $cambiosTotales,
      'no_agrupadas_ini' => count($noAgr),
    ],
    'detalle'=>[
      'movidos_a_grupos_existentes' => $detalleMov,
      'grupos_nuevos_creados'       => $detalleAgr,
      'fallidos'                    => $detalleFail,
    ],
    'nota'=>'Nunca se crean grupos de tamaño 1: cualquier single queda en mesas_no_agrupadas. Además se migra y limpia cualquier grupo unitario preexistente.'
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  respond(false, 'Error en el servidor: '.$e->getMessage(), 500);
}
