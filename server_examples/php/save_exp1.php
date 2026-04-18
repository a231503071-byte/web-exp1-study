<?php
header('Content-Type: application/json; charset=utf-8');
$raw = file_get_contents('php://input');
if (!$raw) { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'empty_body'), JSON_UNESCAPED_UNICODE); exit; }
$data = json_decode($raw, true);
if ($data === null) { http_response_code(400); echo json_encode(array('ok'=>false,'error'=>'invalid_json'), JSON_UNESCAPED_UNICODE); exit; }
$subjectID = isset($data['participant']['subjectID']) ? $data['participant']['subjectID'] : 'unknown';
$groupLabel = isset($data['groupLabel']) ? $data['groupLabel'] : 'NA';
$ts = date('Y-m-d_H-i-s');
$saveDir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($saveDir)) { mkdir($saveDir, 0777, true); }
$filename = $subjectID . '_' . $groupLabel . '_' . $ts . '.json';
file_put_contents($saveDir . DIRECTORY_SEPARATOR . $filename, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo json_encode(array('ok'=>true,'saved'=>$filename), JSON_UNESCAPED_UNICODE);
?>