<?php
// backend/modules/mesas/eliminar_mesas.php
declare(strict_types=1);

/**
 * Entrada (JSON o form):
 *  - fecha_mesa (YYYY-MM-DD) opcional
 *  - id_turno   (int)        opcional
 *
 * Comportamiento:
 *  - Sin filtros -> TRUNCATE TABLE (reinicia AUTO_INCREMENT).
 *  - Con filtros -> DELETE ... WHERE; si la tabla queda vacía, resetea AUTO_INCREMENT.
 *
 * Respuesta:
 *  { exito: bool, mensaje: string, eliminadas?: int, filtros?: {...}, truncado?: bool }
 */

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

if (!isset($pdo) || !($pdo instanceof PDO)) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode([
    'exito' => false,
    'mensaje' => 'No se pudo obtener la conexión PDO desde config/db.php'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

function json_response(array $payload, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}
function validar_fecha(string $s): bool {
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
  [$y,$m,$d] = explode('-', $s);
  return checkdate((int)$m, (int)$d, (int)$y);
}

// Leer input JSON o form
$raw  = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) $body = [];

$fecha_mesa = isset($body['fecha_mesa']) ? trim((string)$body['fecha_mesa']) : null;
$id_turno   = isset($body['id_turno'])   ? $body['id_turno']                  : null;

if ($fecha_mesa === null && isset($_POST['fecha_mesa'])) $fecha_mesa = trim((string)$_POST['fecha_mesa']);
if ($id_turno   === null && isset($_POST['id_turno']))   $id_turno   = $_POST['id_turno'];
if ($fecha_mesa === null && isset($_GET['fecha_mesa']))  $fecha_mesa = trim((string)$_GET['fecha_mesa']);
if ($id_turno   === null && isset($_GET['id_turno']))    $id_turno   = $_GET['id_turno'];

// Validaciones suaves
$params = [];
$where  = [];

if ($fecha_mesa !== null && $fecha_mesa !== '') {
  if (!validar_fecha($fecha_mesa)) {
    json_response(['exito' => false, 'mensaje' => 'fecha_mesa debe ser YYYY-MM-DD'], 400);
  }
  $where[] = 'fecha_mesa = :fecha_mesa';
  $params[':fecha_mesa'] = $fecha_mesa;
}
if ($id_turno !== null && $id_turno !== '' && $id_turno !== false) {
  if (!is_numeric($id_turno)) {
    json_response(['exito' => false, 'mensaje' => 'id_turno debe ser numérico'], 400);
  }
  $where[] = 'id_turno = :id_turno';
  $params[':id_turno'] = (int)$id_turno;
}

// Ejecutar DELETE/TRUNCATE
try {
  // Si ya seleccionás la DB mesas_examen en la conexión, podés usar solo "mesas".
  $tabla = 'mesas_examen.mesas';

  // Si no hay filtros -> TRUNCATE para resetear AUTO_INCREMENT
  if (empty($where)) {
    // Contar antes para poder informar "eliminadas"
    $countStmt = $pdo->query("SELECT COUNT(*) AS c FROM {$tabla}");
    $previas = (int)($countStmt->fetchColumn() ?: 0);

    // TRUNCATE no puede ejecutarse dentro de transacción (MySQL lo hace implícito)
    // y requiere permisos DROP/CREATE sobre la tabla.
    $pdo->exec("TRUNCATE TABLE {$tabla}");

    json_response([
      'exito'      => true,
      'truncado'   => true,
      'mensaje'    => 'Se eliminaron todas las mesas y se reinició el ID.',
      'eliminadas' => $previas,
      'filtros'    => [
        'fecha_mesa' => null,
        'id_turno'   => null,
      ],
    ]);
  }

  // Con filtros -> DELETE … WHERE
  $sqlWhere = 'WHERE ' . implode(' AND ', $where);
  $sql = "DELETE FROM {$tabla} {$sqlWhere}";

  $pdo->beginTransaction();
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $eliminadas = $stmt->rowCount();

  // Si la tabla quedó vacía después del DELETE, resetear AUTO_INCREMENT
  $restantesStmt = $pdo->query("SELECT COUNT(*) FROM {$tabla}");
  $restantes = (int)($restantesStmt->fetchColumn() ?: 0);
  if ($restantes === 0) {
    // reset auto_increment; poner 1 hace que el próximo ID sea 1
    $pdo->exec("ALTER TABLE {$tabla} AUTO_INCREMENT = 1");
  }

  $pdo->commit();

  json_response([
    'exito'      => true,
    'truncado'   => false,
    'mensaje'    => 'Mesas eliminadas con los filtros proporcionados.' . ($restantes === 0 ? ' (ID reiniciado)' : ''),
    'eliminadas' => $eliminadas,
    'filtros'    => [
      'fecha_mesa' => $fecha_mesa !== '' ? $fecha_mesa : null,
      'id_turno'   => isset($params[':id_turno']) ? $params[':id_turno'] : null,
    ],
  ]);
} catch (Throwable $e) {
  if ($pdo->inTransaction()) $pdo->rollBack();
  json_response([
    'exito'   => false,
    'mensaje' => 'Error del servidor al eliminar mesas.',
    'detalle' => $e->getMessage(),
  ], 500);
}
