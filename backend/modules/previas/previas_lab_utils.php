<?php
// backend/modules/previas/previas_lab_utils.php
declare(strict_types=1);

ini_set('display_errors','0');
error_reporting(E_ALL);

// desde /modules/previas → /config
require_once __DIR__ . '/../../config/db.php';

function json_response(bool $ok, $payload = null, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(
    $ok
      ? ['exito'=>true, 'data'=>$payload]
      : ['exito'=>false, 'mensaje'=> (is_string($payload)?$payload:'Error')]
  );
  exit;
}

/** Crea tabla de pruebas clonando estructura de `previas` si no existe */
function ensure_previas_lab(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS previas_lab LIKE previas");
}

/** TRUNCATE pruebas */
function truncate_previas_lab(PDO $pdo): void {
  $pdo->exec("TRUNCATE TABLE previas_lab");
}

/**
 * Inserta/actualiza en bloque dentro de una transacción (UPSERT).
 * Espera SOLO estos campos por fila (sin fecha_carga):
 * dni, alumno, cursando_id_curso, cursando_id_division,
 * id_materia, materia_id_curso, materia_id_division,
 * id_condicion, inscripcion, anio
 * La fecha_carga se setea como CURDATE() desde la DB (insert y update).
 *
 * IMPORTANTE:
 *  - Rechaza filas con id_materia <= 0 (obligatorio para no colisionar unique (dni,id_materia,anio)).
 *  - Inserta en el mismo orden que llegan en $rows.
 */
function bulk_insert_previas_lab(PDO $pdo, array $rows): array {
  if (empty($rows)) return ['insertados'=>0, 'actualizados'=>0, 'sin_cambios'=>0, 'errores'=>[]];

  $cols = [
    'dni','alumno',
    'cursando_id_curso','cursando_id_division',
    'id_materia','materia_id_curso','materia_id_division',
    'id_condicion','inscripcion','anio'
  ];

  $validados = [];
  $errores = [];

  foreach ($rows as $i => $r) {
    $f = [];
    foreach ($cols as $c) {
      if (!array_key_exists($c, $r)) {
        $errores[] = "Fila ".($i+1).": falta columna `$c`";
        continue 2;
      }
      $f[$c] = $r[$c];
    }

    // Normalizar tipos:
    $f['dni']                   = (string)($f['dni'] ?? '');
    $f['alumno']                = (string)($f['alumno'] ?? '');
    $f['cursando_id_curso']     = (int)$f['cursando_id_curso'];
    $f['cursando_id_division']  = (int)$f['cursando_id_division'];
    // ⚠️ OBLIGATORIO y > 0
    $f['id_materia']            = (int)$f['id_materia'];
    $f['materia_id_curso']      = (int)$f['materia_id_curso'];
    $f['materia_id_division']   = (int)$f['materia_id_division'];
    $f['id_condicion']          = (int)$f['id_condicion'];
    $f['inscripcion']           = isset($f['inscripcion']) && $f['inscripcion'] !== '' ? (int)$f['inscripcion'] : 0;
    $f['anio']                  = (int)$f['anio'];

    // Reglas mínimas:
    if ($f['dni']==='' || $f['alumno']==='') {
      $errores[] = "Fila ".($i+1).": dni y alumno son obligatorios";
      continue;
    }
    if ($f['id_materia'] <= 0) {
      $errores[] = "Fila ".($i+1).": id_materia es obligatorio y debe ser > 0";
      continue;
    }
    if ($f['anio'] < 2000 || $f['anio'] > 2100) {
      $errores[] = "Fila ".($i+1).": anio inválido";
      continue;
    }
    $validados[] = $f;
  }

  if (empty($validados)) return ['insertados'=>0, 'actualizados'=>0, 'sin_cambios'=>0, 'errores'=>$errores];

  $pdo->beginTransaction();
  try {
    /**
     * ON DUPLICATE KEY UPDATE:
     * - No se cambia la clave única (p.ej. UNIQUE(dni,id_materia,anio) si existe).
     * - Actualiza el resto y fecha_carga = CURDATE().
     * - Inserta en el mismo orden de $validados.
     */
    $sql = "INSERT INTO previas_lab
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
        fecha_carga = CURDATE()";

    $st = $pdo->prepare($sql);

    $insertados = 0;
    $actualizados = 0;
    $sinCambios = 0;

    foreach ($validados as $f) {
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
      if ($rc === 1)      $insertados++;
      else if ($rc === 2) $actualizados++;
      else                $sinCambios++;
    }

    $pdo->commit();
    return [
      'insertados'   => $insertados,
      'actualizados' => $actualizados,
      'sin_cambios'  => $sinCambios,
      'errores'      => $errores
    ];
  } catch (Throwable $e) {
    $pdo->rollBack();
    return [
      'insertados'=>0,
      'actualizados'=>0,
      'sin_cambios'=>0,
      'errores'=>array_merge($errores, ["DB: ".$e->getMessage()])
    ];
  }
}
