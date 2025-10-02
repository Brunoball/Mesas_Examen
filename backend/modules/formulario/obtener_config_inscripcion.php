<?php
// backend/modules/formulario/form_obtener_config_inscripcion.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    date_default_timezone_set('America/Argentina/Cordoba');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Traigo la activa; si no hay, la última actualizada
    $sql = "
      SELECT id_config, nombre, insc_inicio, insc_fin, mensaje_cerrado, activo,
             creado_en, actualizado_en
      FROM mesas_config
      ORDER BY activo DESC, actualizado_en DESC, id_config DESC
      LIMIT 1
    ";
    $row = $pdo->query($sql)->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        echo json_encode([
            'exito' => true,
            'hay_config' => false
        ]);
        exit;
    }

    $ahora = new DateTime('now');
    $ini   = new DateTime($row['insc_inicio']);
    $fin   = new DateTime($row['insc_fin']);
    $abierta = ($ahora >= $ini && $ahora <= $fin && (int)$row['activo'] === 1);

    echo json_encode([
        'exito' => true,
        'hay_config' => true,
        'id_config' => (int)$row['id_config'],
        'titulo' => $row['nombre'],
        'inicio' => $row['insc_inicio'],
        'fin' => $row['insc_fin'],
        'mensaje_cerrado' => $row['mensaje_cerrado'],
        'activo' => (int)$row['activo'],
        'abierta' => $abierta,
        'creado_en' => $row['creado_en'],
        'actualizado_en' => $row['actualizado_en']
    ]);

} catch (Throwable $e) {
    http_response_code(200);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error obteniendo configuración.',
        'detalle' => $e->getMessage()
    ]);
}
