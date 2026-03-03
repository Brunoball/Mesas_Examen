<?php
// backend/modules/mesas/mesa_grupo_eliminar.php
// -----------------------------------------------------------------------------
// Elimina COMPLETAMENTE el/los registros de mesas_grupos donde aparezca:
//   - un numero_mesa dado (en cualquiera de los 4 slots), o
//   - un id_mesa_grupos dado.
//
// Además SIEMPRE elimina de la tabla `mesas` todas las filas cuyos
// numero_mesa estén involucrados:
//
//   - Si se pasa id_mesa_grupos: borra las mesas de TODOS los numeros del grupo.
//   - Si se pasa numero_mesa:
//        * Si ese numero_mesa pertenece a uno o más grupos, se obtienen TODOS
//          los numero_mesa_1..4 de esos grupos, se borran todas las mesas de
//          esos numeros y luego los grupos.
//        * Si NO pertenece a ningún grupo pero está en mesas_no_agrupadas,
//          se borra de mesas_no_agrupadas y de mesas ese numero_mesa.
//
// NO toca la tabla `previas`.
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

ob_start();
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE);

require_once __DIR__ . '/../../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
  if (ob_get_length()) { @ob_clean(); }
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
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    respond(false, 'Conexión PDO no disponible', 500);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // ---- Entrada (JSON + legacy) ----
  $raw  = file_get_contents('php://input') ?: '';
  $body = json_decode($raw, true);
  if (!is_array($body)) {
    $body = [];
  }

  $numero_mesa    = $body['numero_mesa']    ?? $_POST['numero_mesa']    ?? $_GET['numero_mesa']    ?? null;
  $id_mesa_grupos = $body['id_mesa_grupos'] ?? $_POST['id_mesa_grupos'] ?? $_GET['id_mesa_grupos'] ?? null;

  if ($numero_mesa !== null && !is_numeric($numero_mesa)) {
    respond(false, 'Parámetro numero_mesa inválido.', 400);
  }
  if ($id_mesa_grupos !== null && !is_numeric($id_mesa_grupos)) {
    respond(false, 'Parámetro id_mesa_grupos inválido.', 400);
  }

  $numero_mesa    = $numero_mesa    !== null ? (int)$numero_mesa    : null;
  $id_mesa_grupos = $id_mesa_grupos !== null ? (int)$id_mesa_grupos : null;

  if ($numero_mesa === null && $id_mesa_grupos === null) {
    respond(false, 'Debe enviar numero_mesa o id_mesa_grupos.', 400);
  }

  $pdo->beginTransaction();

  $grupos_afectados       = [];
  $noAgrupadas_afectadas  = [];
  $mesas_eliminadas       = [];

  // =========================================================================
  // Caso 1: eliminar por ID de grupo
  // =========================================================================
  if ($id_mesa_grupos !== null) {
    // Obtenemos el grupo y sus numeros de mesa
    $chk = $pdo->prepare("
      SELECT
        id_mesa_grupos,
        numero_mesa_1,
        numero_mesa_2,
        numero_mesa_3,
        numero_mesa_4
      FROM mesas_grupos
      WHERE id_mesa_grupos = :idg
      LIMIT 1
    ");
    $chk->execute([':idg' => $id_mesa_grupos]);
    $grupo = $chk->fetch(PDO::FETCH_ASSOC);

    if (!$grupo) {
      $pdo->rollBack();
      respond(false, 'Grupo no encontrado.', 404);
    }

    // Armamos listado de numeros_mesa del grupo (> 0, sin repetir)
    $numsGrupo = [];
    foreach (['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'] as $campo) {
      $nm = isset($grupo[$campo]) ? (int)$grupo[$campo] : 0;
      if ($nm > 0) {
        $numsGrupo[$nm] = true;
      }
    }
    $numsGrupo = array_keys($numsGrupo); // array de ints únicos

    // 1) Borramos las mesas (tabla `mesas`) de TODOS esos numeros
    if (!empty($numsGrupo)) {
      $placeholders = implode(',', array_fill(0, count($numsGrupo), '?'));
      $delMesas = $pdo->prepare("DELETE FROM mesas WHERE numero_mesa IN ($placeholders)");
      $delMesas->execute($numsGrupo);
      $mesas_eliminadas = $numsGrupo;
    }

    // 2) Borramos el grupo
    $delGrupo = $pdo->prepare("DELETE FROM mesas_grupos WHERE id_mesa_grupos = :idg");
    $delGrupo->execute([':idg' => $id_mesa_grupos]);
    $grupos_afectados[] = $id_mesa_grupos;

    $pdo->commit();

    respond(true, [
      'mensaje'            => 'Grupo eliminado correctamente.',
      'id_mesa_grupos'     => $grupos_afectados,
      'numeros_mesa'       => $mesas_eliminadas,
      'nota'               => 'Se eliminaron también todas las mesas correspondientes de la tabla `mesas`.',
    ]);
  }

  // =========================================================================
  // Caso 2: eliminar por numero_mesa
  // =========================================================================

  // 2.1) Buscar todos los grupos donde aparezca ese numero_mesa en cualquier slot
  $sel = $pdo->prepare("
    SELECT
      id_mesa_grupos,
      numero_mesa_1,
      numero_mesa_2,
      numero_mesa_3,
      numero_mesa_4
    FROM mesas_grupos
    WHERE :nm IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4)
    FOR UPDATE
  ");
  $sel->execute([':nm' => $numero_mesa]);
  $grupos = $sel->fetchAll(PDO::FETCH_ASSOC);

  if ($grupos) {
    // Tenemos uno o más grupos donde aparece ese numero_mesa.
    // 1) Reunimos TODOS los numeros de mesa de esos grupos (sin repetir)
    $numsGrupo = [];
    $idsGrupos = [];

    foreach ($grupos as $g) {
      $idsGrupos[] = (int)$g['id_mesa_grupos'];
      foreach (['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'] as $campo) {
        $nm = isset($g[$campo]) ? (int)$g[$campo] : 0;
        if ($nm > 0) {
          $numsGrupo[$nm] = true;
        }
      }
    }

    $numsGrupo = array_keys($numsGrupo); // numeros de mesa únicos
    $grupos_afectados = $idsGrupos;

    // 2) Borramos TODAS las filas de `mesas` cuyos numero_mesa estén en esos grupos
    if (!empty($numsGrupo)) {
      $phMesas = implode(',', array_fill(0, count($numsGrupo), '?'));
      $delMesas = $pdo->prepare("DELETE FROM mesas WHERE numero_mesa IN ($phMesas)");
      $delMesas->execute($numsGrupo);
      $mesas_eliminadas = $numsGrupo;
    }

    // 3) Borramos los grupos
    $phGrupos = implode(',', array_fill(0, count($idsGrupos), '?'));
    $delGrupos = $pdo->prepare("DELETE FROM mesas_grupos WHERE id_mesa_grupos IN ($phGrupos)");
    $delGrupos->execute($idsGrupos);

    $pdo->commit();

    respond(true, [
      'mensaje'            => 'Grupo(s) y mesas eliminados correctamente.',
      'id_mesa_grupos'     => $grupos_afectados,
      'numeros_mesa'       => $mesas_eliminadas,
      'nota'               => 'Se eliminaron todas las mesas de los números involucrados en los grupos.',
    ]);
  }

  // 2.2) Si NO hay grupos, intentamos eliminar como "mesa no agrupada"
  $selNo = $pdo->prepare("
    SELECT id
    FROM mesas_no_agrupadas
    WHERE numero_mesa = :nm
    FOR UPDATE
  ");
  $selNo->execute([':nm' => $numero_mesa]);
  $idsNo = $selNo->fetchAll(PDO::FETCH_COLUMN, 0);

  if ($idsNo) {
    $inNo  = implode(',', array_fill(0, count($idsNo), '?'));
    $delNo = $pdo->prepare("DELETE FROM mesas_no_agrupadas WHERE id IN ($inNo)");
    $delNo->execute(array_map('intval', $idsNo));
    $noAgrupadas_afectadas = array_map('intval', $idsNo);

    // También borramos TODAS las filas de la tabla `mesas` con ese numero_mesa
    $delMesa = $pdo->prepare("DELETE FROM mesas WHERE numero_mesa = :nm");
    $delMesa->execute([':nm' => $numero_mesa]);
    $mesas_eliminadas[] = $numero_mesa;

    $pdo->commit();

    respond(true, [
      'mensaje'                 => 'Mesa no agrupada eliminada correctamente.',
      'id_mesas_no_agrupadas'   => $noAgrupadas_afectadas,
      'numero_mesa_busca'       => $numero_mesa,
      'mesas_eliminadas'        => $mesas_eliminadas,
      'nota'                    => 'Se eliminó también la mesa correspondiente de la tabla `mesas`.',
    ]);
  }

  // 2.3) No está ni en grupos ni en no_agrupadas
  $pdo->rollBack();
  respond(false, 'No se encontró ese numero_mesa en ningún grupo ni como mesa no agrupada.', 404);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) {
    try { $pdo->rollBack(); } catch (Throwable $e2) {}
  }
  respond(false, 'Error al eliminar grupo: ' . $e->getMessage(), 500);
}
