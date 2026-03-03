<?php
// ✅ REEMPLAZAR COMPLETO
// backend/modules/mesas/editar_mesas/agregar_nota.php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../../config/db.php';

function out(bool $ok, $payload = null, int $code = 200): void {
  http_response_code($code);
  echo json_encode(
    $ok
      ? ['exito' => true, 'data' => $payload]
      : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

function norm_str($v): string { return trim((string)($v ?? '')); }
function only_digits(string $s): string {
  $x = preg_replace('/\D+/', '', $s);
  return $x === null ? '' : $x;
}
function validar_fecha(string $s): bool {
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
  [$y, $m, $d] = explode('-', $s);
  return checkdate((int)$m, (int)$d, (int)$y);
}
function sql_norm_dni(string $field): string {
  return "REPLACE(REPLACE(REPLACE(REPLACE($field,'.',''),' ',''),'-',''),',','')";
}

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) out(false, 'Conexión PDO no disponible.', 500);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // -------- Parseo de entrada (JSON o POST)
  $raw = file_get_contents('php://input') ?: '';
  $in = json_decode($raw, true);
  if (!is_array($in)) $in = $_POST;

  $id_previa   = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;

  // Para resolver desde mesas (si el front lo manda)
  $id_mesa     = isset($in['id_mesa']) ? (int)$in['id_mesa'] : 0;
  $numero_mesa = isset($in['numero_mesa']) ? (int)$in['numero_mesa'] : 0;
  $fecha_mesa  = norm_str($in['fecha_mesa'] ?? '');
  $id_turno    = isset($in['id_turno']) ? (int)$in['id_turno'] : 0;
  $id_catedra  = isset($in['id_catedra']) ? (int)$in['id_catedra'] : 0;
  $id_docente  = isset($in['id_docente']) ? (int)$in['id_docente'] : 0;

  // Fallback por materia
  $dni_raw     = norm_str($in['dni'] ?? '');
  $dni_digits  = only_digits($dni_raw);
  $id_materia  = isset($in['id_materia']) ? (int)$in['id_materia'] : 0;
  $anio        = isset($in['anio']) ? (int)$in['anio'] : 0;

  // Nota
  $nota_raw  = $in['nota'] ?? null;
  $fecha_raw = norm_str($in['fecha_nota'] ?? '');

  // -------- Interpretación de nota
  $limpiar = false;
  $nota_int = null;

  if ($nota_raw === null || (is_string($nota_raw) && trim($nota_raw) === '')) {
    $limpiar = true;
  } else {
    $nota_int = (int)$nota_raw;
    if ($nota_int < 1 || $nota_int > 10) {
      out(false, 'La nota debe estar entre 1 y 10, o vacío para limpiar.', 400);
    }
  }

  // -------- Fecha nota
  $fecha_nota = null;
  if (!$limpiar) {
    if ($fecha_raw === '') {
      $fecha_nota = date('Y-m-d');
    } else {
      if (!validar_fecha($fecha_raw)) {
        out(false, 'fecha_nota inválida. Formato esperado: YYYY-MM-DD', 400);
      }
      $fecha_nota = $fecha_raw;
    }
  }

  $previaExists = function(int $id) use ($pdo): bool {
    $st = $pdo->prepare("SELECT 1 FROM previas WHERE id_previa = ? LIMIT 1");
    $st->execute([$id]);
    return (bool)$st->fetchColumn();
  };

  $resolveIdPreviaFromMesas = function(array $ctx) use ($pdo): array {
    // Devuelve: [id_previa(int), resolved_by(string), mesa_row(array|null)]
    $id_mesa = (int)($ctx['id_mesa'] ?? 0);

    if ($id_mesa > 0) {
      $st = $pdo->prepare("
        SELECT id_mesa, numero_mesa, id_previa, id_catedra, id_docente, fecha_mesa, id_turno
          FROM mesas
         WHERE id_mesa = ?
         LIMIT 1
      ");
      $st->execute([$id_mesa]);
      $r = $st->fetch(PDO::FETCH_ASSOC);
      if (!$r) return [0, 'mesas:id_mesa_no_encontrada', null];

      $idp = (int)($r['id_previa'] ?? 0);
      if ($idp > 0) return [$idp, 'mesas:por_id_mesa', $r];

      $ctx['numero_mesa'] = (int)($r['numero_mesa'] ?? 0);
      $ctx['fecha_mesa']  = (string)($r['fecha_mesa'] ?? '');
      $ctx['id_turno']    = (int)($r['id_turno'] ?? 0);
      $ctx['id_catedra']  = (int)($r['id_catedra'] ?? 0);
      $ctx['id_docente']  = (int)($r['id_docente'] ?? 0);
    }

    $where = [];
    $bind = [];

    if (!empty($ctx['numero_mesa'])) { $where[] = "numero_mesa = :num"; $bind[':num'] = (int)$ctx['numero_mesa']; }

    if (!empty($ctx['fecha_mesa'])) {
      $f = (string)$ctx['fecha_mesa'];
      if ($f !== '' && validar_fecha($f)) { $where[] = "fecha_mesa = :f"; $bind[':f'] = $f; }
    }

    if (!empty($ctx['id_turno'])) { $where[] = "id_turno = :t"; $bind[':t'] = (int)$ctx['id_turno']; }

    if (!empty($ctx['id_catedra'])) { $where[] = "id_catedra = :c"; $bind[':c'] = (int)$ctx['id_catedra']; }
    if (!empty($ctx['id_docente'])) { $where[] = "id_docente = :d"; $bind[':d'] = (int)$ctx['id_docente']; }

    if (count($where) === 0) return [0, 'mesas:sin_datos', null];

    $sql = "
      SELECT id_mesa, numero_mesa, id_previa, id_catedra, id_docente, fecha_mesa, id_turno
        FROM mesas
       WHERE " . implode(' AND ', $where) . "
         AND id_previa IS NOT NULL
       ORDER BY id_mesa DESC
       LIMIT 1
    ";
    $st = $pdo->prepare($sql);
    $st->execute($bind);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if (!$r) return [0, 'mesas:sin_match', null];

    return [(int)$r['id_previa'], 'mesas:por_filtros', $r];
  };

  // =========================================================
  // ✅ RESOLVER id_previa REAL
  // =========================================================
  $pdo->beginTransaction();

  $resolved_by = null;
  $mesa_ref = null;
  $id_previa_real = 0;

  if ($id_previa > 0 && $previaExists($id_previa)) {
    $id_previa_real = $id_previa;
    $resolved_by = 'id_previa_existente';
  } else {
    [$idp, $how, $mesaRow] = $resolveIdPreviaFromMesas([
      'id_mesa'     => $id_mesa,
      'numero_mesa' => $numero_mesa,
      'fecha_mesa'  => $fecha_mesa,
      'id_turno'    => $id_turno,
      'id_catedra'  => $id_catedra,
      'id_docente'  => $id_docente,
    ]);

    if ($idp > 0) {
      $id_previa_real = $idp;
      $resolved_by = $how;
      $mesa_ref = $mesaRow;
    } else {
      // fallback: dni + id_materia (+ anio)
      if ($dni_digits !== '' && $id_materia > 0) {
        $dniFieldNorm = sql_norm_dni('p.dni');
        $where = "(p.dni = :dni_raw OR $dniFieldNorm = :dni_digits) AND p.id_materia = :id_materia";
        $bind = [
          ':dni_raw' => $dni_raw,
          ':dni_digits' => $dni_digits,
          ':id_materia' => $id_materia,
        ];
        if ($anio > 0) { $where .= " AND p.anio = :anio"; $bind[':anio'] = $anio; }

        $st = $pdo->prepare("SELECT p.id_previa FROM previas p WHERE $where ORDER BY p.id_previa DESC LIMIT 1");
        $st->execute($bind);
        $idp2 = (int)($st->fetchColumn() ?: 0);

        if ($idp2 > 0) {
          $id_previa_real = $idp2;
          $resolved_by = 'fallback:dni+id_materia';
        }
      }
    }
  }

  if ($id_previa_real <= 0) {
    $pdo->rollBack();
    out(false, 'No se pudo resolver qué previa actualizar.', 400);
  }

  if (!$previaExists($id_previa_real)) {
    $pdo->rollBack();
    out(false, 'Se resolvió un id_previa pero no existe en "previas".', 404);
  }

  // =========================================================
  // ✅ BULK REAL: aunque mandes SOLO id_previa,
  // sacamos el grupo desde la tabla mesas usando id_previa_real
  // =========================================================

  // 1) DNI real de la previa resuelta
  $stDni = $pdo->prepare("SELECT dni FROM previas WHERE id_previa = ? LIMIT 1");
  $stDni->execute([$id_previa_real]);
  $dni_db = (string)($stDni->fetchColumn() ?? '');
  $dni_db_digits = only_digits($dni_db);

  // 2) Grupo mesa: prioridad
  //   A) lo que manda el front
  //   B) mesa_ref si existiera
  //   C) buscar en mesas por id_previa_real (ESTO ES LO QUE TE FALTABA)
  $grupo_numero = $numero_mesa > 0 ? $numero_mesa : (int)($mesa_ref['numero_mesa'] ?? 0);
  $grupo_fecha  = ($fecha_mesa !== '') ? $fecha_mesa : (string)($mesa_ref['fecha_mesa'] ?? '');
  $grupo_turno  = $id_turno > 0 ? $id_turno : (int)($mesa_ref['id_turno'] ?? 0);

  if ($grupo_numero <= 0 || $grupo_fecha === '' || $grupo_turno <= 0) {
    $stGrupo = $pdo->prepare("
      SELECT numero_mesa, fecha_mesa, id_turno
        FROM mesas
       WHERE id_previa = ?
       ORDER BY id_mesa DESC
       LIMIT 1
    ");
    $stGrupo->execute([$id_previa_real]);
    $g = $stGrupo->fetch(PDO::FETCH_ASSOC);

    if ($g) {
      if ($grupo_numero <= 0) $grupo_numero = (int)($g['numero_mesa'] ?? 0);
      if ($grupo_fecha === '') $grupo_fecha = (string)($g['fecha_mesa'] ?? '');
      if ($grupo_turno <= 0) $grupo_turno = (int)($g['id_turno'] ?? 0);
    }
  }

  $ids_a_actualizar = [$id_previa_real];
  $bulk_aplicado = false;

  if ($grupo_numero > 0 && $dni_db_digits !== '') {
    $dniFieldNorm = sql_norm_dni('p.dni');

    // Armar WHERE del grupo:
    // - SI tengo fecha/turno válidos -> los uso (evita tocar otra mesa con mismo número en otro día)
    // - si NO -> caigo a "solo numero_mesa" como pediste
    $whereGrupo = "m.numero_mesa = :num";
    $bind = [
      ':num' => $grupo_numero,
      ':dni_digits' => $dni_db_digits,
      ':dni_raw' => $dni_db,
    ];

    if ($grupo_fecha !== '' && validar_fecha($grupo_fecha)) {
      $whereGrupo .= " AND m.fecha_mesa = :f";
      $bind[':f'] = $grupo_fecha;
    }

    if ($grupo_turno > 0) {
      $whereGrupo .= " AND m.id_turno = :t";
      $bind[':t'] = $grupo_turno;
    }

    $sqlIds = "
      SELECT DISTINCT m.id_previa
        FROM mesas m
        JOIN previas p ON p.id_previa = m.id_previa
       WHERE $whereGrupo
         AND m.id_previa IS NOT NULL
         AND ($dniFieldNorm = :dni_digits OR p.dni = :dni_raw)
       ORDER BY m.id_previa ASC
    ";

    $stIds = $pdo->prepare($sqlIds);
    $stIds->execute($bind);

    $ids = $stIds->fetchAll(PDO::FETCH_COLUMN, 0);
    $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));

    if (count($ids) > 0) {
      $ids_a_actualizar = $ids;
      $bulk_aplicado = true;
    }
  }

  // 3) UPDATE a todos los id_previa encontrados
  $placeholders = implode(',', array_fill(0, count($ids_a_actualizar), '?'));

  if ($limpiar) {
    $sqlUp = "UPDATE previas SET nota = NULL, fecha_nota = NULL WHERE id_previa IN ($placeholders)";
    $stUp = $pdo->prepare($sqlUp);
    $stUp->execute($ids_a_actualizar);
  } else {
    $sqlUp = "UPDATE previas SET nota = ?, fecha_nota = ? WHERE id_previa IN ($placeholders)";
    $stUp = $pdo->prepare($sqlUp);
    $params = array_merge([$nota_int, $fecha_nota], $ids_a_actualizar);
    $stUp->execute($params);
  }

  $affected = (int)$stUp->rowCount();
  $pdo->commit();

  out(true, [
    'id_previa_real' => $id_previa_real,
    'resolved_by' => $resolved_by,

    'bulk_aplicado' => $bulk_aplicado,
    'grupo_resuelto' => [
      'numero_mesa' => $grupo_numero ?: null,
      'fecha_mesa'  => ($grupo_fecha !== '' ? $grupo_fecha : null),
      'id_turno'    => ($grupo_turno > 0 ? $grupo_turno : null),
    ],
    'dni_usado' => ($dni_db_digits !== '' ? $dni_db_digits : null),
    'ids_previas_actualizadas' => $ids_a_actualizar,

    'nota' => $limpiar ? null : $nota_int,
    'fecha_nota' => $limpiar ? null : $fecha_nota,
    'rowCount' => $affected,
    'mensaje' => $limpiar ? 'Nota eliminada.' : 'Nota guardada.',
    'aclaracion' => 'rowCount puede ser 0 si ya tenía esos valores (MySQL no cuenta cambios).',
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  error_log('[agregar_nota] ' . $e->getMessage());
  out(false, 'Error interno: ' . $e->getMessage(), 500);
}