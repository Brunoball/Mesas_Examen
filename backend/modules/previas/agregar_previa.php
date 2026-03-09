<?php
// backend/modules/previas/agregar_previa.php
require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode([
            'exito' => false,
            'mensaje' => 'Método no permitido'
        ]);
        exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);

    if (!is_array($in)) {
        throw new InvalidArgumentException('Datos inválidos enviados al servidor');
    }

    // -------------------------------------------------
    // Campos desde el payload
    // -------------------------------------------------
    $dni = isset($in['dni']) ? preg_replace('/\D+/', '', (string)$in['dni']) : '';

    $apellido  = isset($in['apellido']) ? trim((string)$in['apellido']) : '';
    $nombre    = isset($in['nombre']) ? trim((string)$in['nombre']) : '';
    $alumno_in = isset($in['alumno']) ? trim((string)$in['alumno']) : '';

    if ($alumno_in !== '') {
        $alumno = mb_strtoupper($alumno_in, 'UTF-8');
    } elseif ($apellido !== '' || $nombre !== '') {
        $alumno = mb_strtoupper($apellido, 'UTF-8')
            . (($apellido !== '' && $nombre !== '') ? ', ' : '')
            . mb_strtoupper($nombre, 'UTF-8');
    } else {
        $alumno = '';
    }

    // -------------------------------------------------
    // Cursado actual
    // -------------------------------------------------
    $cursando_id_curso = isset($in['cursando_id_curso']) ? (int)$in['cursando_id_curso'] : 0;

    $raw_c_div = $in['cursando_id_division'] ?? null;
    if ($cursando_id_curso === 8) {
        $cursando_id_division = null; // EGRESADO
    } else {
        if ($raw_c_div === null || $raw_c_div === '') {
            $cursando_id_division = null;
        } else {
            $tmpDiv = (int)$raw_c_div;
            $cursando_id_division = $tmpDiv > 0 ? $tmpDiv : null;
        }
    }

    // -------------------------------------------------
    // Datos de la previa
    // -------------------------------------------------
    $id_materia          = (int)($in['id_materia'] ?? 0);
    $materia_id_curso    = (int)($in['materia_id_curso'] ?? 0);
    $materia_id_division = (int)($in['materia_id_division'] ?? 0);
    $id_condicion        = (int)($in['id_condicion'] ?? 0);
    $anio                = (int)($in['anio'] ?? date('Y'));
    $inscripcion         = (int)($in['inscripcion'] ?? 0);
    $fecha_carga         = (
        isset($in['fecha_carga']) &&
        preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$in['fecha_carga'])
    )
        ? $in['fecha_carga']
        : date('Y-m-d');

    // -------------------------------------------------
    // Validaciones
    // -------------------------------------------------
    if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
        throw new InvalidArgumentException('DNI inválido');
    }

    if ($alumno === '') {
        throw new InvalidArgumentException('El nombre del alumno es obligatorio');
    }

    if ($cursando_id_curso <= 0) {
        throw new InvalidArgumentException('El curso actual es obligatorio');
    }

    if ($cursando_id_curso !== 8 && $cursando_id_division === null) {
        throw new InvalidArgumentException('La división actual es obligatoria');
    }

    if ($id_materia <= 0) {
        throw new InvalidArgumentException('La materia es obligatoria');
    }

    if ($materia_id_curso <= 0) {
        throw new InvalidArgumentException('El curso de la materia es obligatorio');
    }

    if ($materia_id_division <= 0) {
        throw new InvalidArgumentException('La división de la materia es obligatoria');
    }

    if ($id_condicion <= 0) {
        throw new InvalidArgumentException('La condición es obligatoria');
    }

    if ($anio <= 0) {
        throw new InvalidArgumentException('El año es obligatorio');
    }

    // -------------------------------------------------
    // Validación REAL de duplicado:
    // misma persona + misma materia + mismo año + mismo curso/división de la materia
    // -------------------------------------------------
    $sqlDup = "
        SELECT 
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            p.anio,
            p.materia_id_curso,
            p.materia_id_division
        FROM previas p
        WHERE p.dni = :dni
          AND p.id_materia = :id_materia
          AND p.anio = :anio
          AND p.materia_id_curso = :m_curso
          AND p.materia_id_division = :m_div
        LIMIT 1
    ";

    $stDup = $pdo->prepare($sqlDup);
    $stDup->execute([
        ':dni'        => $dni,
        ':id_materia' => $id_materia,
        ':anio'       => $anio,
        ':m_curso'    => $materia_id_curso,
        ':m_div'      => $materia_id_division,
    ]);

    $duplicada = $stDup->fetch(PDO::FETCH_ASSOC);

    if ($duplicada) {
        throw new RuntimeException(
            'Ya existe una previa cargada para este alumno en esa misma materia, año, curso y división.'
        );
    }

    // -------------------------------------------------
    // Insert
    // -------------------------------------------------
    $sql = "
        INSERT INTO previas
        (
            dni,
            alumno,
            cursando_id_curso,
            cursando_id_division,
            id_materia,
            materia_id_curso,
            materia_id_division,
            id_condicion,
            inscripcion,
            anio,
            fecha_carga
        )
        VALUES
        (
            :dni,
            :alumno,
            :c_curso,
            :c_div,
            :id_materia,
            :m_curso,
            :m_div,
            :id_cond,
            :insc,
            :anio,
            :fecha
        )
    ";

    $st = $pdo->prepare($sql);
    $st->execute([
        ':dni'        => $dni,
        ':alumno'     => $alumno,
        ':c_curso'    => $cursando_id_curso,
        ':c_div'      => $cursando_id_division,
        ':id_materia' => $id_materia,
        ':m_curso'    => $materia_id_curso,
        ':m_div'      => $materia_id_division,
        ':id_cond'    => $id_condicion,
        ':insc'       => $inscripcion ? 1 : 0,
        ':anio'       => $anio,
        ':fecha'      => $fecha_carga,
    ]);

    $id = (int)$pdo->lastInsertId();

    $q = $pdo->prepare("
        SELECT p.*
        FROM previas p
        WHERE p.id_previa = :id
        LIMIT 1
    ");
    $q->execute([':id' => $id]);
    $fila = $q->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'exito'  => true,
        'previa' => $fila
    ]);
} catch (PDOException $e) {
    $isDuplicate =
        (string)$e->getCode() === '23000' &&
        (
            stripos($e->getMessage(), '1062') !== false ||
            stripos($e->getMessage(), 'Duplicate entry') !== false ||
            stripos($e->getMessage(), 'uq_previas_natural') !== false
        );

    if ($isDuplicate) {
        http_response_code(200);
        echo json_encode([
            'exito' => false,
            'mensaje' => 'No se pudo guardar porque esa previa ya existe.'
        ]);
        exit;
    }

    http_response_code(200);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error al guardar la previa.'
    ]);
} catch (Throwable $e) {
    http_response_code(200);
    echo json_encode([
        'exito' => false,
        'mensaje' => $e->getMessage()
    ]);
}