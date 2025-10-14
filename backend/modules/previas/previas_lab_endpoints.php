<?php
// backend/modules/previas/previas_lab_endpoints.php
declare(strict_types=1);

/*
  Este endpoint usa el $pdo global que expone backend/config/db.php.
  previas_lab_utils.php ya incluye ../../config/db.php.
*/
require_once __DIR__ . '/previas_lab_utils.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Asegurarnos de tener $pdo desde db.php
if (!isset($pdo) || !($pdo instanceof PDO)) {
  json_response(false, 'No hay conexión PDO disponible (ver db.php)', 500);
}

if ($method === 'POST' && $action === 'previas_lab_import') {
  $raw = file_get_contents('php://input');
  $json = json_decode($raw, true);
  if (!is_array($json)) {
    json_response(false, 'JSON inválido', 400);
  }

  $rows   = $json['rows'] ?? [];
  $create = !empty($json['create_if_needed']);

  try {
    if ($create) {
      ensure_previas_lab($pdo);
    }
    // Inserta en el MISMO ORDEN (se procesan en el orden que vienen)
    $out = bulk_insert_previas_lab($pdo, $rows);
    json_response(true, $out);
  } catch (Throwable $e) {
    json_response(false, $e->getMessage(), 500);
  }
}

if ($method === 'POST' && $action === 'previas_lab_truncate') {
  try {
    ensure_previas_lab($pdo);
    truncate_previas_lab($pdo);
    json_response(true, ['ok' => true]);
  } catch (Throwable $e) {
    json_response(false, $e->getMessage(), 500);
  }
}

if ($method === 'POST' && $action === 'previas_lab_ensure') {
  try {
    ensure_previas_lab($pdo);
    json_response(true, ['ok' => true]);
  } catch (Throwable $e) {
    json_response(false, $e->getMessage(), 500);
  }
}

// Si no matcheó nada:
json_response(false, 'Acción no soportada', 404);
