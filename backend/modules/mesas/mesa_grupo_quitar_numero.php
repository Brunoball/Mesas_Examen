<?php
// backend/modules/mesas/mesa_grupo_quitar_numero.php
// -----------------------------------------------------------------------------
// Quita un numero_mesa de su grupo (si está en alguno) y lo mueve a
// `mesas_no_agrupadas` con la misma fecha/id_turno del grupo.
// 
// Entrada (POST JSON):
//   { "numero_mesa": 51 }
// 
// Salida (OK):
//   { exito:true, data:{ id_grupo, columna_removida, inserted_no_agrupadas_id } }
// -----------------------------------------------------------------------------


declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

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
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_json(false, 'Método no permitido.', 405);
  }
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    respond_json(false, 'Conexión PDO no disponible.', 500);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // -------- Parseo de entrada
  $raw = file_get_contents('php://input') ?: '';
  $in  = json_decode($raw, true);
  if (!is_array($in)) respond_json(false, 'Body JSON inválido.', 400);

  $numero_mesa = isset($in['numero_mesa']) ? (int)$in['numero_mesa'] : 0;
  if ($numero_mesa <= 0) respond_json(false, 'Parámetro numero_mesa inválido.', 400);

  // Verificar que exista la mesa (opcional pero útil)
  $stMesa = $pdo->prepare("SELECT 1 FROM mesas WHERE numero_mesa = ? LIMIT 1");
  $stMesa->execute([$numero_mesa]);
  if (!$stMesa->fetchColumn()) {
    respond_json(false, 'numero_mesa inexistente.', 404);
  }

  // -------- Transacción
  $pdo->beginTransaction();

  // Buscar y bloquear el grupo que contenga ese número (FOR UPDATE)
  $sqlFind = "
    SELECT *
    FROM mesas_grupos
    WHERE numero_mesa_1 = :n
       OR numero_mesa_2 = :n
       OR numero_mesa_3 = :n
       OR numero_mesa_4 = :n
    LIMIT 1
    FOR UPDATE
  ";
  $stFind = $pdo->prepare($sqlFind);
  $stFind->execute([':n' => $numero_mesa]);
  $grupo = $stFind->fetch(PDO::FETCH_ASSOC);

  if (!$grupo) {
    // No estaba en un grupo → aseguramos que quede listado en no_agrupadas (sin fecha/turno)
    $stIns = $pdo->prepare("
      INSERT INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, fecha_registro)
      VALUES (?, NULL, NULL, NOW())
    ");
    $stIns->execute([$numero_mesa]);
    $pdo->commit();
    respond_json(true, [
      'id_grupo' => null,
      'columna_removida' => null,
      'inserted_no_agrupadas_id' => (int)$pdo->lastInsertId(),
      'nota' => 'El número no estaba en ningún grupo; se agregó a no_agrupadas.'
    ]);
  }

  $id_grupo   = (int)$grupo['id_mesa_grupos'];
  $fechaMesaG = $grupo['fecha_mesa'] ?? null;
  $idTurnoG   = isset($grupo['id_turno']) ? (int)$grupo['id_turno'] : null;

  // Determinar la columna donde está el número
  $columna = null;
  foreach (['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'] as $c) {
    if ((int)($grupo[$c] ?? 0) === $numero_mesa) {
      $columna = $c; break;
    }
  }
  if (!$columna) {
    // Inconsistencia (difícil que pase porque hicimos el WHERE)
    $pdo->rollBack();
    respond_json(false, 'No se pudo identificar la columna del grupo.', 500);
  }

  // Quitar del grupo (poner 0)
  $stUpd = $pdo->prepare("UPDATE mesas_grupos SET {$columna} = 0 WHERE id_mesa_grupos = ?");
  $stUpd->execute([$id_grupo]);

  // Insertar en mesas_no_agrupadas con la misma fecha/id_turno del grupo
  // Si no hay fecha/id_turno en el grupo, se insertan como NULL.
  $stIns = $pdo->prepare("
    INSERT INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, fecha_registro)
    VALUES (?, ?, ?, NOW())
  ");
  $stIns->execute([
    $numero_mesa,
    $fechaMesaG ?: null,
    $idTurnoG ?: null
  ]);

  $insertId = (int)$pdo->lastInsertId();

  $pdo->commit();

  respond_json(true, [
    'id_grupo' => $id_grupo,
    'columna_removida' => $columna,
    'inserted_no_agrupadas_id' => $insertId
  ]);

} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
  error_log('[mesa_grupo_quitar_numero] ' . $e->getMessage());
  respond_json(false, 'Error: ' . $e->getMessage(), 500);
}
