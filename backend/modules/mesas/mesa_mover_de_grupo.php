<?php
// backend/modules/mesas/mesa_mover_de_grupo.php
// Mueve un numero_mesa al grupo destino (incompleto). Pasos:
// 1) Detecta grupo origen (si existe) y limpia ese slot.
// 2) Inserta el número en el primer slot libre del grupo destino.
// 3) Sincroniza fecha_mesa e id_turno de la mesa (tabla mesas) con los del grupo destino.
// 4) Si el grupo origen quedó vacío (los 4 en 0), opcional: lo dejamos como está.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
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
    JSON_UNESCAPED_UNICODE
  );
  exit;
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Método no permitido', 405);
  }

  $input = json_decode(file_get_contents('php://input'), true) ?? [];
  $numero_mesa = (int)($input['numero_mesa'] ?? 0);
  $id_grupo_destino = (int)($input['id_grupo_destino'] ?? 0);

  if ($numero_mesa <= 0 || $id_grupo_destino <= 0) {
    respond(false, 'Parámetros inválidos.');
  }

  $pdo->beginTransaction();

  // 1) Buscar grupo origen que contenga al numero_mesa
  $sqlOrigen = "
    SELECT id_mesa_grupos AS id_grupo,
           numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
    FROM mesas_examen.mesas_grupos
    WHERE :nm IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4)
    FOR UPDATE
  ";
  $stO = $pdo->prepare($sqlOrigen);
  $stO->execute([':nm' => $numero_mesa]);
  $origen = $stO->fetch(PDO::FETCH_ASSOC);

  // 2) Grupo destino (debe tener hueco)
  $sqlDest = "
    SELECT id_mesa_grupos AS id_grupo, numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4,
           fecha_mesa, id_turno
    FROM mesas_examen.mesas_grupos
    WHERE id_mesa_grupos = :g
    FOR UPDATE
  ";
  $stD = $pdo->prepare($sqlDest);
  $stD->execute([':g' => $id_grupo_destino]);
  $dest = $stD->fetch(PDO::FETCH_ASSOC);
  if (!$dest) {
    throw new RuntimeException('Grupo destino inexistente.');
  }

  $slots = [
    (int)$dest['numero_mesa_1'],
    (int)$dest['numero_mesa_2'],
    (int)$dest['numero_mesa_3'],
    (int)$dest['numero_mesa_4'],
  ];
  $idxLibre = array_search(0, $slots, true);
  if ($idxLibre === false) {
    throw new RuntimeException('El grupo destino no tiene sitio libre.');
  }

  // 1.b) Limpiar número en el grupo origen (si existe)
  if ($origen) {
    $cols = ['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'];
    $colAZero = null;
    foreach ($cols as $c) {
      if ((int)$origen[$c] === $numero_mesa) { $colAZero = $c; break; }
    }
    if ($colAZero) {
      $pdo->prepare("UPDATE mesas_examen.mesas_grupos SET $colAZero = 0 WHERE id_mesa_grupos = :g")
          ->execute([':g' => (int)$origen['id_grupo']]);
    }
  }

  // 2.b) Insertar en slot libre del destino
  $colDestino = ['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'][$idxLibre];
  $stUpd = $pdo->prepare("UPDATE mesas_examen.mesas_grupos SET $colDestino = :nm WHERE id_mesa_grupos = :g");
  $stUpd->execute([':nm' => $numero_mesa, ':g' => $id_grupo_destino]);

  // 3) Sincronizar fecha/id_turno de la mesa en tabla "mesas"
  //    (si querés conservar su propia fecha/turno, comentá esta parte)
  $stSync = $pdo->prepare("
    UPDATE mesas_examen.mesas
    SET fecha_mesa = :f, id_turno = :t
    WHERE numero_mesa = :nm
  ");
  $stSync->execute([
    ':f' => $dest['fecha_mesa'],
    ':t' => (int)$dest['id_turno'],
    ':nm' => $numero_mesa,
  ]);

  $pdo->commit();
  respond(true, ['id_grupo_destino' => $id_grupo_destino, 'slot' => $colDestino]);
} catch (Throwable $e) {
  if ($pdo->inTransaction()) $pdo->rollBack();
  respond(false, 'No se pudo mover la mesa: ' . $e->getMessage(), 500);
}
