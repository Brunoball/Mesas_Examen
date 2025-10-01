<?php
// Lista de docentes dados de baja (activo = 0)
// Devuelve: id_profesor, apellido, nombre, fecha_baja (YYYY-MM-DD), motivo

require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Solo los inactivos
    $sql = "
        SELECT
            d.id_docente,
            d.docente,                  -- 'APELLIDO, NOMBRE'
            d.fecha_carga AS fecha_baja,
            d.motivo
        FROM mesas_examen.docentes d
        WHERE d.activo = 0
        ORDER BY d.docente ASC
    ";
    $st = $pdo->query($sql);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $out = [];
    foreach ($rows as $r) {
        $docente = trim($r['docente'] ?? '');

        // Separar 'APELLIDO, NOMBRE'
        $apellido = $docente;
        $nombre   = '';
        if (strpos($docente, ',') !== false) {
            [$ap, $no] = explode(',', $docente, 2);
            $apellido = trim($ap);
            $nombre   = trim($no);
        }

        // Normalizar fecha (si viniera nula)
        $fecha_baja = $r['fecha_baja'] ?? null;
        if ($fecha_baja && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_baja) !== 1) {
            // Forzar a YYYY-MM-DD si fuera otro formato
            $d = new DateTime($fecha_baja);
            $fecha_baja = $d ? $d->format('Y-m-d') : null;
        }

        $out[] = [
            'id_profesor' => (int)$r['id_docente'],
            'apellido'    => $apellido,
            'nombre'      => $nombre,
            'fecha_baja'  => $fecha_baja,             // usado por la UI (ProfesorBaja.jsx)
            'ingreso'     => $fecha_baja,             // compatibilidad: la UI también usa este nombre
            'motivo'      => $r['motivo'] ?? '',
        ];
    }

    echo json_encode([
        'exito'      => true,
        'profesores' => $out,
        'cantidad'   => count($out),
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al obtener profesores dados de baja: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
