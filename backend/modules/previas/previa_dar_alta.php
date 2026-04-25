<?php
// backend/modules/previas/previa_dar_alta.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
  if (!($pdo instanceof PDO)) {
    throw new RuntimeException('Conexión PDO no disponible.');
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $data = json_decode(file_get_contents('php://input') ?: '[]', true);
  if (!is_array($data)) $data = [];

  $id_previa = (int)($data['id_previa'] ?? 0);
  $fecha_alta = trim((string)($data['fecha_alta'] ?? ''));

  if ($id_previa <= 0) {
    throw new InvalidArgumentException('id_previa inválido.');
  }

  if ($fecha_alta === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_alta)) {
    throw new InvalidArgumentException('fecha_alta inválida. Formato esperado: YYYY-MM-DD');
  }

  $pdo->beginTransaction();

  $stmt = $pdo->prepare("SELECT * FROM previas_historial WHERE id_previa = :id LIMIT 1 FOR UPDATE");
  $stmt->execute([':id' => $id_previa]);
  $p = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$p) {
    throw new RuntimeException('No se encontró la previa en historial.');
  }

  $insert = $pdo->prepare("
    INSERT INTO previas (
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
      1,
      :anio,
      :fecha_carga,
      NULL,
      NULL
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
    ':fecha_carga' => $fecha_alta,
  ]);

  $nuevoId = (int)$pdo->lastInsertId();

  $del = $pdo->prepare("DELETE FROM previas_historial WHERE id_previa = :id LIMIT 1");
  $del->execute([':id' => $id_previa]);

  $pdo->commit();

  echo json_encode([
    'exito' => true,
    'mensaje' => 'Previa restaurada correctamente.',
    'nuevo_id_previa' => $nuevoId
  ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }

  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error al dar de alta: ' . $e->getMessage()
  ], JSON_UNESCAPED_UNICODE);
}