<?php
// backend/modules/mesas/mesa_grupo_eliminar.php
// -----------------------------------------------------------------------------
// Elimina COMPLETAMENTE el/los registros de mesas_grupos donde aparezca:
//   - un numero_mesa dado (en cualquiera de los 4 slots), o
//   - un id_mesa_grupos dado.
// NO toca la tabla `mesas`, ni `mesas_previas`, ni fechas/turnos de mesas.
// -----------------------------------------------------------------------------

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

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) respond(false, 'Conexión PDO no disponible', 500);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // ---- Entrada (JSON + legacy) ----
  $raw  = file_get_contents('php://input') ?: '';
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = [];

  $numero_mesa    = $body['numero_mesa']     ?? $_POST['numero_mesa']     ?? $_GET['numero_mesa']     ?? null;
  $id_mesa_grupos = $body['id_mesa_grupos']  ?? $_POST['id_mesa_grupos']  ?? $_GET['id_mesa_grupos']  ?? null;

  if ($numero_mesa !== null && !is_numeric($numero_mesa))       respond(false, 'Parámetro numero_mesa inválido.', 400);
  if ($id_mesa_grupos !== null && !is_numeric($id_mesa_grupos)) respond(false, 'Parámetro id_mesa_grupos inválido.', 400);

  $numero_mesa    = $numero_mesa    !== null ? (int)$numero_mesa    : null;
  $id_mesa_grupos = $id_mesa_grupos !== null ? (int)$id_mesa_grupos : null;

  if ($numero_mesa === null && $id_mesa_grupos === null) {
    respond(false, 'Debe enviar numero_mesa o id_mesa_grupos.', 400);
  }

  $pdo->beginTransaction();

  $grupos_afectados = [];

  if ($id_mesa_grupos !== null) {
    // Validar existencia
    $chk = $pdo->prepare("SELECT id_mesa_grupos FROM mesas_grupos WHERE id_mesa_grupos = :idg LIMIT 1");
    $chk->execute([':idg' => $id_mesa_grupos]);
    if ($chk->fetchColumn() === false) {
      $pdo->rollBack();
      respond(false, 'Grupo no encontrado.', 404);
    }
    // Borrar ese grupo
    $del = $pdo->prepare("DELETE FROM mesas_grupos WHERE id_mesa_grupos = :idg");
    $del->execute([':idg' => $id_mesa_grupos]);
    $grupos_afectados[] = $id_mesa_grupos;

  } else {
    // Buscar todos los grupos donde aparezca ese numero_mesa en cualquier slot
    $sel = $pdo->prepare("
      SELECT id_mesa_grupos
      FROM mesas_grupos
      WHERE :nm IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4)
      FOR UPDATE
    ");
    $sel->execute([':nm' => $numero_mesa]);
    $ids = $sel->fetchAll(PDO::FETCH_COLUMN, 0);

    if (!$ids) {
      $pdo->rollBack();
      respond(false, 'No se encontró ese numero_mesa en ningún grupo.', 404);
    }

    // Borrar todos los grupos encontrados
    $in = implode(',', array_fill(0, count($ids), '?'));
    $del = $pdo->prepare("DELETE FROM mesas_grupos WHERE id_mesa_grupos IN ($in)");
    $del->execute(array_map('intval', $ids));
    $grupos_afectados = array_map('intval', $ids);
  }

  $pdo->commit();

  respond(true, [
    'mensaje'          => 'Grupo(s) eliminado(s) correctamente.',
    'id_mesa_grupos'   => $grupos_afectados,
    'numero_mesa_busca'=> $numero_mesa,
    'nota'             => 'No se modificaron registros en la tabla `mesas`.',
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) {
    try { $pdo->rollBack(); } catch (Throwable $e2) {}
  }
  respond(false, 'Error al eliminar grupo: ' . $e->getMessage(), 500);
}
