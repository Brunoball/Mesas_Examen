<?php
// backend/modules/mesas/armar_mesa_grupo.php
// -----------------------------------------------------------------------------
// Versión: "correlatividad estricta por DNI+área" + split selectivo por DNI
// Ajustado para:
//
// 1) NUNCA dejar/crear grupos de tamaño 1 (singles -> no_agrupadas),
//    EXCEPTO en el caso de MESAS ESPECIALES DE 7º AÑO:
//       - Mesas cuyo curso es SIEMPRE 7 (todas las previas asociadas
//         a ese numero_mesa tienen materia_id_curso = 7).
//       - Para esas mesas se permite crear grupos de 1 en mesas_grupos.
//
// 2) Evitar que una misma mesa aparezca varias veces en "no agrupadas":
//       - Antes de insertar en mesas_no_agrupadas, se borra cualquier
//         registro anterior de ese numero_mesa (sea cual sea la fecha/turno).
//
// 3) NUEVO: cuando se agenda una mesa (single o grupo), se actualizan TODAS
//    las filas de ese numero_mesa en `mesas` (sin filtrar por fecha_mesa NULL),
//    para que una misma mesa NO quede en dos días/turnos distintos.
//
// 4) NUEVO (MUY IMPORTANTE PARA 7º):
//    - Antes de hacer cualquier agrupamiento, se normalizan las mesas de 7º:
//      para cada (dni, id_area) con materia_id_curso=7, se fuerza a que haya
//      UN SOLO numero_mesa. Si hay varios, se unifican en el menor numero_mesa
//      actualizando tablas: mesas, mesas_grupos y mesas_no_agrupadas.
//      => Nunca más un alumno de 7º tendrá 2 mesas distintas en la misma área.
//
// 5) NUEVO (MUY IMPORTANTE PARA 3º TÉCNICO):
//    - Para 3º (materia_id_curso = 3) y materias id_materia IN (18,32,132)
//      (Dibujo Técnico, Ed. Tecnológica y Taller/Lab):
//      * Si un alumno tiene alguna de esas materias, sus previas de ese trío
//        se normalizan a UNA SOLA numero_mesa EXCLUSIVA de ese alumno,
//        juntando las 3 materias y sus docentes.
//      * Esas mesas se tratan como "especiales", igual que las de 7º:
//          - se permiten grupos de 1 en mesas_grupos,
//          - nunca se mezclan con otras mesas,
//          - no se mandan a mesas_no_agrupadas por sanidad.
//
// 6) NUEVO (BLOQUEO DE SÁBADOS Y DOMINGOS):
//      - El rango de fechas usado para agendar NO incluye sábados (6) ni
//        domingos (7). Es decir, el sistema NO arma mesas en fines de semana.
//
// **Indisponibilidad docentes (NUEVAS REGLAS)** leída de `docentes_bloques_no`:
//   - (id_turno != NULL, fecha != NULL) => NO en ese slot (fecha+turno).
//   - (id_turno != NULL, fecha == NULL) => NO en NINGÚN día para ese turno.
//   - (id_turno == NULL, fecha != NULL) => ese día NO en NINGÚN turno.
//
// *** ARREGLO IMPORTANTE ***
//   - Ahora se tienen en cuenta TODOS los docentes de cada numero_mesa
//     (no solo uno). Si ALGUNO de los docentes está bloqueado para un
//     slot (fecha+turno), esa mesa/grupo NO se agenda en ese slot.
// -----------------------------------------------------------------------------


declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../../config/db.php';

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

/**
 * Genera un rango de fechas entre inicio y fin (inclusive),
 * EXCLUYENDO SIEMPRE sábados y domingos.
 *
 * Lunes = 1 ... Domingo = 7 (formato 'N')
 */
function rangoFechas(string $inicio,string $fin): array {
  $di=new DateTime($inicio);
  $df=new DateTime($fin);
  if($df<$di) return [];
  $out=[];
  while($di<=$df){
    $dow = (int)$di->format('N'); // 1=lunes ... 7=domingo
    if ($dow <= 5) { // solo lunes-viernes
      $out[]=$di->format('Y-m-d');
    }
    $di->modify('+1 day');
  }
  return $out;
}

function pad4(array $g): array {
  $n = count($g);
  if ($n===1) return [$g[0],0,0,0];
  if ($n===2) return [$g[0],$g[1],0,0];
  if ($n===3) return [$g[0],$g[1],$g[2],0];
  return [$g[0],$g[1],$g[2],$g[3]];
}

// NUEVO: hora según turno para los INSERT en mesas_grupos y mesas_no_agrupadas
function horaSegunTurno(int $turno): string {
  return $turno === 1 ? '07:30:00' : '13:30:00';
}

/**
 * NORMALIZACIÓN ESPECIAL 7º:
 * Para cada (dni, id_area) con materia_id_curso=7, asegura que haya un único
 * numero_mesa. Si hay varios, los unifica en el menor numero_mesa (ref)
 * actualizando:
 *   - mesas
 *   - mesas_grupos
 *   - mesas_no_agrupadas
 *
 * De esta forma, un alumno de 7º no puede tener nunca 2 mesas distintas en
 * la misma área.
 */
