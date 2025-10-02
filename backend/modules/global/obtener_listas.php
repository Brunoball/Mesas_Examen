<?php
// backend/modules/global/obtener_listas.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $listas = [
        'areas'       => [],
        'cargos'      => [],
        'condiciones' => [],
        'cursos'      => [],
        'divisiones'  => [],
        'turnos'      => [],   // 🔹 agregado para la nueva tabla
    ];

    // AREAS
    $sql = "SELECT id_area AS id, area AS nombre
            FROM areas
            ORDER BY area ASC";
    foreach ($pdo->query($sql, PDO::FETCH_ASSOC) as $row) {
        $listas['areas'][] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    // CARGOS
    $sql = "SELECT id_cargo AS id, cargo AS nombre
            FROM cargos
            ORDER BY cargo ASC";
    foreach ($pdo->query($sql, PDO::FETCH_ASSOC) as $row) {
        $listas['cargos'][] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    // CONDICIONES
    $sql = "SELECT id_condicion AS id, condicion AS nombre
            FROM condicion
            ORDER BY condicion ASC";
    foreach ($pdo->query($sql, PDO::FETCH_ASSOC) as $row) {
        $listas['condiciones'][] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    // CURSOS - EXCLUYENDO id_curso = 8
    $sql = "SELECT id_curso AS id, nombre_curso AS nombre
            FROM curso
            WHERE id_curso != 8
            ORDER BY nombre_curso ASC";
    foreach ($pdo->query($sql, PDO::FETCH_ASSOC) as $row) {
        $listas['cursos'][] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    // DIVISIONES
    $sql = "SELECT id_division AS id, nombre_division AS nombre
            FROM division
            ORDER BY nombre_division ASC";
    foreach ($pdo->query($sql, PDO::FETCH_ASSOC) as $row) {
        $listas['divisiones'][] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    // TURNOS 🔹 nuevo bloque
    $sql = "SELECT id_turno AS id, turno AS nombre
            FROM turnos
            ORDER BY turno ASC";
    foreach ($pdo->query($sql, PDO::FETCH_ASSOC) as $row) {
        $listas['turnos'][] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    echo json_encode(['exito' => true, 'listas' => $listas], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
