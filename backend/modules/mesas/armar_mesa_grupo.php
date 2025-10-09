<?php
// backend/modules/mesas/armar_mesa_grupo.php
// -----------------------------------------------------------------------------
// Versión: "agrupa-hasta-4 + singles a no_agrupadas"
// Cambios clave respecto a la anterior:
// 1) En slots ya fijados (fecha/turno), además de completar con libres del mismo
//    área sin choques de DNI y respetando disponibilidad, se intenta “subir” 3->4.
// 2) En la asignación de libres (fase B), al formar grupos sin choques de DNI,
//    se intenta expandir a 4. Si 4 no entra, vuelve a 3.
// 3) **NUEVO:** Nunca armar grupos de 1. Si queda uno solo, se agenda en un slot
//    válido y se inserta en `mesas_no_agrupadas` (no en `mesas_grupos`).
// 4) Se mantiene: no mover mesas ya fechadas, balanceo por slots, respeto de
//    indisponibilidades de docentes y consistencia con `mesas_no_agrupadas`.
//
// Entrada (POST JSON):
//   {
//     "dry_run":0|1,
//     "agendar_no_fechadas":0|1,
//     "fecha_inicio":"YYYY-MM-DD",  // req si agendar_no_fechadas=1
//     "fecha_fin":"YYYY-MM-DD",     // req si agendar_no_fechadas=1
//     "fecha_mesa":"YYYY-MM-DD",    // opcional: completar solo ese día
//     "id_turno":1|2                // opcional: idem turno
//   }
//
// Salida:
//   { exito:true, data:{resumen, detalle, nota} }
//
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

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
/** [numero_mesa => array<int dni>] */
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
/** Crea grupos evitando choques internos de DNI; 3 -> 2 -> 4; luego singles (que ahora NO se agrupan en grupos) */
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
  // A diferencia de antes, NO empujamos singles como grupos de 1 aquí.
  // Los devolvemos como remanentes para tratarlos aparte en fase B.
  foreach ($rest as $x) $grupos[] = [$x];
  return $grupos;
}

// ---------------- Expansiones a 4 ----------------
/**
 * Fase A (slot fijo): intenta agregar un 4º compatible (DNI + docente + slot)
 * a grupos de 3. Consume del $rest (array por referencia) si lo usa.
 */
function expandirATresMasUnoEnSlot(array $grupo3, array &$rest, array $dnisMap, array $docPorNM,
                                   callable $slotProhibido, string $fecha, int $turno,
                                   array $dnisSlotActual): array {
  $dnisG = unionDNIs($dnisMap, $grupo3);
  foreach ($rest as $k => $nm) {
    $doc = $docPorNM[$nm] ?? 0;
    if ($doc>0 && $slotProhibido($doc, $fecha, $turno)) continue;
    // no chocar con DNIs del grupo ni con los del slot entero
    if (numeroChocaSet($dnisMap, $nm, $dnisG)) continue;
    if (numeroChocaSet($dnisMap, $nm, $dnisSlotActual)) continue;
    // ok, usar este
    unset($rest[$k]);
    return array_values(array_merge($grupo3, [$nm]));
  }
  return $grupo3;
}

