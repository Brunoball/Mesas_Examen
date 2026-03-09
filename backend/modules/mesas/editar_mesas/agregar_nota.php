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

function norm_str($v): string {
  return trim((string)($v ?? ''));
}

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

function curso_division_label($curso, $division): string {
  $cursoTxt = trim((string)($curso ?? ''));
  $divTxt   = trim((string)($division ?? ''));

  if ($cursoTxt === '' && $divTxt === '') return '-';
  if ($cursoTxt !== '' && $divTxt !== '') return $cursoTxt . '° ' . $divTxt;
  if ($cursoTxt !== '') return $cursoTxt . '°';
  return $divTxt;
}

/**
 * Busca correlativas siguientes bloqueadas para una previa desaprobada.
 * Regla:
 * - mismo alumno (mismo DNI)
 * - mismo grupo de correlativa (materias.correlativa igual)
 * - la desaprobada debe ser la anterior (menor materia_id_curso / division)
 * - si nota 1..6 => bloquea la/s siguiente/s
 */
function buscar_aviso_correlativa(PDO $pdo, int $idPreviaBase): array {
  $sqlBase = "
    SELECT
      p.id_previa,
      p.dni,
      p.alumno,
      p.id_materia,
      p.materia_id_curso,
      p.materia_id_division,
      p.nota,
      m.materia,
      m.correlativa
    FROM previas p
    INNER JOIN materias m ON m.id_materia = p.id_materia
    WHERE p.id_previa = :id_previa
    LIMIT 1
  ";
  $stBase = $pdo->prepare($sqlBase);
  $stBase->execute([':id_previa' => $idPreviaBase]);
  $base = $stBase->fetch(PDO::FETCH_ASSOC);

  if (!$base) return [];

  $nota = isset($base['nota']) && $base['nota'] !== null && $base['nota'] !== ''
    ? (int)$base['nota']
    : null;

  if ($nota === null || $nota < 1 || $nota > 6) {
    return [];
  }

  $correlativa = $base['correlativa'] ?? null;
  if ($correlativa === null || $correlativa === '') {
    return [];
  }

  $cursoBase = (int)($base['materia_id_curso'] ?? 0);
  $divisionBase = (int)($base['materia_id_division'] ?? 0);

  $sql = "
    SELECT
      p2.id_previa,
      p2.alumno,
      p2.dni,
      p2.id_materia,
      p2.materia_id_curso,
      p2.materia_id_division,
      p2.nota,
      m2.materia,
      me.numero_mesa,
      me.fecha_mesa,
      me.id_turno
    FROM previas p2
    INNER JOIN materias m2 ON m2.id_materia = p2.id_materia
    LEFT JOIN mesas me ON me.id_previa = p2.id_previa
    WHERE p2.id_previa <> :id_previa
      AND p2.activo = 1
      AND p2.dni = :dni
      AND m2.correlativa = :correlativa
      AND (
            p2.materia_id_curso > :curso_base
         OR (
              p2.materia_id_curso = :curso_base
              AND COALESCE(p2.materia_id_division, 0) > :division_base
            )
      )
    ORDER BY
      p2.materia_id_curso ASC,
      COALESCE(p2.materia_id_division, 0) ASC,
      p2.id_previa ASC
  ";

  $st = $pdo->prepare($sql);
  $st->execute([
    ':id_previa' => $idPreviaBase,
    ':dni' => (string)$base['dni'],
    ':correlativa' => $correlativa,
    ':curso_base' => $cursoBase,
    ':division_base' => $divisionBase,
  ]);

  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  $out = [];

  foreach ($rows as $r) {
    $out[] = [
      'id_previa_bloqueada' => (int)$r['id_previa'],
      'alumno' => (string)$base['alumno'],
      'dni' => (string)$base['dni'],
      'materia_desaprobada' => (string)$base['materia'],
      'curso_desaprobado' => curso_division_label(
        $base['materia_id_curso'] ?? null,
        $base['materia_id_division'] ?? null
      ),
      'materia_bloqueada' => (string)$r['materia'],
      'curso_bloqueado' => curso_division_label(
        $r['materia_id_curso'] ?? null,
        $r['materia_id_division'] ?? null
      ),
      'numero_mesa_bloqueada' => isset($r['numero_mesa']) ? (int)$r['numero_mesa'] : null,
      'fecha_mesa_bloqueada' => $r['fecha_mesa'] ?? null,
      'id_turno_bloqueado' => isset($r['id_turno']) ? (int)$r['id_turno'] : null,
      'motivo' => 'Correlativa anterior desaprobada',
    ];
  }

  return $out;
}

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    out(false, 'Conexión PDO no disponible.', 500);
  }

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
    $nota_int = (int)trim((string)$nota_raw);
    if ($nota_int < 1 || $nota_int > 10) {
      out(false, 'La nota debe estar entre 1 y 10, o vacío para limpiar.', 400);
    }
  }

  // ✅ Regla FINAL:
  // - Si nota >= 7 => activo=0 e inscripcion=0
  // - Si nota <= 6 => activo=1 e inscripcion=1
  // - Si limpiar   => no tocar activo/inscripcion
  $aprobo = (!$limpiar && $nota_int !== null && $nota_int >= 7);

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

    if (!empty($ctx['numero_mesa'])) {
      $where[] = "numero_mesa = :num";
      $bind[':num'] = (int)$ctx['numero_mesa'];
    }

    if (!empty($ctx['fecha_mesa'])) {
      $f = (string)$ctx['fecha_mesa'];
      if ($f !== '' && validar_fecha($f)) {
        $where[] = "fecha_mesa = :f";
        $bind[':f'] = $f;
      }
    }

    if (!empty($ctx['id_turno'])) {
      $where[] = "id_turno = :t";
      $bind[':t'] = (int)$ctx['id_turno'];
    }

    if (!empty($ctx['id_catedra'])) {
      $where[] = "id_catedra = :c";
      $bind[':c'] = (int)$ctx['id_catedra'];
    }

    if (!empty($ctx['id_docente'])) {
      $where[] = "id_docente = :d";
      $bind[':d'] = (int)$ctx['id_docente'];
    }

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
        if ($anio > 0) {
          $where .= " AND p.anio = :anio";
          $bind[':anio'] = $anio;
        }

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
  // ✅ BULK REAL
  // =========================================================

  // 1) DNI real de la previa resuelta
  $stDni = $pdo->prepare("SELECT dni FROM previas WHERE id_previa = ? LIMIT 1");
  $stDni->execute([$id_previa_real]);
  $dni_db = (string)($stDni->fetchColumn() ?? '');
  $dni_db_digits = only_digits($dni_db);

  // 2) Grupo mesa
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
    // limpiar nota/fecha, NO tocar activo/inscripcion
    $sqlUp = "UPDATE previas SET nota = NULL, fecha_nota = NULL WHERE id_previa IN ($placeholders)";
    $stUp = $pdo->prepare($sqlUp);
    $stUp->execute($ids_a_actualizar);
  } else {
    if ($aprobo) {
      $sqlUp = "UPDATE previas SET nota = ?, fecha_nota = ?, activo = 0, inscripcion = 0 WHERE id_previa IN ($placeholders)";
      $stUp = $pdo->prepare($sqlUp);
      $params = array_merge([$nota_int, $fecha_nota], $ids_a_actualizar);
      $stUp->execute($params);
    } else {
      $sqlUp = "UPDATE previas SET nota = ?, fecha_nota = ?, activo = 1, inscripcion = 1 WHERE id_previa IN ($placeholders)";
      $stUp = $pdo->prepare($sqlUp);
      $params = array_merge([$nota_int, $fecha_nota], $ids_a_actualizar);
      $stUp->execute($params);
    }
  }

  $affected = (int)$stUp->rowCount();

  // ✅ Buscar avisos correlativos ANTES del commit final
  $avisos_correlativa = [];
  if (!$limpiar && !$aprobo) {
    foreach ($ids_a_actualizar as $idPreviaActualizada) {
      $items = buscar_aviso_correlativa($pdo, (int)$idPreviaActualizada);
      if ($items) {
        foreach ($items as $it) {
          $key = (string)($it['id_previa_bloqueada'] ?? 0);
          if ($key !== '0') {
            $avisos_correlativa[$key] = $it;
          }
        }
      }
    }
    $avisos_correlativa = array_values($avisos_correlativa);
  }

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
    'aprobo_nota_>=7' => ($limpiar ? null : $aprobo),
    'estado_aplicado' => $limpiar
      ? 'sin_cambios_en_estado'
      : ($aprobo ? 'activo=0,inscripcion=0' : 'activo=1,inscripcion=1'),

    'rowCount' => $affected,
    'mensaje' => $limpiar
      ? 'Nota eliminada.'
      : ($aprobo
          ? 'Nota guardada (>=7). Se marcó como finalizada (activo=0, inscripcion=0).'
          : 'Nota guardada (<=6). Sigue vigente (activo=1, inscripcion=1).'),

    'aviso_correlativa' => $avisos_correlativa,

    'aclaracion' => 'rowCount puede ser 0 si ya tenía esos valores (MySQL no cuenta cambios).',
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }
  error_log('[agregar_nota] ' . $e->getMessage());
  out(false, 'Error interno: ' . $e->getMessage(), 500);
}