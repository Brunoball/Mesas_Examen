<?php
// backend/modules/mesas/mesa_crear_grupo_unico.php
//
// Crea un registro en `mesas_grupos` usando una mesa existente
// que estaba “no agrupada”.
// - numero_mesa_1 = numero_mesa recibido
// - numero_mesa_2/3/4 = 0
// - fecha_mesa / id_turno tomados del POST
// - hora tomada de mesas_no_agrupadas (si existe registro)
//
// Opcionalmente limpia `mesas_no_agrupadas` si existe.
//

header("Content-Type: application/json; charset=utf-8");

try {
    require_once __DIR__ . '/../../../config/db.php';

    if ($_SERVER["REQUEST_METHOD"] !== "POST") {
        throw new Exception("Método no permitido.");
    }

    $raw  = file_get_contents("php://input");
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        throw new Exception("JSON inválido.");
    }

    $numero_mesa = isset($data["numero_mesa"]) ? (int)$data["numero_mesa"] : 0;
    $fecha_mesa  = $data["fecha_mesa"] ?? null;
    $id_turno    = isset($data["id_turno"]) ? (int)$data["id_turno"] : 0;

    if ($numero_mesa <= 0) {
        throw new Exception("Número de mesa inválido.");
    }
    if (!$fecha_mesa || !$id_turno) {
        throw new Exception("Faltan datos obligatorios (fecha o turno).");
    }

    // 1) Verificar que la mesa exista en `mesas`
    $sqlCheckMesa = "SELECT 1 FROM mesas WHERE numero_mesa = :num LIMIT 1";
    $st = $pdo->prepare($sqlCheckMesa);
    $st->execute([":num" => $numero_mesa]);
    if (!$st->fetchColumn()) {
        // No es estrictamente necesario, pero ayuda a evitar incoherencias
        throw new Exception("No se encontró la mesa Nº {$numero_mesa} en la tabla mesas.");
    }

    // 2) Verificar que NO esté ya en un grupo
    $sqlYaGrupo = "
        SELECT 1
        FROM mesas_grupos
        WHERE numero_mesa_1 = :num
           OR numero_mesa_2 = :num
           OR numero_mesa_3 = :num
           OR numero_mesa_4 = :num
        LIMIT 1
    ";
    $st2 = $pdo->prepare($sqlYaGrupo);
    $st2->execute([":num" => $numero_mesa]);
    if ($st2->fetchColumn()) {
        throw new Exception("La mesa Nº {$numero_mesa} ya pertenece a un grupo.");
    }

    // 3) Obtener la HORA desde mesas_no_agrupadas (si existe)
    $hora = null;
    try {
        $sqlHora = "
            SELECT hora
            FROM mesas_no_agrupadas
            WHERE numero_mesa = :num
            LIMIT 1
        ";
        $stHora = $pdo->prepare($sqlHora);
        $stHora->execute([":num" => $numero_mesa]);
        $horaDb = $stHora->fetchColumn();
        if ($horaDb !== false && $horaDb !== null && $horaDb !== '') {
            $hora = (string)$horaDb; // formato HH:MM:SS
        }
    } catch (\Throwable $eHora) {
        // Si la tabla no existe o falla, simplemente dejamos $hora = null
    }

    // 4) Insertar en mesas_grupos como "mesa única"
    //    pasando también la hora (si la tabla tiene esa columna).
    $sqlIns = "
        INSERT INTO mesas_grupos (
            numero_mesa_1,
            numero_mesa_2,
            numero_mesa_3,
            numero_mesa_4,
            fecha_mesa,
            id_turno,
            hora
        )
        VALUES (:n1, 0, 0, 0, :fecha_mesa, :id_turno, :hora)
    ";
    $stIns = $pdo->prepare($sqlIns);
    $stIns->execute([
        ":n1"         => $numero_mesa,
        ":fecha_mesa" => $fecha_mesa,
        ":id_turno"   => $id_turno,
        ":hora"       => $hora,   // puede ir null si no se encontró
    ]);

    $id_mesa_grupos = (int)$pdo->lastInsertId();

    // 5) Borrar de mesas_no_agrupadas si existe esa tabla
    try {
        $stDel = $pdo->prepare("DELETE FROM mesas_no_agrupadas WHERE numero_mesa = :num");
        $stDel->execute([":num" => $numero_mesa]);
    } catch (\Throwable $e) {
        // Si la tabla no existe o falla, simplemente lo ignoramos
    }

    echo json_encode([
        "exito"   => true,
        "mensaje" => "Mesa movida a grupo único correctamente.",
        "data"    => [
            "id_mesa_grupos" => $id_mesa_grupos,
            "numero_mesa"    => $numero_mesa,
            "fecha_mesa"     => $fecha_mesa,
            "id_turno"       => $id_turno,
            "hora"           => $hora,
        ],
    ]);
    exit;
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        "exito"   => false,
        "mensaje" => $e->getMessage(),
    ]);
    exit;
}