function normalizarMesasEspecial7PorAlumnoArea(PDO $pdo): void {
  $sql = "
    SELECT
      p.dni,
      mat.id_area AS id_area,
      MIN(m.numero_mesa) AS numero_ref,
      GROUP_CONCAT(DISTINCT m.numero_mesa ORDER BY m.numero_mesa) AS numeros
    FROM mesas m
    INNER JOIN previas p  ON p.id_previa = m.id_previa
    INNER JOIN catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c.id_materia
    WHERE p.materia_id_curso = 7
    GROUP BY p.dni, mat.id_area
    HAVING COUNT(DISTINCT m.numero_mesa) > 1
  ";
  $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

  if (!$rows) return;

  $stUpdMesas = $pdo->prepare("
    UPDATE mesas
       SET numero_mesa = :ref
     WHERE numero_mesa = :old
  ");
  $stUpdNoAgr = $pdo->prepare("
    UPDATE mesas_no_agrupadas
       SET numero_mesa = :ref
     WHERE numero_mesa = :old
  ");
  $stUpdGrupo = $pdo->prepare("
    UPDATE mesas_grupos
       SET numero_mesa_1 = CASE WHEN numero_mesa_1 = :old THEN :ref ELSE numero_mesa_1 END,
           numero_mesa_2 = CASE WHEN numero_mesa_2 = :old THEN :ref ELSE numero_mesa_2 END,
           numero_mesa_3 = CASE WHEN numero_mesa_3 = :old THEN :ref ELSE numero_mesa_3 END,
           numero_mesa_4 = CASE WHEN numero_mesa_4 = :old THEN :ref ELSE numero_mesa_4 END
  ");

  foreach ($rows as $r) {
    $ref = (int)$r['numero_ref'];
    $nums = array_filter(array_map('intval', explode(',', (string)$r['numeros'])));
    $nums = array_values(array_unique($nums));

    foreach ($nums as $nm) {
      if ($nm === $ref) continue;

      // Unificar en MESAS
      $stUpdMesas->execute([':ref' => $ref, ':old' => $nm]);

      // Unificar en MESAS_NO_AGRUPADAS
      $stUpdNoAgr->execute([':ref' => $ref, ':old' => $nm]);

      // Unificar en MESAS_GRUPOS
      $stUpdGrupo->execute([':ref' => $ref, ':old' => $nm]);
    }
  }

  // Limpieza opcional: grupos totalmente vacíos
  $pdo->exec("
    DELETE g
    FROM mesas_grupos g
    WHERE (numero_mesa_1 = 0 AND numero_mesa_2 = 0 AND numero_mesa_3 = 0 AND numero_mesa_4 = 0)
  ");
}

/**
 * NORMALIZACIÓN ESPECIAL 3º TÉCNICO (materias 18,32,132):
 *
 * Para cada dni con materia_id_curso=3 y id_materia IN (18,32,132):
 *   - Si comparte numero_mesa con otros DNIs, se lo separa a una mesa nueva
 *     (únicamente sus filas de esas 3 materias).
 *   - Luego se unifican TODAS sus filas de esas 3 materias en una sola
 *     numero_mesa (la menor), dejando fecha_mesa/id_turno en NULL para
 *     re-agendar.
 *   - Se actualizan también mesas_no_agrupadas y mesas_grupos.
 *
 * NUEVO:
 *   - Una vez unificadas, se completa el TRÍO TÉCNICO (18,32,132) agregando
 *     las cátedras faltantes de esas materias para el curso=3 y la división
 *     de 3º del alumno, con sus docentes correctos, siempre en el MISMO
 *     numero_mesa exclusivo.
 *
 * Resultado:
 *   - Un alumno de 3º técnico queda con UNA mesa exclusiva que contiene
 *     Dibujo Técnico, Educación Tecnológica y Taller/Laboratorio, con los
 *     docentes que correspondan a su división.
 */
function normalizarMesasTecnicas3PorAlumno(PDO $pdo): void {
  // Buscar filas relevantes (3º + materias 18,32,132)
  $sql = "
    SELECT p.dni, m.numero_mesa, p.id_materia
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE p.materia_id_curso = 3
      AND p.id_materia IN (18,32,132)
  ";
  $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
  if (!$rows) return;

  // Agrupar numero_mesa por dni
  $porDniNums = []; // dni => [numero_mesa => true]
  $numsAfectados = []; // todos los numero_mesa donde hay estas materias
  foreach ($rows as $r) {
    $dni = (string)$r['dni'];
    $nm  = (int)$r['numero_mesa'];
    if (!isset($porDniNums[$dni])) $porDniNums[$dni] = [];
    $porDniNums[$dni][$nm] = true;
    $numsAfectados[$nm] = true;
  }

  if (!$numsAfectados) return;

  // Contador de DNIs por numero_mesa (global)
  $stCnt = $pdo->prepare("
    SELECT COUNT(DISTINCT p.dni) AS c
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE m.numero_mesa = :nm
  ");

  // Nuevo numero_mesa incremental
  $rowMax = $pdo->query("SELECT COALESCE(MAX(numero_mesa),0) FROM mesas")->fetch(PDO::FETCH_NUM);
  $nextNm = (int)($rowMax[0] ?? 0) + 1;

  // Split: separa a un dni en una nueva mesa sólo para materias 18/32/132 en 3º
  $stSplit = $pdo->prepare("
    UPDATE mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    SET m.numero_mesa = :nmNuevo,
        m.fecha_mesa  = NULL,
        m.id_turno    = NULL
    WHERE m.numero_mesa      = :nmViejo
      AND p.dni              = :dni
      AND p.materia_id_curso = 3
      AND p.id_materia       IN (18,32,132)
  ");

  // Si un numero_mesa tiene +1 dni, separar cada dni de técnico 3º
  foreach ($numsAfectados as $nm => $_) {
    $stCnt->execute([':nm' => $nm]);
    $c = (int)($stCnt->fetchColumn() ?: 0);
    if ($c <= 1) continue;

    // DNIs de 3º técnico en ese numero_mesa
    $stDni = $pdo->prepare("
      SELECT DISTINCT p.dni
      FROM mesas m
      INNER JOIN previas p ON p.id_previa = m.id_previa
      WHERE m.numero_mesa = :nm
        AND p.materia_id_curso = 3
        AND p.id_materia IN (18,32,132)
    ");
    $stDni->execute([':nm' => $nm]);
    $dnis = $stDni->fetchAll(PDO::FETCH_COLUMN);

    foreach ($dnis as $dni) {
      $nmNuevo = $nextNm++;
      $stSplit->execute([
        ':nmNuevo' => $nmNuevo,
        ':nmViejo' => $nm,
        ':dni'     => $dni,
      ]);

      if (isset($porDniNums[$dni][$nm])) {
        unset($porDniNums[$dni][$nm]);
        $porDniNums[$dni][$nmNuevo] = true;
      }
    }
  }

  // Unificar TODOS los numero_mesa de técnico 3º por dni en el menor numero_mesa
  $stUpdMesa = $pdo->prepare("
    UPDATE mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    SET m.numero_mesa = :ref,
        m.fecha_mesa  = NULL,
        m.id_turno    = NULL
    WHERE m.numero_mesa      = :old
      AND p.dni              = :dni
      AND p.materia_id_curso = 3
      AND p.id_materia       IN (18,32,132)
  ");
  $stUpdNoAgr = $pdo->prepare("
    UPDATE mesas_no_agrupadas
       SET numero_mesa = :ref
     WHERE numero_mesa = :old
  ");
  $stUpdGrupo = $pdo->prepare("
    UPDATE mesas_grupos
       SET numero_mesa_1 = CASE WHEN numero_mesa_1 = :old THEN :ref ELSE numero_mesa_1 END,
           numero_mesa_2 = CASE WHEN numero_mesa_2 = :old THEN :ref ELSE numero_mesa_2 END,
           numero_mesa_3 = CASE WHEN numero_mesa_3 = :old THEN :ref ELSE numero_mesa_3 END,
           numero_mesa_4 = CASE WHEN numero_mesa_4 = :old THEN :ref ELSE numero_mesa_4 END
  ");

  foreach ($porDniNums as $dni => $setNums) {
    $nums = array_keys($setNums);
    if (count($nums) <= 1) continue;

    sort($nums, SORT_NUMERIC);
    $ref = (int)$nums[0];

    foreach ($nums as $old) {
      if ($old === $ref) continue;

      // Mesas (sólo materias 18/32/132 de ese dni)
      $stUpdMesa->execute([
        ':ref' => $ref,
        ':old' => $old,
        ':dni' => $dni,
      ]);

      // No agrupadas
      $stUpdNoAgr->execute([':ref' => $ref, ':old' => $old]);

      // Grupos
      $stUpdGrupo->execute([':ref' => $ref, ':old' => $old]);
    }
  }

  // Limpieza opcional: grupos totalmente vacíos
  $pdo->exec("
    DELETE g
    FROM mesas_grupos g
    WHERE (numero_mesa_1 = 0 AND numero_mesa_2 = 0 AND numero_mesa_3 = 0 AND numero_mesa_4 = 0)
  ");

  // --------------- NUEVO: COMPLETAR TRÍO TÉCNICO 18/32/132 ---------------
  $materiasTrio = [18, 32, 132];

  // Mapa dni -> numero_mesa de referencia (el menor que quedó después de la unificación)
  $rowsRef = $pdo->query("
    SELECT p.dni, MIN(m.numero_mesa) AS numero_ref
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE p.materia_id_curso = 3
      AND p.id_materia IN (18,32,132)
    GROUP BY p.dni
  ")->fetchAll(PDO::FETCH_ASSOC);

  if (!$rowsRef) return;

  // Info base: previa y división de 3º para cada alumno técnico
  $stInfoBase = $pdo->prepare("
    SELECT
      MIN(id_previa)           AS id_previa_base,
      MIN(materia_id_division) AS div_materia
    FROM previas
    WHERE dni = :dni
      AND materia_id_curso = 3
      AND id_materia IN (18,32,132)
  ");

  // ⚠️ AHORA: TODAS las cátedras/docentes de esa materia en esa división (sin LIMIT 1)
  $stCat = $pdo->prepare("
    SELECT id_catedra, id_docente
    FROM catedras
    WHERE id_materia = :id_mat
      AND id_curso   = 3
      AND id_division = :div
  ");

  // Verificar si ya existe esa cátedra en la mesa
  $stCheck = $pdo->prepare("
    SELECT 1
    FROM mesas
    WHERE numero_mesa = :nm
      AND id_catedra  = :id_catedra
    LIMIT 1
  ");

  // Insertar fila de mesa nueva (materia/docente faltante del trío)
  $stInsMesa = $pdo->prepare("
    INSERT INTO mesas (numero_mesa, id_previa, id_catedra, id_docente, fecha_mesa, id_turno, prioridad)
    VALUES (:nm, :id_previa, :id_catedra, :id_docente, NULL, NULL, 0)
  ");

  foreach ($rowsRef as $r) {
    $dni   = (string)$r['dni'];
    $nmRef = (int)$r['numero_ref'];

    // Info base de previas de 3º técnico para este alumno
    $stInfoBase->execute([':dni' => $dni]);
    $info = $stInfoBase->fetch(PDO::FETCH_ASSOC);
    if (!$info || !$info['id_previa_base'] || !$info['div_materia']) {
      continue;
    }

    $idPreviaBase = (int)$info['id_previa_base'];
    $division3    = (int)$info['div_materia'];

    foreach ($materiasTrio as $idMat) {
      // Buscar TODAS las cátedras/docentes de esa materia en 3º y en la división del alumno
      $stCat->execute([
        ':id_mat' => $idMat,
        ':div'    => $division3,
      ]);
      $cats = $stCat->fetchAll(PDO::FETCH_ASSOC);
      if (!$cats) {
        continue;
      }

      foreach ($cats as $cat) {
        $idCatedra = (int)$cat['id_catedra'];
        $idDocente = (int)$cat['id_docente'];

        // ¿Ya existe esa cátedra en la mesa técnica exclusiva?
        $stCheck->execute([
          ':nm'         => $nmRef,
          ':id_catedra' => $idCatedra,
        ]);
        if ($stCheck->fetch()) {
          continue; // ya está esa materia/docente en la mesa
        }

        // Insertar fila en `mesas` usando la previa base del alumno
        $stInsMesa->execute([
          ':nm'         => $nmRef,
          ':id_previa'  => $idPreviaBase,
          ':id_catedra' => $idCatedra,
          ':id_docente' => $idDocente,
        ]);
      }
    }
  }
}

// ---------------- DNI helpers ----------------
/** [numero_mesa => array<string dni>] */
function mapDNIsPorNumero(PDO $pdo): array {
  $sql = "
    SELECT m.numero_mesa, p.dni
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
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
  if (!is_array($nums)) {
    $nums = [];
  }

  sort($nums, SORT_NUMERIC);
  $rest = $nums;
  $grupos = [];

  // Helper interno robusto: garantiza que $rest sea array antes de array_diff
  $forma = function (int $target, array &$rest, array $dnisMap) {
    if (!is_array($rest)) {
      $rest = [];
    }

    $n = count($rest);
    if ($n === 0) return null;

    for ($i = 0; $i < $n; $i++) {
      $seed  = $rest[$i];
      $grupo = [$seed];
      $acum  = unionDNIs($dnisMap, $grupo);

      for ($j = 0; $j < $n && count($grupo) < $target; $j++) {
        if ($j === $i) continue;

        $cand = $rest[$j];
        if (!numeroChocaSet($dnisMap, $cand, $acum)) {
          $grupo[] = $cand;
          $acum = unionDNIs($dnisMap, $grupo);
        }
      }

      if (count($grupo) === $target) {
        // Uso seguro de array_diff
        $rest = array_values(array_diff($rest ?? [], $grupo ?? []));
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
function expandirATresMasUnoEnSlot(
  array $grupo3,
  array &$rest,
  array $dnisMap,
  array $docPorNM,
  callable $slotProhibido,
  string $fecha,
  int $turno,
  array $dnisSlotActual
): array {
  $dnisG = unionDNIs($dnisMap, $grupo3);
  foreach ($rest as $k => $nm) {
    // chequeo TODOS los docentes de esa mesa
    $docs = $docPorNM[$nm] ?? [];
    $bloq = false;
    foreach ($docs as $d) {
      if ($slotProhibido($d, $fecha, $turno)) { $bloq = true; break; }
    }
    if ($bloq) continue;

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

// ---------------- Split selectivo por DNI ----------------
function splitAlumnoEnNumeroMesa(PDO $pdo, int $nmOrigen, string $dni): ?int {
  $stCount = $pdo->prepare("
    SELECT COUNT(DISTINCT p.dni) AS cnt
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE m.numero_mesa = :nm
  ");
  $stCount->execute([':nm'=>$nmOrigen]);
  $cnt = (int)($stCount->fetchColumn() ?: 0);
  if ($cnt < UMBRAL_SPLIT_MUCHOS_ALUMNOS) return null;

  $rowMax = $pdo->query("SELECT COALESCE(MAX(numero_mesa),0) FROM mesas")->fetch(PDO::FETCH_NUM);
  $nmNuevo = (int)($rowMax[0] ?? 0) + 1;

  $stUpd = $pdo->prepare("
    UPDATE mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    SET m.numero_mesa = :nmNuevo,
        m.fecha_mesa  = NULL,
        m.id_turno    = NULL
    WHERE m.numero_mesa = :nmOrigen
      AND p.dni = :dni
  ");
  $stUpd->execute([':nmNuevo'=>$nmNuevo, ':nmOrigen'=>$nmOrigen, ':dni'=>$dni]);

  $moved = $stUpd->rowCount();
  if ($moved <= 0) return null;

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

    // AHORA: rango de fechas SIN sábados ni domingos
    $fechasRango = rangoFechas($fi,$ff);
    if (!$fechasRango) bad_request("Rango de fechas inválido (o solo contiene fines de semana).");
  }

  // ================== NORMALIZACIONES CRÍTICAS ==================
  normalizarMesasEspecial7PorAlumnoArea($pdo);
  normalizarMesasTecnicas3PorAlumno($pdo);
  // =============================================================

  // ==================== INDISPONIBILIDAD DESDE docentes_bloques_no ====================
  $docNoTurn = [];
  $docNoDay  = [];
  $rsBN = $pdo->query("SELECT id_docente, id_turno, fecha FROM docentes_bloques_no");
  if ($rsBN) {
    foreach ($rsBN->fetchAll(PDO::FETCH_ASSOC) as $r) {
      $idd = (int)$r['id_docente'];
      $t   = array_key_exists('id_turno',$r) && $r['id_turno'] !== null ? (int)$r['id_turno'] : null;
      $f   = array_key_exists('fecha',$r)    ? $r['fecha'] : null;

      if ($t !== null && ($f === null || $f === '')) {
        $docNoTurn[$idd][$t] = true;
        continue;
      }
      if (($t === null) && ($f !== null && $f !== '')) {
        $docNoDay[$idd][$f][1] = true;
        $docNoDay[$idd][$f][2] = true;
        continue;
      }
      if (($t !== null) && ($f !== null && $f !== '')) {
        $docNoDay[$idd][$f][$t] = true;
      }
    }
  }
  $slotProhibido = function(int $id_docente, string $fecha, int $turno) use ($docNoTurn, $docNoDay): bool {
    if (isset($docNoTurn[$id_docente][$turno])) return true;
    if (isset($docNoDay[$id_docente][$fecha][$turno])) return true;
    return false;
  };

  // ===== Datos base: DNIs por numero, curso por DNI/numero y área por numero =====
  $dnisPorNumero = mapDNIsPorNumero($pdo);

  $cursoPorNumeroPorDni = [];
  $cursoSetPorNumero    = [];
  $areaPorNumero        = [];
  $docPorNM             = [];

  // ⚠️ AHORA guardamos TODOS los docentes por numero_mesa
  $resCur = $pdo->query("
    SELECT
      m.numero_mesa,
      p.dni,
      p.materia_id_curso AS curso,
      mat.id_area,
      m.id_docente
    FROM mesas m
    INNER JOIN previas p  ON p.id_previa = m.id_previa
    INNER JOIN catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c.id_materia
    GROUP BY m.numero_mesa, p.dni, p.materia_id_curso, mat.id_area, m.id_docente
  ")->fetchAll(PDO::FETCH_ASSOC);

  foreach ($resCur as $r) {
    $nm   = (int)$r['numero_mesa'];
    $dni  = (string)$r['dni'];
    $curso= (int)$r['curso'];
    $area = (int)$r['id_area'];
    $doc  = (int)$r['id_docente'];

    if (!isset($cursoPorNumeroPorDni[$nm])) $cursoPorNumeroPorDni[$nm]=[];
    if (!isset($cursoPorNumeroPorDni[$nm][$dni]) || $curso < $cursoPorNumeroPorDni[$nm][$dni]) {
      $cursoPorNumeroPorDni[$nm][$dni]=$curso;
    }

    if (!isset($cursoSetPorNumero[$nm])) $cursoSetPorNumero[$nm]=[];
    $cursoSetPorNumero[$nm][$curso] = true;

    $areaPorNumero[$nm] = $area;

    if (!isset($docPorNM[$nm])) $docPorNM[$nm] = [];
    if ($doc > 0 && !in_array($doc, $docPorNM[$nm], true)) {
      $docPorNM[$nm][] = $doc;
    }
  }

  // ---- MESAS ESPECIALES DE 7º: todos sus cursos son 7
  $mesaEspecial7 = [];
  foreach ($cursoSetPorNumero as $nm => $setCursos) {
    $cursos = array_keys($setCursos);
    if (count($cursos) === 1 && (int)$cursos[0] === 7) {
      $mesaEspecial7[$nm] = true;
    }
  }

  // ---- MESAS ESPECIALES DE 3º TÉCNICO (18,32,132) EXCLUSIVAS POR ALUMNO ----
  $mesaTec3 = [];
  $resTec = $pdo->query("
    SELECT m.numero_mesa
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE p.materia_id_curso = 3
    GROUP BY m.numero_mesa
    HAVING
      SUM(CASE WHEN p.id_materia IN (18,32,132) THEN 1 ELSE 0 END) >= 1
      AND COUNT(DISTINCT p.dni) = 1
      AND SUM(CASE WHEN p.id_materia NOT IN (18,32,132) THEN 1 ELSE 0 END) = 0
  ")->fetchAll(PDO::FETCH_COLUMN);
  foreach ($resTec as $nmT) {
    $mesaTec3[(int)$nmT] = true;
  }

  // Prioridad por numero_mesa
  $prioPorNumero = [];
  $resPr = $pdo->query("
    SELECT numero_mesa, MAX(prioridad) AS prio
    FROM mesas
    GROUP BY numero_mesa
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach ($resPr as $r) { $prioPorNumero[(int)$r['numero_mesa']] = (int)$r['prio']; }

  // ---------------- Mesas ya fechadas ----------------
  $paramsF=[];
  $sqlFechadas = "
    SELECT m.numero_mesa, m.fecha_mesa, m.id_turno,
           MIN(m.id_docente) AS id_docente,
           mat.id_area AS id_area
    FROM mesas m
    INNER JOIN catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c.id_materia
    WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
  ";
  if ($filtroFecha!==null) { $sqlFechadas.=" AND m.fecha_mesa=:f "; $paramsF[':f']=$filtroFecha; }
  if ($filtroTurno!==null) { $sqlFechadas.=" AND m.id_turno=:t ";   $paramsF[':t']=(int)$filtroTurno; }
  $sqlFechadas.=" GROUP BY m.numero_mesa,m.fecha_mesa,m.id_turno,mat.id_area
                  ORDER BY m.fecha_mesa,m.id_turno,mat.id_area,m.numero_mesa";
  $stF=$pdo->prepare($sqlFechadas); $stF->execute($paramsF);
  $rowsFechadas=$stF->fetchAll(PDO::FETCH_ASSOC);

  // ----- Orden y mapa de slots (fecha+turno) -----
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
  $agendaDniArea = [];
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
    FROM mesas_grupos
    WHERE fecha_mesa = :f AND id_turno = :t
      AND (:n IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4))
    LIMIT 1
  ");
  $stDelGrupo = $pdo->prepare("DELETE FROM mesas_grupos WHERE id_mesa_grupos = :id");
  $stUnsetFecha = $pdo->prepare("
    UPDATE mesas
       SET fecha_mesa=NULL, id_turno=NULL
     WHERE numero_mesa=:n AND fecha_mesa=:f AND id_turno=:t
  ");

  $deferidos = [];
  $splitHechos = [];
  $huboCambiosEstructura = false;

  if (!$dryRun && !empty($agendaDniArea)) {
    foreach ($agendaDniArea as $dni => $areas) {
      foreach ($areas as $area => $regs) {
        usort($regs, fn($a,$b)=>$a['slot']<=>$b['slot']);
        $minCursoGlobal = PHP_INT_MAX;
        foreach ($regs as $info) { $minCursoGlobal = min($minCursoGlobal, $info['curso']); }

        foreach ($regs as $infoMayor) {
          $hayMenorDespues = false;
          foreach ($regs as $infoMenor) {
            if ($infoMenor['curso'] < $infoMayor['curso'] && $infoMenor['slot'] > $infoMayor['slot']) {
              $hayMenorDespues = true;
              break;
            }
          }
          if (!$hayMenorDespues) continue;

          $nmMayor = (int)$infoMayor['nm'];
          $dnIsDelNM = $dnisPorNumero[$nmMayor] ?? [];
          $cantDnisNM = count($dnIsDelNM);

          $seHizoSplit = false;
          if ($cantDnisNM >= UMBRAL_SPLIT_MUCHOS_ALUMNOS) {
            $nmNuevo = splitAlumnoEnNumeroMesa($pdo, $nmMayor, (string)$dni);
            if ($nmNuevo !== null) {
              $splitHechos[] = ['dni'=>$dni, 'nm_origen'=>$nmMayor, 'nm_nuevo'=>$nmNuevo];
              $huboCambiosEstructura = true;
              $seHizoSplit = true;
            }
          }

          if (!$seHizoSplit) {
            $fecha=null; $turno=null;
            foreach ($rowsFechadas as $rF) {
              if ((int)$rF['numero_mesa']===$nmMayor) { $fecha=$rF['fecha_mesa']; $turno=(int)$rF['id_turno']; break; }
            }
            if ($fecha!==null && $turno!==null) {
              $stFindGrupo->execute([':f'=>$fecha,':t'=>$turno,':n'=>$nmMayor]);
              if ($g=$stFindGrupo->fetch(PDO::FETCH_ASSOC)) {
                $numsG = array_values(array_filter([
                  (int)$g['numero_mesa_1'], (int)$g['numero_mesa_2'], (int)$g['numero_mesa_3'], (int)$g['numero_mesa_4']
                ]));
                $stDelGrupo->execute([':id'=>$g['id_mesa_grupos']]);
                foreach ($numsG as $nx) {
                  $stUnsetFecha->execute([':n'=>$nx,':f'=>$fecha,':t'=>$turno]);
                  $deferidos[$nx]=true;
                }
              } else {
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
      $cursoSetPorNumero    = [];
      $areaPorNumero = [];
      $docPorNM = [];

      $resCur = $pdo->query("
        SELECT
          m.numero_mesa,
          p.dni,
          p.materia_id_curso AS curso,
          mat.id_area,
          m.id_docente
        FROM mesas m
        INNER JOIN previas p  ON p.id_previa = m.id_previa
        INNER JOIN catedras c ON c.id_catedra = m.id_catedra
        INNER JOIN materias mat ON mat.id_materia = c.id_materia
        GROUP BY m.numero_mesa, p.dni, p.materia_id_curso, mat.id_area, m.id_docente
      ")->fetchAll(PDO::FETCH_ASSOC);

      foreach ($resCur as $r) {
        $nm   = (int)$r['numero_mesa'];
        $dni  = (string)$r['dni'];
        $curso= (int)$r['curso'];
        $area = (int)$r['id_area'];
        $doc  = (int)$r['id_docente'];

        if (!isset($cursoPorNumeroPorDni[$nm])) $cursoPorNumeroPorDni[$nm]=[];
        if (!isset($cursoPorNumeroPorDni[$nm][$dni]) || $curso < $cursoPorNumeroPorDni[$nm][$dni]) {
          $cursoPorNumeroPorDni[$nm][$dni]=$curso;
        }

        if (!isset($cursoSetPorNumero[$nm])) $cursoSetPorNumero[$nm]=[];
        $cursoSetPorNumero[$nm][$curso] = true;

        $areaPorNumero[$nm] = $area;

        if (!isset($docPorNM[$nm])) $docPorNM[$nm] = [];
        if ($doc > 0 && !in_array($doc, $docPorNM[$nm], true)) {
          $docPorNM[$nm][] = $doc;
        }
      }

      // Recalcular mesas especiales 7º
      $mesaEspecial7 = [];
      foreach ($cursoSetPorNumero as $nm => $setCursos) {
        $cursos = array_keys($setCursos);
        if (count($cursos) === 1 && (int)$cursos[0] === 7) {
          $mesaEspecial7[$nm] = true;
        }
      }

      // Recalcular mesas técnicas 3º
      $mesaTec3 = [];
      $resTec = $pdo->query("
        SELECT m.numero_mesa
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        WHERE p.materia_id_curso = 3
        GROUP BY m.numero_mesa
        HAVING
          SUM(CASE WHEN p.id_materia IN (18,32,132) THEN 1 ELSE 0 END) >= 1
          AND COUNT(DISTINCT p.dni) = 1
          AND SUM(CASE WHEN p.id_materia NOT IN (18,32,132) THEN 1 ELSE 0 END) = 0
      ")->fetchAll(PDO::FETCH_COLUMN);
      foreach ($resTec as $nmT) {
        $mesaTec3[(int)$nmT] = true;
      }

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
    FROM mesas m
    INNER JOIN catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c.id_materia
    WHERE m.fecha_mesa IS NULL AND (m.id_turno IS NULL OR m.id_turno=0)
    GROUP BY m.numero_mesa, mat.id_area
    ORDER BY mat.id_area, m.numero_mesa
  ")->fetchAll(PDO::FETCH_ASSOC);

  $libresPorArea=[];
  foreach($rowsLibres as $r){
    $nm=(int)$r['numero_mesa']; $a=(int)$r['id_area'];
    // docPorNM ya viene armado con TODOS los docentes arriba
    $libresPorArea[$a][]=$nm;
  }

  // ---------------- SQL helpers grupos / no_agrupadas ----------------
  $stDupGroup = $pdo->prepare("
    SELECT 1 FROM mesas_grupos
    WHERE fecha_mesa=:f AND id_turno=:t
      AND numero_mesa_1=:a AND numero_mesa_2=:b AND numero_mesa_3=:c AND numero_mesa_4=:d
    LIMIT 1
  ");

  // *** MODIFICADO: ahora incluimos la columna `hora` ***
  $stInsGroup = $pdo->prepare("
    INSERT INTO mesas_grupos
    (numero_mesa_1,numero_mesa_2,numero_mesa_3,numero_mesa_4,fecha_mesa,id_turno,hora)
    VALUES (:a,:b,:c,:d,:f,:t,:h)
  ");

  $stDupLeft = $pdo->prepare("
    SELECT 1 FROM mesas_no_agrupadas
    WHERE numero_mesa=:n AND fecha_mesa=:f AND id_turno=:t LIMIT 1
  ");
  
  // *** MODIFICADO: ahora incluimos la columna `hora` en mesas_no_agrupadas ***
  $stInsLeft = $pdo->prepare("
    INSERT INTO mesas_no_agrupadas (numero_mesa,fecha_mesa,id_turno,hora)
    VALUES (:n,:f,:t,:h)
  ");
  
  // NUEVO: borrar TODAS las filas anteriores de ese numero_mesa en no_agrupadas
  $stDelLeftByMesa = $pdo->prepare("
    DELETE FROM mesas_no_agrupadas WHERE numero_mesa = :n
  ");
  $stDelLeftExact = $pdo->prepare("
    DELETE FROM mesas_no_agrupadas
    WHERE numero_mesa=:n AND fecha_mesa=:f AND id_turno=:t
  ");

  $estaAgrupada = function(int $n, string $f, int $t) use ($pdo): bool {
    $sql="
      SELECT 1
      FROM mesas_grupos g
      WHERE g.fecha_mesa=:f AND g.id_turno=:t
        AND (:n IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4))
      LIMIT 1
    ";
    $st=$pdo->prepare($sql);
    $st->execute([':f'=>$f,':t'=>$t,':n'=>$n]);
    return (bool)$st->fetch();
  };

  if (!$dryRun) $pdo->beginTransaction();

  $creados=[]; $remanentes=[]; $omitidosDup=[]; $parejas=0; $ternas=0; $cuaternas=0;
  $singlesNoAgrupadas=[];

  // =============================== FASE A ===============================
  $buckets=[];
  foreach($rowsFechadas as $r){
    $f=$r['fecha_mesa']; $t=$r['id_turno']; $a=(int)$r['id_area']; $nm=(int)$r['numero_mesa'];
    if (!empty($deferidos[$nm])) continue;
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
      // NO usar mesas especiales de 7º ni técnicas de 3º como "relleno"
      if (!empty($mesaEspecial7[$nm]) || !empty($mesaTec3[$nm])) continue;

      // ⚠️ Chequear TODOS los docentes de esa mesa contra el slot
      $docs = $docPorNM[$nm] ?? [];
      $bloq = false;
      foreach ($docs as $d) {
        if ($slotProhibido($d,$f,$t)) { $bloq = true; break; }
      }
      if ($bloq) continue;

      if (numeroChocaSet($dnisPorNumero, $nm, array_keys($dnisEnSlot[$slotKey]??[]))) continue;

      // Precedencia
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

      // --------- CASO GRUPO DE 1 EN SLOT FIJO ---------
      if ($tamGrupo===1) {
        $nm = $g[0];

        if (!empty($mesaEspecial7[$nm]) || !empty($mesaTec3[$nm])) {
          // ESPECIAL 7º o 3º técnico: grupo de 1 en mesas_grupos
          foreach (unionDNIs($dnisPorNumero, [$nm]) as $dni) { $dnisEnSlot[$slotKey][$dni]=true; }

          [$a1,$b1,$c1,$d1] = pad4([$nm]);
          $stDupGroup->execute([':f'=>$f,':t'=>$t,':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1]);
          if ($stDupGroup->fetch()) {
            $omitidosDup[]=['fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1,'motivo'=>'duplicado(fijado_1_especial)'];
          } else {
            if ($dryRun) {
              $creados[]=['accion'=>'preview','fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
            } else {
              $hora = horaSegunTurno($t);
              $stInsGroup->execute([
                ':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1,
                ':f'=>$f,':t'=>$t,':h'=>$hora
              ]);
              $creados[]=['accion'=>'creado','id_mesa_grupos'=>(int)$pdo->lastInsertId(),'fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
              $stDelLeftByMesa->execute([':n'=>$nm]);
            }
          }
          continue;
        }

        // NO es especial 7º/3º: single fijo -> mesas_no_agrupadas
        if($estaAgrupada($nm,$f,$t)) continue;
        if ($dryRun) {
          $singlesNoAgrupadas[] = ['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'origen'=>'fijo'];
        } else {
          $stDelLeftByMesa->execute([':n'=>$nm]);
          $stDupLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
          if(!$stDupLeft->fetch()) {
            $hora = horaSegunTurno($t);
            $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t,':h'=>$hora]);
          }
          $singlesNoAgrupadas[] = ['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'origen'=>'fijo'];
        }
        foreach (unionDNIs($dnisPorNumero, [$nm]) as $dni) { $dnisEnSlot[$slotKey][$dni]=true; }
        continue;
      }

      // registrar DNIs del grupo en el slot
      foreach (unionDNIs($dnisPorNumero,$g) as $dni) { $dnisEnSlot[$slotKey][$dni]=true; }

      // sacar de libres los usados aquí (sólo si existe el área en libresPorArea)
      foreach($g as $nm){
        if (isset($libresPorArea[$a]) && is_array($libresPorArea[$a])) {
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
          $hora = horaSegunTurno($t);
          $stInsGroup->execute([
            ':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1,
            ':f'=>$f,':t'=>$t,':h'=>$hora
          ]);
          $creados[]=['accion'=>'creado','id_mesa_grupos'=>(int)$pdo->lastInsertId(),'fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
          foreach([$a1,$b1,$c1,$d1] as $nm) if($nm) $stDelLeftExact->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
        }
        $tam=count(array_filter([$a1,$b1,$c1,$d1],fn($x)=>$x>0));
        if($tam===2) $parejas++; elseif($tam===3) $ternas++; elseif($tam===4) $cuaternas++;
      }
    }

    // fijos que sigan sueltos -> no_agrupadas (si no son especiales 7º/3º)
    foreach($numsFijos as $nm){
      if($estaAgrupada($nm,$f,$t)) continue;
      if (!empty($mesaEspecial7[$nm]) || !empty($mesaTec3[$nm])) continue;
      $yaSingle = array_filter($singlesNoAgrupadas, fn($x)=>$x['numero_mesa']===$nm && $x['fecha']===$f && $x['turno']===$t);
      if ($yaSingle) continue;
      if ($dryRun) {
        $remanentes[]=['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'motivo'=>'sin_pareja_en_slot_fijo'];
      } else {
        $stDelLeftByMesa->execute([':n'=>$nm]);
        $stDupLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
        if(!$stDupLeft->fetch()) {
          $hora = horaSegunTurno($t);
          $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t,':h'=>$hora]);
        }
        $remanentes[]=['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'motivo'=>'sin_pareja_en_slot_fijo'];
      }
    }
  }

  // =============================== FASE B ===============================
  $slotsAsignados=[]; $agendadas=0;

  if ($agendar) {
    $slots=[]; foreach($fechasRango as $f){ $slots[]=['fecha'=>$f,'turno'=>1]; $slots[]=['fecha'=>$f,'turno'=>2]; }
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

        // ⚠️ Chequear TODOS los docentes de todas las mesas del grupo
        foreach($grupo as $nm){
          $docs = $docPorNM[$nm] ?? [];
          foreach ($docs as $d) {
            if($slotProhibido($d,$f,$t)){ $ok=false; break 2; }
          }
        }

        $enSlot = array_keys($dnisEnSlot[$slotKey]??[]);
        if ($enSlot && $ok) {
          $h=array_flip($enSlot);
          foreach($dnisG as $dni){ if(isset($h[$dni])) { $ok=false; break; } }
        }
        if(!$ok) continue;

        foreach ($grupo as $nm) {
          foreach (($dnisPorNumero[$nm]??[]) as $dni) {
            $cursoActual = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
            if ($cursoActual===null) continue;
            foreach (($agendaDniArea[$dni][$areaRef]??[]) as $reg) {
              if ($cursoActual > $reg['curso'] && ($slotIdxMap[$slotKey] ?? PHP_INT_MAX) < $reg['slot']) { $ok=false; break 3; }
            }
          }
        }
        if(!$ok) continue;

        $scoreCarga = $slotCarga[$s];
        $scoreOrden = $slotIdxMap[$slotKey] ?? 1e9;
        $cands[] = ['s'=>$s,'carga'=>$scoreCarga,'orden'=>$scoreOrden];
      }
      if(!$cands) return -1;

      usort($cands, function($A,$B) use ($tienePrio){
        if ($tienePrio) {
          return ($A['orden'] <=> $B['orden']) ?: ($A['carga'] <=> $B['carga']) ?: ($A['s'] <=> $B['s']);
        }
        return ($A['carga'] <=> $B['carga']) ?: ($A['orden'] <=> $B['orden']) ?: ($A['s'] <=> $B['s']);
      });
      return $cands[0]['s'];
    };

    foreach ($libresPorArea as $area=>$nums) {
      if (!$nums) continue;

      // Separar especiales (7º y 3º técnico) de las mesas normales
      $especiales = [];
      $normales   = [];
      foreach ($nums as $nm) {
        if (!empty($mesaEspecial7[$nm]) || !empty($mesaTec3[$nm])) {
          $especiales[] = $nm;
        } else {
          $normales[] = $nm;
        }
      }

      // Grupos base sólo con las mesas normales
      $gruposBase = [];
      if ($normales) {
        $gruposBase = crearGruposSinChoque($normales, $dnisPorNumero);

        $usados=[]; foreach($gruposBase as $g) foreach($g as $x) $usados[$x]=true;
        $rest = array_values(array_filter($normales, fn($x)=>!isset($usados[$x])));

        foreach ($gruposBase as $idx => $g) {
          if (count($g)===3 && $rest) {
            $g4 = expandirATresMasUnoSinSlot($g, $rest, $dnisPorNumero);
            if (count($g4)===4) {
              $s = $eligeSlot($g4);
              if ($s>=0) { $gruposBase[$idx] = $g4; } else { $rest[] = $g4[3]; }
            }
          }
        }

        // Procesar grupos normales (2/3/4 y singles NO especiales)
        foreach ($gruposBase as $g) {
          if (count($g)===1) {
            // single NORMAL libre
            $nm = $g[0];

            $s = $eligeSlot([$nm]);
            if ($s<0) {
              $remanentes[]=['numero_mesa'=>$nm,'fecha'=>null,'turno'=>null,'motivo'=>'single_sin_slot'];
              continue;
            }
            $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotCarga[$s]++;

            // Single normal -> no_agrupadas
            if(!$dryRun){
              $pdo->prepare("
                UPDATE mesas
                   SET fecha_mesa=?, id_turno=?
                 WHERE numero_mesa = ?
              ")->execute([$f,$t,$nm]);

              $stDelLeftByMesa->execute([':n'=>$nm]);
              $hora = horaSegunTurno($t);
              $stDupLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t]);
              if(!$stDupLeft->fetch()) $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t,':h'=>$hora]);
            } else {
              $creados[]=['accion'=>'preview_no_agrupada','fecha'=>$f,'turno'=>$t,'numero_mesa'=>$nm];
            }

            foreach(unionDNIs($dnisPorNumero,[$nm]) as $dni){ $dnisEnSlot["$f|$t"][$dni]=true; }
            foreach(($dnisPorNumero[$nm]??[]) as $dni){
              $curso = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
              if ($curso!==null) $agendaDniArea[$dni][$area][]=['slot'=>$slotIdxMap["$f|$t"] ?? 0,'curso'=>$curso,'nm'=>$nm];
            }

            $agendadas += 1;
            $slotsAsignados[]=['nums'=>[$nm],'fecha'=>$f,'turno'=>$t,'area'=>$area,'tipo'=>'single_no_agrupada'];
            $singlesNoAgrupadas[] = ['numero_mesa'=>$nm,'fecha'=>$f,'turno'=>$t,'origen'=>'libre'];
            continue;
          }

          // grupos de 2/3/4 normales
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
              UPDATE mesas
                 SET fecha_mesa=?, id_turno=?
               WHERE numero_mesa IN ($ph)
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
              $hora = horaSegunTurno($t);
              $stInsGroup->execute([
                ':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1,
                ':f'=>$f,':t'=>$t,':h'=>$hora
              ]);
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

      // Procesar especiales (7º y 3º técnico) SIEMPRE como singles en grupos
      foreach ($especiales as $nm) {
        $s = $eligeSlot([$nm]);
        if ($s<0) {
          $remanentes[]=['numero_mesa'=>$nm,'fecha'=>null,'turno'=>null,'motivo'=>'single_especial_sin_slot'];
          continue;
        }
        $f=$slots[$s]['fecha']; $t=$slots[$s]['turno']; $slotCarga[$s]++;

        if(!$dryRun){
          $pdo->prepare("
            UPDATE mesas
               SET fecha_mesa=?, id_turno=?
             WHERE numero_mesa = ?
          ")->execute([$f,$t,$nm]);
        }

        [$a1,$b1,$c1,$d1] = pad4([$nm]);
        $stDupGroup->execute([':f'=>$f,':t'=>$t,':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1]);
        if ($stDupGroup->fetch()) {
          $omitidosDup[]=['fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1,'motivo'=>'duplicado(single_especial)'];
        } else {
          if ($dryRun) {
            $creados[]=['accion'=>'preview','fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
          } else {
            $hora = horaSegunTurno($t);
            $stInsGroup->execute([
              ':a'=>$a1,':b'=>$b1,':c'=>$c1,':d'=>$d1,
              ':f'=>$f,':t'=>$t,':h'=>$hora
            ]);
            $creados[]=['accion'=>'creado','id_mesa_grupos'=>(int)$pdo->lastInsertId(),'fecha'=>$f,'turno'=>$t,'a'=>$a1,'b'=>$b1,'c'=>$c1,'d'=>$d1];
            $stDelLeftByMesa->execute([':n'=>$nm]);
          }
        }

        foreach(unionDNIs($dnisPorNumero,[$nm]) as $dni){ $dnisEnSlot["$f|$t"][$dni]=true; }
        foreach(($dnisPorNumero[$nm]??[]) as $dni){
          $curso = $cursoPorNumeroPorDni[$nm][$dni] ?? null;
          if ($curso!==null) $agendaDniArea[$dni][$area][]=['slot'=>$slotIdxMap["$f|$t"] ?? 0,'curso'=>$curso,'nm'=>$nm];
        }

        $agendadas += 1;
        $slotsAsignados[]=['nums'=>[$nm],'fecha'=>$f,'turno'=>$t,'area'=>$area,'tipo'=>'single_especial_agrupada'];
      }
    }
  }

  // --- SANIDAD: mover grupos de tamaño 1 a no_agrupadas SOLO si NO son mesas especiales 7º NI técnicas 3º ---
  if (!$dryRun) {
    $pdo->exec("
      INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, hora)
      SELECT
        CASE
          WHEN numero_mesa_1>0 THEN numero_mesa_1
          WHEN numero_mesa_2>0 THEN numero_mesa_2
          WHEN numero_mesa_3>0 THEN numero_mesa_3
          ELSE numero_mesa_4
        END AS numero_mesa,
        fecha_mesa,
        id_turno,
        hora
      FROM mesas_grupos g
      WHERE ( (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0) = 1 )
        AND EXISTS (
          SELECT 1
          FROM mesas m
          INNER JOIN previas p ON p.id_previa = m.id_previa
          WHERE m.numero_mesa = CASE
                                  WHEN g.numero_mesa_1>0 THEN g.numero_mesa_1
                                  WHEN g.numero_mesa_2>0 THEN g.numero_mesa_2
                                  WHEN g.numero_mesa_3>0 THEN g.numero_mesa_3
                                  ELSE g.numero_mesa_4
                                END
            AND NOT (
              p.materia_id_curso = 7
              OR (p.materia_id_curso = 3 AND p.id_materia IN (18,32,132))
            )
        )
    ");
    $pdo->exec("
      DELETE g
      FROM mesas_grupos g
      WHERE ( (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0) = 1 )
        AND EXISTS (
          SELECT 1
          FROM mesas m
          INNER JOIN previas p ON p.id_previa = m.id_previa
          WHERE m.numero_mesa = CASE
                                  WHEN g.numero_mesa_1>0 THEN g.numero_mesa_1
                                  WHEN g.numero_mesa_2>0 THEN g.numero_mesa_2
                                  WHEN g.numero_mesa_3>0 THEN g.numero_mesa_3
                                  ELSE g.numero_mesa_4
                                END
            AND NOT (
              p.materia_id_curso = 7
              OR (p.materia_id_curso = 3 AND p.id_materia IN (18,32,132))
            )
        )
    ");
  }

  // Limpieza global: si una mesa entra en un grupo, borrarla de no_agrupadas
  if(!$dryRun){ $pdo->exec("
    DELETE l
    FROM mesas_no_agrupadas l
    JOIN mesas_grupos g
      ON g.fecha_mesa = l.fecha_mesa AND g.id_turno = l.id_turno
    WHERE l.numero_mesa IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4)
  "); }
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
    'nota'=>'Nunca se generan grupos de tamaño 1, salvo las mesas especiales de 7º y las mesas técnicas de 3º (materias 18,32,132 exclusivas por alumno), que se guardan como grupos de 1 en mesas_grupos. Además, cada numero_mesa aparece como mucho una sola vez en mesas_no_agrupadas, y cada numero_mesa queda con un único día/turno asignado. Para 7º se unifica por (alumno+área) y para 3º técnico se unifica por alumno en las 3 materias técnicas, completando automáticamente el trío 18,32,132 con sus docentes según la división del alumno. El rango de fechas de agendado nunca incluye sábados ni domingos. También se respeta SIEMPRE docentes_bloques_no para TODOS los docentes de cada mesa. Ahora, cuando se crea un registro en mesas_grupos o mesas_no_agrupadas, la columna hora se setea automáticamente en 07:30:00 para turno 1 y 13:30:00 para turno 2.'
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  respond(false, 'Error en el servidor: '.$e->getMessage(), 500);
}