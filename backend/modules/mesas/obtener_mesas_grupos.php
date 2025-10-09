<?php
// backend/modules/mesas/obtener_mesas_grupos.php
// -----------------------------------------------------------------------------
// Devuelve UNA FILA POR GRUPO (mesas_grupos).
// Campos devueltos:
//   - id_grupo
//   - numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
//   - fecha (g.fecha_mesa), id_turno, turno
//   - id_materia, materia  (representativo por grupo; si difieren, se usa el MIN())
//   - id_area               (representativo por grupo vía materias.id_area; MIN() si difieren)
//   - tribunal              (array con docentes únicos presentes en el grupo)
//
// Filtros GET opcionales:
//   - id_turno=1|2
//   - fecha_inicio=YYYY-MM-DD
//   - fecha_fin=YYYY-MM-DD
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito' => true,  'data' => $payload]
       : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    respond(false, 'Conexión PDO no disponible.', 500);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // -------- Filtros --------
  $id_turno = isset($_GET['id_turno']) ? (int)$_GET['id_turno'] : 0;
  $f_ini    = isset($_GET['fecha_inicio']) ? trim((string)$_GET['fecha_inicio']) : '';
  $f_fin    = isset($_GET['fecha_fin'])    ? trim((string)$_GET['fecha_fin'])    : '';

  $where  = [];
  $params = [];

  if ($id_turno > 0) { $where[] = 'g.id_turno = :t'; $params[':t'] = $id_turno; }
  if ($f_ini !== '' && $f_fin !== '') {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f_ini) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $f_fin)) {
      respond(false, 'Formato de fecha inválido. Use YYYY-MM-DD.', 400);
    }
    $where[] = 'g.fecha_mesa BETWEEN :fini AND :ffin';
    $params[':fini'] = $f_ini;
    $params[':ffin'] = $f_fin;
  } elseif ($f_ini !== '') {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f_ini)) respond(false, 'Formato de fecha_inicio inválido.', 400);
    $where[] = 'g.fecha_mesa >= :fini'; $params[':fini'] = $f_ini;
  } elseif ($f_fin !== '') {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f_fin)) respond(false, 'Formato de fecha_fin inválido.', 400);
    $where[] = 'g.fecha_mesa <= :ffin'; $params[':ffin'] = $f_fin;
  }

  $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

  // ---------------------------------------------------------------------------
  // Nota:
  // - Los JOIN con mesas m1..m4 se hacen solo si el numero_mesa_N > 0
  // - Se obtiene materia/área vía catedras -> materias (consistente con tu backend)
  // - Docente se obtiene de mesas.id_docente
  // - turnos viene de mesas_examen.turnos (si no existiera, podés quitar el LEFT JOIN y el campo "turno")
  // ---------------------------------------------------------------------------

  $sql = "
    SELECT
      g.id_mesa_grupos                                       AS id_grupo,
      g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4,
      g.fecha_mesa,
      g.id_turno,
      tu.turno                                               AS turno,

      /* Materia representativa (mínima si difieren) */
      COALESCE(
        MIN(mat1.id_materia),
        MIN(mat2.id_materia),
        MIN(mat3.id_materia),
        MIN(mat4.id_materia)
      ) AS id_materia,
      COALESCE(
        MIN(mat1.materia),
        MIN(mat2.materia),
        MIN(mat3.materia),
        MIN(mat4.materia)
      ) AS materia,

      /* Área representativa (mínima si difieren) */
      COALESCE(
        MIN(mat1.id_area),
        MIN(mat2.id_area),
        MIN(mat3.id_area),
        MIN(mat4.id_area)
      ) AS id_area,

      /* Docentes presentes (solo presidente actual: mesas.id_docente) */
      MIN(d1.docente) AS d1,
      MIN(d2.docente) AS d2,
      MIN(d3.docente) AS d3,
      MIN(d4.docente) AS d4

    FROM mesas_examen.mesas_grupos g
      LEFT JOIN mesas_examen.turnos tu ON tu.id_turno = g.id_turno

      /* Mesa 1 */
      LEFT JOIN mesas_examen.mesas m1
        ON (g.numero_mesa_1 > 0 AND m1.numero_mesa = g.numero_mesa_1 AND m1.fecha_mesa = g.fecha_mesa AND m1.id_turno = g.id_turno)
      LEFT JOIN mesas_examen.catedras c1 ON c1.id_catedra = m1.id_catedra
      LEFT JOIN mesas_examen.materias mat1 ON mat1.id_materia = c1.id_materia
      LEFT JOIN mesas_examen.docentes d1 ON d1.id_docente = m1.id_docente

      /* Mesa 2 */
      LEFT JOIN mesas_examen.mesas m2
        ON (g.numero_mesa_2 > 0 AND m2.numero_mesa = g.numero_mesa_2 AND m2.fecha_mesa = g.fecha_mesa AND m2.id_turno = g.id_turno)
      LEFT JOIN mesas_examen.catedras c2 ON c2.id_catedra = m2.id_catedra
      LEFT JOIN mesas_examen.materias mat2 ON mat2.id_materia = c2.id_materia
      LEFT JOIN mesas_examen.docentes d2 ON d2.id_docente = m2.id_docente

      /* Mesa 3 */
      LEFT JOIN mesas_examen.mesas m3
        ON (g.numero_mesa_3 > 0 AND m3.numero_mesa = g.numero_mesa_3 AND m3.fecha_mesa = g.fecha_mesa AND m3.id_turno = g.id_turno)
      LEFT JOIN mesas_examen.catedras c3 ON c3.id_catedra = m3.id_catedra
      LEFT JOIN mesas_examen.materias mat3 ON mat3.id_materia = c3.id_materia
      LEFT JOIN mesas_examen.docentes d3 ON d3.id_docente = m3.id_docente

      /* Mesa 4 (si existiera) */
      LEFT JOIN mesas_examen.mesas m4
        ON (g.numero_mesa_4 > 0 AND m4.numero_mesa = g.numero_mesa_4 AND m4.fecha_mesa = g.fecha_mesa AND m4.id_turno = g.id_turno)
      LEFT JOIN mesas_examen.catedras c4 ON c4.id_catedra = m4.id_catedra
      LEFT JOIN mesas_examen.materias mat4 ON mat4.id_materia = c4.id_materia
      LEFT JOIN mesas_examen.docentes d4 ON d4.id_docente = m4.id_docente

    $whereSql
    GROUP BY g.id_mesa_grupos
    ORDER BY g.fecha_mesa ASC, g.id_turno ASC, g.id_mesa_grupos ASC
  ";

  $st = $pdo->prepare($sql);
  $st->execute($params);

  $rows = [];
  while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
    // Unificar docentes (únicos - preservando orden aproximado mesa1..mesa4)
    $docentes = array_values(array_filter([
      $r['d1'] ?? null,
      $r['d2'] ?? null,
      $r['d3'] ?? null,
      $r['d4'] ?? null,
    ]));

    $seen = [];
    $tribunal = [];
    foreach ($docentes as $d) {
      $k = trim(mb_strtolower((string)$d));
      if ($k === '' || isset($seen[$k])) continue;
      $seen[$k] = true;
      $tribunal[] = $d;
    }

    $rows[] = [
      'id_grupo'       => (int)$r['id_grupo'],
      'numero_mesa_1'  => isset($r['numero_mesa_1']) ? (int)$r['numero_mesa_1'] : 0,
      'numero_mesa_2'  => isset($r['numero_mesa_2']) ? (int)$r['numero_mesa_2'] : 0,
      'numero_mesa_3'  => isset($r['numero_mesa_3']) ? (int)$r['numero_mesa_3'] : 0,
      'numero_mesa_4'  => isset($r['numero_mesa_4']) ? (int)$r['numero_mesa_4'] : 0,
      'fecha'          => (string)($r['fecha_mesa'] ?? ''),
      'id_turno'       => isset($r['id_turno']) ? (int)$r['id_turno'] : null,
      'turno'          => (string)($r['turno'] ?? ''),
      'id_materia'     => isset($r['id_materia']) ? (int)$r['id_materia'] : null,
      'materia'        => (string)($r['materia'] ?? ''),
      'id_area'        => isset($r['id_area']) ? (int)$r['id_area'] : null,
      'tribunal'       => $tribunal,
    ];
  }

  respond(true, $rows);

} catch (Throwable $e) {
  error_log('[obtener_mesas_grupos] ' . $e->getMessage());
  respond(false, 'Error: ' . $e->getMessage(), 500);
}
