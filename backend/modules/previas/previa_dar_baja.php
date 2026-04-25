<?php
// backend/modules/previas/previa_dar_baja.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

function respond(int $code, array $payload): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

function is_valid_date_ymd(string $s): bool {
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
  [$y, $m, $d] = array_map('intval', explode('-', $s));
  return checkdate($m, $d, $y);
}

try {
  if (!($pdo instanceof PDO)) {
    throw new RuntimeException('Conexión PDO no disponible.');
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $data = json_decode(file_get_contents('php://input') ?: '[]', true);
  if (!is_array($data)) $data = [];

  $id = (int)($data['id_previa'] ?? 0);
  if ($id <= 0) respond(400, ['exito' => false, 'mensaje' => 'ID inválido']);

  $tipo = strtoupper(trim((string)($data['tipo_motivo'] ?? '')));
  $motivo_baja_in = trim((string)($data['motivo_baja'] ?? ''));
  $motivo_otro = trim((string)($data['motivo_otro'] ?? ''));
  $fecha_baja_in = trim((string)($data['fecha_baja'] ?? ''));

  if ($tipo === '') {
    $mb = mb_strtoupper($motivo_baja_in);

    if ($mb === 'APROBÓ' || $mb === 'APROBO') {
      $tipo = 'APROBO_DIA';
    } elseif ($mb === 'PASE A OTRO COLEGIO') {
      $tipo = 'PASE_OTRO_COLEGIO';
    } elseif ($mb !== '') {
      $tipo = 'OTRO';
      $motivo_otro = $motivo_baja_in;
    }
  }

  if ($tipo === 'APROBO_DIA') {
    $motivo_final = 'APROBÓ';

    if ($fecha_baja_in === '' || !is_valid_date_ymd($fecha_baja_in)) {
      respond(400, ['exito' => false, 'mensaje' => 'Falta o es inválida la fecha para APROBÓ EL DÍA']);
    }

    $fecha_final = $fecha_baja_in;

  } elseif ($tipo === 'PASE_OTRO_COLEGIO') {
    $motivo_final = 'PASE A OTRO COLEGIO';
    $fecha_final = date('Y-m-d');

  } elseif ($tipo === 'OTRO') {
    $txt = trim($motivo_otro !== '' ? $motivo_otro : $motivo_baja_in);

    if ($txt === '') {
      respond(400, ['exito' => false, 'mensaje' => 'El motivo OTRO es obligatorio']);
    }

    $motivo_final = mb_strtoupper(mb_substr($txt, 0, 255));
    $fecha_final = date('Y-m-d');

  } else {
    respond(400, ['exito' => false, 'mensaje' => 'tipo_motivo inválido']);
  }

  $pdo->beginTransaction();

  $stmt = $pdo->prepare("SELECT * FROM previas WHERE id_previa = :id LIMIT 1 FOR UPDATE");
  $stmt->execute([':id' => $id]);
  $p = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$p) {
    $pdo->rollBack();
    respond(404, ['exito' => false, 'mensaje' => 'No se encontró la previa activa.']);
  }

  $insert = $pdo->prepare("
    INSERT INTO previas_historial (
      dni,
      alumno,
      cursando_id_curso,
      cursando_id_division,
      id_materia,
      materia_id_curso,
      materia_id_division,
      id_condicion,
      nota,
      fecha_nota,
      inscripcion,
      activo,
      anio,
      fecha_carga,
      fecha_baja,
      motivo_baja
    ) VALUES (
      :dni,
      :alumno,
      :cursando_id_curso,
      :cursando_id_division,
      :id_materia,
      :materia_id_curso,
      :materia_id_division,
      :id_condicion,
      :nota,
      :fecha_nota,
      0,
      0,
      :anio,
      :fecha_carga,
      :fecha_baja,
      :motivo_baja
    )
  ");

  $insert->execute([
    ':dni' => $p['dni'],
    ':alumno' => $p['alumno'],
    ':cursando_id_curso' => $p['cursando_id_curso'],
    ':cursando_id_division' => $p['cursando_id_division'],
    ':id_materia' => $p['id_materia'],
    ':materia_id_curso' => $p['materia_id_curso'],
    ':materia_id_division' => $p['materia_id_division'],
    ':id_condicion' => $p['id_condicion'],
    ':nota' => $p['nota'],
    ':fecha_nota' => $p['fecha_nota'],
    ':anio' => $p['anio'],
    ':fecha_carga' => $p['fecha_carga'],
    ':fecha_baja' => $fecha_final,
    ':motivo_baja' => $motivo_final,
  ]);

  $del = $pdo->prepare("DELETE FROM previas WHERE id_previa = :id LIMIT 1");
  $del->execute([':id' => $id]);

  $pdo->commit();

  respond(200, [
    'exito' => true,
    'mensaje' => 'Previa movida al historial correctamente.',
    'motivo_guardado' => $motivo_final,
    'fecha_baja' => $fecha_final,
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }

  respond(500, [
    'exito' => false,
    'mensaje' => $e->getMessage(),
  ]);
}