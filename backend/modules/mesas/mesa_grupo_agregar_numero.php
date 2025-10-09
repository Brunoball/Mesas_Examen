<?php
// backend/modules/mesas/mesa_grupo_agregar_numero.php
// -----------------------------------------------------------------------------
// Agrega un numero_mesa a un grupo existente **validando** la regla de prioridad-1
// y, si la operación es exitosa, **elimina** ese numero_mesa de `mesas_no_agrupadas`.
//
// Regla prioridad-1 (si se envía fecha_objetivo):
//   Ningún DNI del numero_mesa agregado puede tener otra mesa con prioridad=1
//   con fecha_mesa > fecha_objetivo.
//
// Entrada (POST JSON):
//   { "id_grupo": 12, "numero_mesa": 345, "fecha_objetivo": "YYYY-MM-DD" | null }
//
// Salida:
//   { exito:true, data:{ id_grupo } }
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

  $id_grupo    = isset($in['id_grupo']) ? (int)$in['id_grupo'] : 0;
  $numero_mesa = isset($in['numero_mesa']) ? (int)$in['numero_mesa'] : 0;
  $fecha_obj   = isset($in['fecha_objetivo']) ? trim((string)$in['fecha_objetivo']) : '';

  if ($id_grupo <= 0 || $numero_mesa <= 0) respond_json(false, 'Parámetros inválidos.', 400);

  // --- Verificaciones previas (fuera de la TX para errores rápidos) -------------
  // 1) Grupo existe
  $stG = $pdo->prepare("SELECT * FROM mesas_grupos WHERE id_mesa_grupos = ?");
  $stG->execute([$id_grupo]);
  $grupo = $stG->fetch(PDO::FETCH_ASSOC);
  if (!$grupo) respond_json(false, 'Grupo no encontrado.', 404);

  // 2) El numero_mesa existe
  $stCheckMesa = $pdo->prepare("SELECT 1 FROM mesas WHERE numero_mesa = ? LIMIT 1");
  $stCheckMesa->execute([$numero_mesa]);
  if (!$stCheckMesa->fetchColumn()) respond_json(false, 'numero_mesa inexistente.', 404);

  // 3) No esté ya dentro del mismo grupo
  foreach (['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'] as $c) {
    if ((int)($grupo[$c] ?? 0) === $numero_mesa) {
      respond_json(false, 'El número ya pertenece a este grupo.', 409);
    }
  }

  // 4) Regla PRIORIDAD-1 si hay fecha_objetivo
  if ($fecha_obj !== '') {
    $stD = $pdo->prepare("
      SELECT DISTINCT p.dni
      FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
      WHERE m.numero_mesa = ?
    ");
    $stD->execute([$numero_mesa]);
    $dnis = $stD->fetchAll(PDO::FETCH_COLUMN);

    if ($dnis) {
      $dnis = array_values(array_unique(array_filter($dnis, fn($x) => (string)$x !== '')));
      if ($dnis) {
        $ph = implode(',', array_fill(0, count($dnis), '?'));
        $sqlP1 = "
          SELECT 1
          FROM mesas m
            INNER JOIN previas p ON p.id_previa = m.id_previa
          WHERE p.dni IN ($ph)
            AND m.prioridad = 1
            AND m.fecha_mesa IS NOT NULL
            AND m.fecha_mesa > ?
          LIMIT 1
        ";
        $params = array_merge($dnis, [$fecha_obj]);
        $stP1 = $pdo->prepare($sqlP1);
        $stP1->execute($params);
        if ($stP1->fetchColumn()) {
          respond_json(false, 'No elegible: algún alumno tiene prioridad 1 después de la fecha objetivo.', 400);
        }
      }
    }
  }

  // --- Transacción: asegurar slot libre y remover de no_agrupadas ---------------
  $pdo->beginTransaction();

  // Bloqueo del grupo para evitar carreras
  $stGLock = $pdo->prepare("SELECT * FROM mesas_grupos WHERE id_mesa_grupos = ? FOR UPDATE");
  $stGLock->execute([$id_grupo]);
  $grupoLock = $stGLock->fetch(PDO::FETCH_ASSOC);
  if (!$grupoLock) {
    $pdo->rollBack();
    respond_json(false, 'Grupo no encontrado (lock).', 404);
  }

  // Re-chequeo de duplicado dentro del grupo ya bloqueado
  foreach (['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'] as $c) {
    if ((int)($grupoLock[$c] ?? 0) === $numero_mesa) {
      $pdo->rollBack();
      respond_json(false, 'El número ya pertenece a este grupo.', 409);
    }
  }

  // Buscar posición libre
  $slots = ['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'];
  $colLibre = null;
  foreach ($slots as $col) {
    $val = (int)($grupoLock[$col] ?? 0);
    if ($val === 0) { $colLibre = $col; break; }
  }
  if (!$colLibre) {
    $pdo->rollBack();
    respond_json(false, 'El grupo ya tiene 4 números.', 400);
  }

  // Asignar en el grupo
  $sqlUpd = "UPDATE mesas_grupos SET $colLibre = ? WHERE id_mesa_grupos = ?";
  $stU = $pdo->prepare($sqlUpd);
  $stU->execute([$numero_mesa, $id_grupo]);

  // Eliminar de mesas_no_agrupadas (todas las filas de ese numero)
  $stDel = $pdo->prepare("DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?");
  $stDel->execute([$numero_mesa]);

  $pdo->commit();

  respond_json(true, ['id_grupo' => $id_grupo]);

} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
  error_log('[mesa_grupo_agregar_numero] ' . $e->getMessage());
  respond_json(false, 'Error: ' . $e->getMessage(), 500);
}