/**
 * Fase B (sin slot elegido): intenta sumar un 4º solo por DNI.
 * Si luego no hay slot común para los 4, se deshace afuera.
 */
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

  // DNIs por numero_mesa
  $dnisPorNumero = mapDNIsPorNumero($pdo);

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

  // DNIs ya ocupados por slot
  $dnisEnSlot=[];
  foreach ($rowsFechadas as $r){
    $key=$r['fecha_mesa'].'|'.$r['id_turno'];
    foreach(($dnisPorNumero[(int)$r['numero_mesa']]??[]) as $dni){ $dnisEnSlot[$key][$dni]=true; }
  }

  // ---------------- Libres ----------------
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

  $docPorNM=[]; $libresPorArea=[];
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
  // Completar slots fijos; intentar expandir 3->4 si se puede en el slot.
  $buckets=[];
  foreach($rowsFechadas as $r){
    $f=$r['fecha_mesa']; $t=(int)$r['id_turno']; $a=(int)$r['id_area']; $nm=(int)$r['numero_mesa'];
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
      $cands[]=$nm;
    }

    // armar grupos SIN choque interno
    $pool = array_values(array_unique(array_merge($numsFijos, $cands)));
    $grupos = crearGruposSinChoque($pool, $dnisPorNumero);

    // --- intentar subir terna -> cuaterna con candidatos restantes válidos en el slot
    // resta = cands que no se usaron por crearGruposSinChoque
    $usados=[];
    foreach ($grupos as $g) foreach ($g as $x) $usados[$x]=true;
    $rest = array_values(array_filter($cands, fn($x)=>!isset($usados[$x])));

    $dnisSlotActual = array_keys($dnisEnSlot[$slotKey]??[]);
    foreach ($grupos as &$g) {
      if (count($g)===3) {
        $g = expandirATresMasUnoEnSlot($g, $rest, $dnisPorNumero, $docPorNM, $slotProhibido, $f, $t, $dnisSlotActual);
      }
    } unset($g);

    foreach ($grupos as $g){
      // sólo crear grupos que contengan al menos un fijo (no inventar grupo puro de libres en slot fijo)
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
        // registrar DNIs del single en el slot para evitar choques con otros
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

    // fijos que sigan sueltos -> no_agrupadas (ya cubierto arriba si tam=1)
    foreach($numsFijos as $nm){
      if($estaAgrupada($nm,$f,$t)) continue;
      // si no quedó en grupo ni como single registrado, lo registramos aquí
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
  // Agrupar y agendar libres; intentar expandir 3->4. Si 4 no cabe en ningún
  // slot, retrocede y agenda la terna.
  $slotsAsignados=[]; $agendadas=0;

  if ($agendar) {
    $slots=[]; foreach($fechasRango as $f){ $slots[]=['fecha'=>$f,'turno'=>1]; $slots[]=['fecha'=>$f,'turno'=>2]; }
    $S=count($slots);
    $slotCarga=array_fill(0,$S,0);

    $eligeSlot = function(array $grupo) use (&$slots,&$slotCarga,&$docPorNM,&$slotProhibido,&$dnisEnSlot,&$dnisPorNumero){
      $dnisG = unionDNIs($dnisPorNumero,$grupo);
      $cands=[];
      for($s=0;$s<count($slots);$s++){
        $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotKey="$f|$t";
        $ok=true;
        foreach($grupo as $nm){
          $doc=$docPorNM[$nm]??0;
          if($doc>0 && $slotProhibido($doc,$f,$t)){ $ok=false; break; }
        }
        if(!$ok) continue;
        // DNIs contra el slot
        $enSlot = array_keys($dnisEnSlot[$slotKey]??[]);
        if ($enSlot) {
          $h=array_flip($enSlot);
          $choque=false;
          foreach($dnisG as $dni){ if(isset($h[$dni])) { $choque=true; break; } }
          if($choque) continue;
        }
        $cands[]=$s;
      }
      if(!$cands) return -1;
      usort($cands, function($x,$y) use ($slotCarga){
        if ($slotCarga[$x]===$slotCarga[$y]) return $x<=>$y;
        return $slotCarga[$x] <=> $slotCarga[$y];
      });
      return $cands[0];
    };

    foreach ($libresPorArea as $area=>$nums) {
      if (!$nums) continue;

      // grupos sin choque
      $gruposBase = crearGruposSinChoque($nums, $dnisPorNumero);

      // rest para expansiones
      $usados=[]; foreach($gruposBase as $g) foreach($g as $x) $usados[$x]=true;
      $rest = array_values(array_filter($nums, fn($x)=>!isset($usados[$x])));

      foreach ($gruposBase as $g) {
        // ---- NUEVO: si es single, NO crear grupo. Lo mandamos a no_agrupadas.
        if (count($g)===1) {
          $s = $eligeSlot($g);
          $nm = $g[0];
          if ($s<0) {
            // no hay slot: quedan pendientes sin fecha
            $remanentes[]=['numero_mesa'=>$nm,'fecha'=>null,'turno'=>null,'motivo'=>'single_sin_slot'];
            continue;
          }
          $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotCarga[$s]++;

          if(!$dryRun){
            // agenda la mesa
            $pdo->prepare("
              UPDATE mesas_examen.mesas
                 SET fecha_mesa=?, id_turno=?
               WHERE (fecha_mesa IS NULL) AND (id_turno IS NULL OR id_turno=0)
                 AND numero_mesa = ?
            ")->execute([$f,$t,$nm]);

            // inserta como no_agrupada
            $stDupLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
            if(!$stDupLeft->fetch()) $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
          } else {
            $creados[]=['accion'=>'preview_no_agrupada','fecha'=>$f,'turno'=>$t,'numero_mesa'=>$nm];
          }

          // registrar DNIs del single en el slot elegido
          foreach(unionDNIs($dnisPorNumero,[$nm]) as $dni){ $dnisEnSlot["$f|$t"][$dni]=true; }
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
            if ($s>=0) {
              $g = $g4; // quedó cuaterna
            } else {
              // no entró como 4 -> devuelvo el 4º al rest
              $rest[] = $g4[3];
            }
          }
        }

        // elegir slot (para 2/3/4)
        $s = $eligeSlot($g);
        if ($s<0) {
          // no hay slot: quedan pendientes
          foreach($g as $nm){
            $remanentes[]=['numero_mesa'=>$nm,'fecha'=>null,'turno'=>null,'motivo'=>'sin_slot_sin_choque'];
          }
          continue;
        }

        $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotCarga[$s]++;
        // asigno fecha/turno a todas las mesas del grupo
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

        // creo grupo (2/3/4)
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

        // registrar DNIs del grupo en el slot elegido
        foreach(unionDNIs($dnisPorNumero,$g) as $dni){ $dnisEnSlot["$f|$t"][$dni]=true; }
        $agendadas += count($g);
        $slotsAsignados[]=['nums'=>$g,'fecha'=>$f,'turno'=>$t,'area'=>$area];
      }
    }
  }

  // Limpieza global: si alguna mesa quedó en no_agrupadas pero también en un grupo, se purga la tabla no_agrupadas
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
      'singles_no_agrupadas'=> count($singlesNoAgrupadas)
    ],
    'detalle'=>[
      'creados'               => $creados,
      'remanentes'            => $remanentes,
      'omitidos_dup'          => $omitidosDup,
      'slots_asignados'       => $slotsAsignados,
      'singles_no_agrupadas'  => $singlesNoAgrupadas
    ],
    'nota'=>'Se arman grupos de 2/3/4 (con intento de expandir 3→4). '
           .'Cuando queda un solo numero_mesa, no se crea grupo: se agenda en un slot válido '
           .'y se registra en mesas_no_agrupadas. Se respeta indisponibilidad de docentes y se evita '
           .'poner al mismo alumno en dos mesas del mismo día/turno.'
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  respond(false, 'Error en el servidor: '.$e->getMessage(), 500);
}
