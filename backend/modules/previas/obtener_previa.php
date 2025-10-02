<?php
// backend/modules/previas/obtener_previa.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Solo GET
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
        exit;
    }

    // Validación
    $id = isset($_GET['id_previa']) ? (int) $_GET['id_previa'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Parámetro id_previa inválido']);
        exit;
    }

    /**
     * Esquema asumido (coincide con tu frontend):
     * - previas(id_previa, dni, alumno, cursando_id_curso, cursando_id_division,
     *           id_materia, materia_id_curso, materia_id_division,
     *           id_condicion, inscripcion, anio, fecha_carga)
     * - materias(id_materia, materia)
     * - cursos(id, nombre)
     * - divisiones(id, nombre)
     * - condicion(id_condicion, condicion)
     */
    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.cursando_id_curso,
            p.cursando_id_division,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            COALESCE(p.inscripcion, 0) AS inscripcion,
            p.anio,
            p.fecha_carga,

            -- Etiquetas para UI (alias que usa el front)
            m.materia                        AS materia_nombre,
            cond.condicion                   AS condicion_nombre,

            ccur.nombre                      AS cursando_curso_nombre,
            dcur.nombre                      AS cursando_division_nombre,

            cmat.nombre                      AS materia_curso_nombre,
            dmat.nombre                      AS materia_division_nombre

        FROM previas p
        LEFT JOIN materias   m    ON m.id_materia     = p.id_materia
        LEFT JOIN condicion  cond ON cond.id_condicion = p.id_condicion

        LEFT JOIN cursos     ccur ON ccur.id          = p.cursando_id_curso
        LEFT JOIN divisiones dcur ON dcur.id          = p.cursando_id_division

        LEFT JOIN cursos     cmat ON cmat.id          = p.materia_id_curso
        LEFT JOIN divisiones dmat ON dmat.id          = p.materia_id_division

        WHERE p.id_previa = :id
        LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $id]);
    $previa = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$previa) {
        http_response_code(404);
        echo json_encode(['exito' => false, 'mensaje' => 'No se encontró la previa solicitada']);
        exit;
    }

    echo json_encode(['exito' => true, 'previa' => $previa], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al obtener la previa: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
