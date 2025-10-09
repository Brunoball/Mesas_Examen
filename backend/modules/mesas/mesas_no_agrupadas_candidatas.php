<?php
// backend/modules/mesas/mesas_no_agrupadas_candidatas.php
// -----------------------------------------------------------------------------
// Devuelve las mesas "no agrupadas" como candidatas para agregar a un grupo,
// incluyendo metadata (materia, docentes) y validación de PRIORIDAD=1:
//
// Regla: Para agregar una NO-AGRUPADA X al grupo de la mesa actual (fecha_objetivo),
// NINGÚN alumno (dni) de X debe tener OTRA mesa con prioridad=1 con fecha_mesa > fecha_objetivo.
// (Si su p1 es antes o igual a fecha_objetivo => OK; si es después => No elegible)
//
// Entrada (POST JSON):
//   {
//     "fecha_objetivo": "YYYY-MM-DD" | null,   // (recomendado)
//     "id_turno_objetivo": 1 | null,           // (no se usa en regla, pero se deja por simetría)
//     "numero_mesa_actual": 123                // para excluirla si estuviera "no agrupada" (edge)
//   }
//
// Salida: { exito:true, data:[{ numero_mesa, materia, docentes[], alumnos[], elegible, motivo? }, ... ] }
//
// -----------------------------------------------------------------------------

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

function respond_json(bool $ok, $payload = null, int $status = 200): void {
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito' => true, 'data' => $payload]
       : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_json(false, 'Método no permitido.', 405);
  if (!isset($pdo) || !($pdo instanceof PDO)) respond_json(false, 'Conexión PDO no disponible.', 500);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $raw = file_get_contents('php://input') ?: '';
  $in  = json_decode($raw, true);
  if (!is_array($in)) respond_json(false, 'Body JSON inválido.', 400);

  $fecha_objetivo   = isset($in['fecha_objetivo']) ? trim((string)$in['fecha_objetivo']) : '';
  $id_turno_obj     = isset($in['id_turno_objetivo']) ? (int)$in['id_turno_objetivo'] : null;
  $numero_actual    = isset($in['numero_mesa_actual']) ? (int)$in['numero_mesa_actual'] : 0;

  // Traer todas las no-agrupadas actuales
  $sqlNoAgr = "
    SELECT na.numero_mesa, na.fecha_mesa, na.id_turno
    FROM mesas_no_agrupadas na
    ORDER BY na.fecha_mesa ASC, na.id_turno ASC, na.numero_mesa ASC
  ";
  $st = $pdo->query($sqlNoAgr);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);
  if (!$rows) respond_json(true, []);

  // Pre-arma detalle por numero_mesa
  $det = []; // numero => info base
  foreach ($rows as $r) {
    $nm = (int)$r['numero_mesa'];
    if ($nm === 0) continue;
    if ($numero_actual > 0 && $nm === $numero_actual) continue; // evitar el actual si está en no_agrupadas
    $det[$nm] = [
      'numero_mesa' => $nm,
      'fecha'       => (string)$r['fecha_mesa'],
      'id_turno'    => (int)$r['id_turno'],
      'materia'     => '',
      'docentes'    => [],
      'alumnos'     => [],
      'elegible'    => true,
      'motivo'      => null,
    ];
  }
  if (!$det) respond_json(true, []);

  $nums = array_keys($det);
  $ph   = implode(',', array_fill(0, count($nums), '?'));

  // Materia y docentes (desde mesas/catedras/materias/docentes)
  $sqlCab = "
    SELECT m.numero_mesa,
           MIN(mat.materia) AS materia,
           GROUP_CONCAT(DISTINCT d.docente SEPARATOR '||') AS docentes_concat
    FROM mesas m
      LEFT JOIN catedras  c   ON c.id_catedra   = m.id_catedra
      LEFT JOIN materias  mat ON mat.id_materia = c.id_materia
      LEFT JOIN docentes  d   ON d.id_docente   = m.id_docente
    WHERE m.numero_mesa IN ($ph)
    GROUP BY m.numero_mesa
  ";
  $stCab = $pdo->prepare($sqlCab);
  $stCab->execute($nums);
  while ($r = $stCab->fetch(PDO::FETCH_ASSOC)) {
    $nm = (int)$r['numero_mesa'];
    if (!isset($det[$nm])) continue;
    $det[$nm]['materia'] = (string)($r['materia'] ?? '');
    $docs = [];
    if (!empty($r['docentes_concat'])) {
      $seen = [];
      foreach (explode('||', (string)$r['docentes_concat']) as $dname) {
        $k = mb_strtolower(trim((string)$dname));
        if ($k === '' || isset($seen[$k])) continue;
        $seen[$k] = true;
        $docs[] = $dname;
      }
    }
    $det[$nm]['docentes'] = $docs;
  }

  // Alumnos (desde previas)
  $sqlAlu = "
    SELECT m.numero_mesa, p.alumno, p.dni
    FROM mesas m
      INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE m.numero_mesa IN ($ph)
    ORDER BY m.numero_mesa ASC, p.alumno ASC
  ";
  $stAlu = $pdo->prepare($sqlAlu);
  $stAlu->execute($nums);
  $dnisPorNumero = []; // nm => dnis[]
  while ($r = $stAlu->fetch(PDO::FETCH_ASSOC)) {
    $nm  = (int)$r['numero_mesa'];
    $dni = (string)($r['dni'] ?? '');
    $al  = (string)($r['alumno'] ?? '');
    if (!isset($det[$nm])) continue;
    $det[$nm]['alumnos'][] = $al;
    if ($dni !== '') $dnisPorNumero[$nm][] = $dni;
  }

  // Validación PRIORIDAD=1 vs fecha_objetivo
  if ($fecha_objetivo !== '') {
    // Buscar mesas con prioridad=1 por DNI cuyo fecha_mesa sea > fecha_objetivo
    // para cada candidata.
    $sqlP1 = "
      SELECT DISTINCT p.dni, m.fecha_mesa
      FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
      WHERE p.dni IN (%s) AND m.prioridad = 1 AND m.fecha_mesa IS NOT NULL
    ";

    foreach ($dnisPorNumero as $nm => $dnis) {
      $dnis = array_values(array_unique(array_filter($dnis, fn($x) => $x !== '')));
      if (!$dnis) continue;

      $phDnis = implode(',', array_fill(0, count($dnis), '?'));
      $q = sprintf($sqlP1, $phDnis);
      $stP1 = $pdo->prepare($q);
      $stP1->execute($dnis);

      while ($r = $stP1->fetch(PDO::FETCH_ASSOC)) {
        $fechaP1 = (string)($r['fecha_mesa'] ?? '');
        if ($fechaP1 !== '' && $fechaP1 > $fecha_objetivo) {
          // Hay una p1 posterior a la fecha objetivo → NO elegible
          $det[$nm]['elegible'] = false;
          $det[$nm]['motivo']   = "Tiene prioridad 1 posterior a la fecha objetivo";
          // No hace falta seguir recorriendo para este número
          break;
        }
      }
    }
  }

  // Salida ordenada por elegibles primero
  $out = array_values($det);
  usort($out, function($a, $b) {
    if ($a['elegible'] === $b['elegible']) return $a['numero_mesa'] <=> $b['numero_mesa'];
    return $a['elegible'] ? -1 : 1;
  });

  respond_json(true, $out);

} catch (Throwable $e) {
  error_log('[mesas_no_agrupadas_candidatas] ' . $e->getMessage());
  respond_json(false, 'Error: ' . $e->getMessage(), 500);
}
