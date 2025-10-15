<?php
// backend/modules/previas/previas_lab_utils.php
declare(strict_types=1);

ini_set('display_errors','0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../config/db.php';

function json_response(bool $ok, $payload = null, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(
    $ok ? ['exito'=>true, 'data'=>$payload]
       : ['exito'=>false, 'mensaje'=> (is_string($payload)?$payload:'Error')]
  );
  exit;
}

function ensure_previas_lab(PDO $pdo): void {
  $pdo->query('SELECT 1 FROM previas LIMIT 0');
  $pdo->query('SELECT 1 FROM mesas LIMIT 0');
  $pdo->query('SELECT 1 FROM mesas_grupos LIMIT 0');
}

function wipe_all_previas_mesas(PDO $pdo): array {
  $totalPrevias      = (int)$pdo->query("SELECT COUNT(*) FROM previas")->fetchColumn();
  $totalMesas        = (int)$pdo->query("SELECT COUNT(*) FROM mesas")->fetchColumn();
  $totalMesasGrupos  = (int)$pdo->query("SELECT COUNT(*) FROM mesas_grupos")->fetchColumn();

  $deletedMesas = 0; $deletedGrupos = 0; $deletedPrevias = 0;

  try {
    $pdo->beginTransaction();
    $res = $pdo->exec("DELETE FROM mesas");         $deletedMesas   = ($res === false) ? 0 : (int)$res;
    $res = $pdo->exec("DELETE FROM mesas_grupos");  $deletedGrupos  = ($res === false) ? 0 : (int)$res;
    $res = $pdo->exec("DELETE FROM previas");       $deletedPrevias = ($res === false) ? 0 : (int)$res;
    $pdo->commit();

    try { $pdo->exec("ALTER TABLE mesas AUTO_INCREMENT = 1"); } catch (\Throwable $__) {}
    try { $pdo->exec("ALTER TABLE mesas_grupos AUTO_INCREMENT = 1"); } catch (\Throwable $__) {}
    try { $pdo->exec("ALTER TABLE previas AUTO_INCREMENT = 1"); } catch (\Throwable $__) {}

    return [
      'previas_antes'         => $totalPrevias,
      'mesas_antes'           => $totalMesas,
      'mesas_grupos_antes'    => $totalMesasGrupos,
      'mesas_borradas'        => $deletedMesas,
      'mesas_grupos_borrados' => $deletedGrupos,
      'previas_borradas'      => $deletedPrevias,
      'mensaje'               => 'Limpieza completa: mesas → mesas_grupos → previas. AUTO_INCREMENT reseteado.'
    ];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

/**
 * UPSERT por lote en `previas`.
 * Si hay colisión de UNIQUE (1062), la reporta con una “clave natural” para depurar.
 */
function bulk_insert_previas_lab(PDO $pdo, array $rows): array {
  if (empty($rows)) return ['insertados'=>0, 'actualizados'=>0, 'sin_cambios'=>0, 'errores'=>[]];

  $cols = [
    'dni','alumno',
    'cursando_id_curso','cursando_id_division',
    'id_materia','materia_id_curso','materia_id_division',
    'id_condicion','inscripcion','anio'
  ];

  $sql = "INSERT INTO previas
    (dni, alumno, cursando_id_curso, cursando_id_division, id_materia, materia_id_curso, materia_id_division, id_condicion, inscripcion, anio, fecha_carga)
    VALUES
    (:dni, :alumno, :cursando_id_curso, :cursando_id_division, :id_materia, :materia_id_curso, :materia_id_division, :id_condicion, :inscripcion, :anio, CURDATE())
    ON DUPLICATE KEY UPDATE
      alumno = VALUES(alumno),
      cursando_id_curso = VALUES(cursando_id_curso),
      cursando_id_division = VALUES(cursando_id_division),
      materia_id_curso = VALUES(materia_id_curso),
      materia_id_division = VALUES(materia_id_division),
      id_condicion = VALUES(id_condicion),
      inscripcion = VALUES(inscripcion),
      anio = VALUES(anio),
      fecha_carga = CURDATE()";

  $st = $pdo->prepare($sql);

  $insertados = 0; $actualizados = 0; $sinCambios = 0; $errores = [];

  $toInt = static function($v): int {
    if (is_int($v)) return $v;
    if ($v === null || $v === '') return 0;
    $n = preg_replace('/[^\d\-]/', '', (string)$v);
    if ($n === '' || $n === '-' || $n === '+') return 0;
    return (int)$n;
  };

  foreach ($rows as $i => $r) {
    $f = [];
    foreach ($cols as $c) { $f[$c] = $r[$c] ?? ''; }

    $f['cursando_id_curso']    = $toInt($f['cursando_id_curso']);
    $f['cursando_id_division'] = $toInt($f['cursando_id_division']);
    $f['id_materia']           = $toInt($f['id_materia']);
    $f['materia_id_curso']     = $toInt($f['materia_id_curso']);
    $f['materia_id_division']  = $toInt($f['materia_id_division']);
    $f['id_condicion']         = $toInt($f['id_condicion']);
    $f['inscripcion']          = $toInt($f['inscripcion']);
    $f['anio']                 = $toInt($f['anio']);
    $f['dni']                  = (string)($f['dni'] ?? '');
    $f['alumno']               = (string)($f['alumno'] ?? '');

    try {
      $st->execute([
        ':dni'                  => $f['dni'],
        ':alumno'               => $f['alumno'],
        ':cursando_id_curso'    => $f['cursando_id_curso'],
        ':cursando_id_division' => $f['cursando_id_division'],
        ':id_materia'           => $f['id_materia'],
        ':materia_id_curso'     => $f['materia_id_curso'],
        ':materia_id_division'  => $f['materia_id_division'],
        ':id_condicion'         => $f['id_condicion'],
        ':inscripcion'          => $f['inscripcion'],
        ':anio'                 => $f['anio'],
      ]);

      $rc = (int)$st->rowCount();
      if     ($rc === 1) $insertados++;
      elseif ($rc === 2) $actualizados++;
      else               $sinCambios++;
    } catch (\PDOException $e) {
      // 1062 = Duplicate entry for key '...'
      if ((int)$e->errorInfo[1] === 1062) {
        $errores[] =
          "Colisión UNIQUE (posible pisado/UPD) en fila ".($i+1).
          " — clave natural: dni={$f['dni']}, id_materia={$f['id_materia']}, anio={$f['anio']}, ".
          "curs_div={$f['cursando_id_division']}, mat_div={$f['materia_id_division']}";
      } else {
        $errores[] = "Fila ".($i+1).": ".$e->getMessage();
      }
      // seguimos con la siguiente fila
    } catch (Throwable $e) {
      $errores[] = "Fila ".($i+1).": ".$e->getMessage();
    }
  }

  return [
    'insertados'   => $insertados,
    'actualizados' => $actualizados,
    'sin_cambios'  => $sinCambios,
    'errores'      => $errores,
  ];
}
