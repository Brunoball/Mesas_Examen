<?php
// backend/modules/mesas/obtener_mesas_no_agrupadas.php
// Muestra EXACTAMENTE lo que hay en mesas_no_agrupadas,
// y completa materia/tribunal vía joins suaves (si existen).

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE);

require_once __DIR__ . '/../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito' => true, 'data' => $payload]
       : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

try {
  // -------- Descubrir nombres de columnas (materias/docentes) --------
  $preferMateriaCols = ['nombre', 'materia', 'descripcion', 'nombre_materia', 'titulo', 'detalle'];
  $materiaCol = null;
  $qCols = $pdo->query("
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materias'
  ");
  $colsMaterias = $qCols ? array_map('strtolower', array_column($qCols->fetchAll(PDO::FETCH_ASSOC), 'COLUMN_NAME')) : [];
  foreach ($preferMateriaCols as $cand) { if (in_array(strtolower($cand), $colsMaterias, true)) { $materiaCol = $cand; break; } }
  $materiaExpr = $materiaCol ? "COALESCE(mat.`$materiaCol`, '')" : "''";

  $qColsD = $pdo->query("
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'docentes'
  ");
  $colsDoc = $qColsD ? array_map('strtolower', array_column($qColsD->fetchAll(PDO::FETCH_ASSOC), 'COLUMN_NAME')) : [];
  $docApellido = in_array('apellido', $colsDoc, true) ? 'apellido' : (in_array('apellidos', $colsDoc, true) ? 'apellidos' : null);
  $docNombre   = in_array('nombre', $colsDoc, true)   ? 'nombre'   : (in_array('nombres', $colsDoc, true)   ? 'nombres'   : null);
  $docFull     = in_array('apellido_nombre', $colsDoc, true) ? 'apellido_nombre' :
                 (in_array('docente', $colsDoc, true) ? 'docente' :
                 (in_array('nombre_completo', $colsDoc, true) ? 'nombre_completo' : null));
  if ($docApellido && $docNombre) {
    $docenteExpr = "
      TRIM(CONCAT(
        TRIM(COALESCE(d.`$docApellido`, '')),
        CASE WHEN COALESCE(d.`$docApellido`,'') <> '' AND COALESCE(d.`$docNombre`,'') <> '' THEN ' ' ELSE '' END,
        TRIM(COALESCE(d.`$docNombre`, ''))
      ))
    ";
  } elseif ($docFull) {
    $docenteExpr = "COALESCE(d.`$docFull`, '')";
  } elseif ($docNombre) {
    $docenteExpr = "COALESCE(d.`$docNombre`, '')";
  } else {
    $docenteExpr = "''";
  }

  // -------- Query: BASE mesas_no_agrupadas (sin prefijo de base) --------
  // Unimos a una sola fila representativa de cada numero_mesa en `mesas`
  // para poder traer id_catedra/id_docente y de ahí materia/tribunal.
  $sql = "
    WITH mesa_unica AS (
      SELECT numero_mesa, MIN(id_mesa) AS id_mesa
      FROM mesas
      GROUP BY numero_mesa
    )
    SELECT
      na.id                                           AS id,             -- id de mesas_no_agrupadas
      na.numero_mesa                                  AS numero_mesa,
      na.fecha_mesa                                   AS fecha,
      na.id_turno                                     AS id_turno,
      CASE na.id_turno
        WHEN 1 THEN 'Mañana'
        WHEN 2 THEN 'Tarde'
        WHEN 3 THEN 'Noche'
        ELSE ''
      END                                             AS turno,
      c.id_materia                                    AS id_materia,
      {$materiaExpr}                                  AS materia,
      {$docenteExpr}                                  AS tribunal
    FROM mesas_no_agrupadas na
    LEFT JOIN mesa_unica mu   ON mu.numero_mesa = na.numero_mesa
    LEFT JOIN mesas m         ON m.id_mesa      = mu.id_mesa
    LEFT JOIN catedras  c     ON c.id_catedra   = m.id_catedra
    LEFT JOIN materias  mat   ON mat.id_materia = c.id_materia
    LEFT JOIN docentes  d     ON d.id_docente   = m.id_docente
    ORDER BY na.fecha_mesa ASC, na.id_turno ASC, na.numero_mesa ASC
  ";

  $st = $pdo->query($sql);
  if (!$st) {
    $err = $pdo->errorInfo();
    throw new RuntimeException('Error de SQL: ' . ($err[2] ?? 'desconocido'));
  }

  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // Normalizar tipos/campos a lo que espera el frontend
  $data = array_map(function(array $r): array {
    return [
      'id'          => isset($r['id']) ? (int)$r['id'] : null,
      'numero_mesa' => isset($r['numero_mesa']) ? (int)$r['numero_mesa'] : null,
      'fecha'       => $r['fecha'] ?? null,
      'id_turno'    => isset($r['id_turno']) ? (int)$r['id_turno'] : null,
      'turno'       => $r['turno'] ?? '',
      'id_materia'  => isset($r['id_materia']) ? (int)$r['id_materia'] : null,
      'materia'     => $r['materia'] ?? '',
      'tribunal'    => $r['tribunal'] ?? '',
    ];
  }, $rows);

  respond(true, $data, 200);

} catch (Throwable $e) {
  respond(false, 'Error interno: ' . $e->getMessage(), 500);
}
