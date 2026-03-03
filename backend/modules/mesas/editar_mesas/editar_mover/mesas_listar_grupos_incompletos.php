<?php
// backend/modules/mesas/mesas_listar_grupos_incompletos.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE);

require_once __DIR__ . '/../../../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
  http_response_code($status);
  echo json_encode(
    $ok
      ? ['exito' => true, 'data' => $payload]
      : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Método no permitido', 405);
  }

  $input = json_decode(file_get_contents('php://input'), true) ?? [];

  // Opcionales (si los mandás, filtra; si no, trae todo)
  $fecha = null;
  if (isset($input['fecha_mesa']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$input['fecha_mesa'])) {
    $fecha = (string)$input['fecha_mesa'];
  }

  $id_turno = null;
  if (isset($input['id_turno']) && is_numeric($input['id_turno'])) {
    $id_turno = (int)$input['id_turno'];
    if ($id_turno <= 0) $id_turno = null;
  }

  /**
   * ✅ LÓGICA CORRECTA:
   * - Un grupo está "incompleto" si tiene algún numero_mesa_X = 0.
   * - NO se usa COUNT(mesas.id_mesa) porque en `mesas` hay MUCHAS filas por numero_mesa.
   * - Si querés excluir “grupos enormes”, eso se hace en otro endpoint con otra métrica,
   *   pero para “hay slot libre”, la fuente es `mesas_grupos`.
   */

  $where = [];
  $params = [];

  // Debe tener al menos un slot libre
  $where[] = "(mg.numero_mesa_1 = 0 OR mg.numero_mesa_2 = 0 OR mg.numero_mesa_3 = 0 OR mg.numero_mesa_4 = 0)";

  // Filtros opcionales (solo si vienen)
  if ($fecha !== null) {
    $where[] = "mg.fecha_mesa = :fecha";
    $params[':fecha'] = $fecha;
  }
  if ($id_turno !== null) {
    $where[] = "mg.id_turno = :id_turno";
    $params[':id_turno'] = $id_turno;
  }

  $sql = "
    SELECT
      mg.id_mesa_grupos AS id_grupo,
      mg.numero_mesa_1,
      mg.numero_mesa_2,
      mg.numero_mesa_3,
      mg.numero_mesa_4,
      mg.fecha_mesa,
      mg.id_turno,
      mg.hora,
      -- ✅ cuántos números reales tiene el grupo (1..4)
      (
        (CASE WHEN mg.numero_mesa_1 <> 0 THEN 1 ELSE 0 END) +
        (CASE WHEN mg.numero_mesa_2 <> 0 THEN 1 ELSE 0 END) +
        (CASE WHEN mg.numero_mesa_3 <> 0 THEN 1 ELSE 0 END) +
        (CASE WHEN mg.numero_mesa_4 <> 0 THEN 1 ELSE 0 END)
      ) AS cantidad_numeros
    FROM mesas_grupos mg
    WHERE " . implode(" AND ", $where) . "
    ORDER BY
      mg.fecha_mesa,
      mg.id_turno,
      mg.id_mesa_grupos
  ";

  $st = $pdo->prepare($sql);
  foreach ($params as $k => $v) $st->bindValue($k, $v);
  $st->execute();
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);

  respond(true, $rows);
} catch (Throwable $e) {
  respond(false, 'Error al listar grupos incompletos: ' . $e->getMessage(), 500);
}
