<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

ob_start();
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE);

require_once __DIR__ . '/../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
  if (ob_get_length()) { @ob_clean(); }
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito' => true, 'data' => $payload]
       : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

function validarFecha(?string $s): bool {
  if ($s === null || $s === '') return false;
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
  [$y,$m,$d] = explode('-', $s);
  return checkdate((int)$m, (int)$d, (int)$y);
}

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) respond(false, 'Conexión PDO no disponible', 500);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // Leer filtros (JSON o form)
  $raw  = file_get_contents('php://input') ?: '';
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = [];

  $fecha_mesa = (string)($body['fecha_mesa'] ?? $_POST['fecha_mesa'] ?? $_GET['fecha_mesa'] ?? '');
  $id_turno   = $body['id_turno'] ?? $_POST['id_turno'] ?? $_GET['id_turno'] ?? '';

  $where  = [];
  $params = [];

  if ($fecha_mesa !== '') {
    if (!validarFecha($fecha_mesa)) respond(false, 'fecha_mesa debe ser YYYY-MM-DD', 400);
    $where[] = 'm.fecha_mesa = :fecha_mesa';
    $params[':fecha_mesa'] = $fecha_mesa;
  }
  if ($id_turno !== '' && $id_turno !== null) {
    if (!is_numeric($id_turno)) respond(false, 'id_turno debe ser numérico', 400);
    $where[] = 'm.id_turno = :id_turno';
    $params[':id_turno'] = (int)$id_turno;
  }

  $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

  // Obtener ids + numeros de mesas afectadas
  if ($whereSql === '') {
    $stIds = $pdo->query("SELECT m.id_mesa, m.numero_mesa FROM mesas m");
  } else {
    $stIds = $pdo->prepare("SELECT m.id_mesa, m.numero_mesa FROM mesas m {$whereSql}");
    $stIds->execute($params);
  }
  $rows = $stIds ? $stIds->fetchAll(PDO::FETCH_ASSOC) : [];

  $ids = [];
  $numerosSet = [];
  foreach ($rows as $r) {
    $idv = (int)$r['id_mesa'];
    if ($idv > 0) $ids[] = $idv;
    if (isset($r['numero_mesa']) && $r['numero_mesa'] !== null && $r['numero_mesa'] !== '') {
      $nm = (int)$r['numero_mesa'];
      if ($nm > 0) $numerosSet[$nm] = true; // set
    }
  }
  $numeros = array_map('intval', array_keys($numerosSet));

  if (!$ids) {
    $restantes = (int)($pdo->query("SELECT COUNT(*) FROM mesas")->fetchColumn() ?: 0);
    respond(true, [
      'mensaje'        => 'No hay mesas que coincidan con los filtros.',
      'afectadas_prev' => 0,
      'borrados'       => [
        'mesas_previas'            => 0,
        'mesas'                    => 0,
        'mesas_grupos'             => 0,
        'grupos_inconsistentes'    => 0,
        'mesas_no_agrupadas'       => 0,
        'no_agrupadas_inconsist'   => 0,
      ],
      'filtros'        => [
        'fecha_mesa' => $fecha_mesa !== '' ? $fecha_mesa : null,
        'id_turno'   => ($id_turno !== '' && $id_turno !== null) ? (int)$id_turno : null,
      ],
      'restantes'      => $restantes,
      'id_reiniciado'  => false,
    ]);
  }

  // TX best-effort
  $tx = false;
  try { $tx = $pdo->beginTransaction(); } catch (Throwable $e) { $tx = false; }

  // 1) hijos: mesas_previas
  $ph = implode(',', array_fill(0, count($ids), '?'));
  $deleted_vinc = 0;
  try {
    $stv = $pdo->prepare("DELETE FROM mesas_previas WHERE id_mesa IN ($ph)");
    $stv->execute($ids);
    $deleted_vinc = (int)$stv->rowCount();
  } catch (Throwable $e) {
    $deleted_vinc = 0;
  }

  // 2) mesas
  $stm = $pdo->prepare("DELETE FROM mesas WHERE id_mesa IN ($ph)");
  $stm->execute($ids);
  $deleted_mesas = (int)$stm->rowCount();

  // 3) limpiar grupos por numeros afectados
  $deleted_grupos = 0;
  if (!empty($numeros)) {
    $chunkSize = 500;
    for ($i=0; $i<count($numeros); $i += $chunkSize) {
      $slice = array_slice($numeros, $i, $chunkSize);
      $phn = implode(',', array_fill(0, count($slice), '?'));
      $sql = "
        DELETE FROM mesas_grupos
        WHERE numero_mesa_1 IN ($phn)
           OR numero_mesa_2 IN ($phn)
           OR numero_mesa_3 IN ($phn)
      ";
      $stg = $pdo->prepare($sql);
      $stg->execute(array_merge($slice, $slice, $slice));
      $deleted_grupos += (int)$stg->rowCount();
    }
  }

  // 3.b) limpiar mesas_no_agrupadas por numeros afectados
  $deleted_no_agrupadas = 0;
  if (!empty($numeros)) {
    $chunkSize = 500;
    for ($i=0; $i<count($numeros); $i += $chunkSize) {
      $slice = array_slice($numeros, $i, $chunkSize);
      $phn = implode(',', array_fill(0, count($slice), '?'));
      $sqla = "DELETE FROM mesas_no_agrupadas WHERE numero_mesa IN ($phn)";
      $sta = $pdo->prepare($sqla);
      $sta->execute($slice);
      $deleted_no_agrupadas += (int)$sta->rowCount();
    }
  }

  // 4) limpieza extra de seguridad (inconsistencias)
  $deleted_grupos_incons = 0;
  try {
    $deleted_grupos_incons += (int)$pdo->exec("
      DELETE mg FROM mesas_grupos mg
      LEFT JOIN mesas m1 ON m1.numero_mesa = mg.numero_mesa_1
      WHERE m1.numero_mesa IS NULL
    ");
    $deleted_grupos_incons += (int)$pdo->exec("
      DELETE mg FROM mesas_grupos mg
      LEFT JOIN mesas m2 ON m2.numero_mesa = mg.numero_mesa_2
      WHERE m2.numero_mesa IS NULL
    ");
    $deleted_grupos_incons += (int)$pdo->exec("
      DELETE mg FROM mesas_grupos mg
      LEFT JOIN mesas m3 ON m3.numero_mesa = mg.numero_mesa_3
      WHERE m3.numero_mesa IS NULL
    ");
  } catch (Throwable $e) { /* ignorar */ }

  // 4.b) limpieza extra de seguridad en mesas_no_agrupadas
  $deleted_no_agrupadas_incons = 0;
  try {
    $deleted_no_agrupadas_incons += (int)$pdo->exec("
      DELETE mna FROM mesas_no_agrupadas mna
      LEFT JOIN mesas m ON m.numero_mesa = mna.numero_mesa
      WHERE m.numero_mesa IS NULL
    ");
  } catch (Throwable $e) { /* ignorar */ }

  // 5) reset y TRUNCATE si ya no quedan mesas
  $restantes = (int)($pdo->query("SELECT COUNT(*) FROM mesas")->fetchColumn() ?: 0);
  $reiniciado = false;
  if ($restantes === 0) {
    try {
      $pdo->exec("ALTER TABLE mesas AUTO_INCREMENT = 1");
      $pdo->exec("TRUNCATE TABLE mesas_grupos");
      $pdo->exec("TRUNCATE TABLE mesas_no_agrupadas");
      $reiniciado = true;
    } catch (Throwable $e) { $reiniciado = false; }
  }

  if ($tx && $pdo->inTransaction()) {
    try { $pdo->commit(); } catch (Throwable $e) { /* ignorar */ }
  }

  respond(true, [
    'mensaje'        => $whereSql ? 'Mesas eliminadas con filtros.' : 'Se eliminaron todas las mesas.',
    'afectadas_prev' => count($ids),
    'borrados'       => [
      'mesas_previas'            => $deleted_vinc,
      'mesas'                    => $deleted_mesas,
      'mesas_grupos'             => $deleted_grupos,
      'grupos_inconsistentes'    => $deleted_grupos_incons,
      'mesas_no_agrupadas'       => $deleted_no_agrupadas,
      'no_agrupadas_inconsist'   => $deleted_no_agrupadas_incons,
    ],
    'filtros'        => [
      'fecha_mesa' => $fecha_mesa !== '' ? $fecha_mesa : null,
      'id_turno'   => ($id_turno !== '' && $id_turno !== null) ? (int)$id_turno : null,
    ],
    'restantes'      => $restantes,
    'id_reiniciado'  => $reiniciado,
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    try { $pdo->rollBack(); } catch (Throwable $e2) {}
  }
  respond(false, 'Error al eliminar mesas: ' . $e->getMessage(), 500);
}
