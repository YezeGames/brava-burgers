# Genera BRAVA-BURGERS-Pedilo.xlsx con pestañas productos y configuracion
param(
  [string]$OutPath = (Join-Path $PSScriptRoot "BRAVA-BURGERS-Pedilo.xlsx"),
  [string]$ProductosCsv = (Join-Path $PSScriptRoot "brava-productos.csv"),
  [string]$ConfigCsv = (Join-Path $PSScriptRoot "brava-configuracion.csv")
)

function Import-CsvRows {
  param([string]$Path)
  Import-Csv -Path $Path -Encoding UTF8
}

$productos = Import-CsvRows $ProductosCsv
$config = Import-CsvRows $ConfigCsv

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Add()

  # Eliminar hojas extra (Excel suele crear 3)
  while ($wb.Worksheets.Count -gt 1) {
    $wb.Worksheets.Item($wb.Worksheets.Count).Delete()
  }

  $wsProd = $wb.Worksheets.Item(1)
  $wsProd.Name = "productos"

  $headers = $productos[0].PSObject.Properties.Name
  for ($c = 0; $c -lt $headers.Count; $c++) {
    $wsProd.Cells.Item(1, $c + 1).Value2 = $headers[$c]
  }
  $r = 2
  foreach ($row in $productos) {
    for ($c = 0; $c -lt $headers.Count; $c++) {
      $h = $headers[$c]
      $wsProd.Cells.Item($r, $c + 1).Value2 = [string]$row.$h
    }
    $r++
  }

  $wsCfg = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wsProd)
  $wsCfg.Name = "configuracion"
  $wsCfg.Cells.Item(1, 1).Value2 = "Nombre"
  $wsCfg.Cells.Item(1, 2).Value2 = "Valor"
  $r = 2
  foreach ($row in $config) {
    $wsCfg.Cells.Item($r, 1).Value2 = [string]$row.Nombre
    $wsCfg.Cells.Item($r, 2).Value2 = [string]$row.Valor
    $r++
  }

  $wsProd.Columns.AutoFit() | Out-Null
  $wsCfg.Columns.AutoFit() | Out-Null

  if (Test-Path $OutPath) { Remove-Item $OutPath -Force }
  $wb.SaveAs($OutPath, 51) # xlOpenXMLWorkbook
  $wb.Close($false)
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  Write-Host "OK: $OutPath"
  exit 0
}
catch {
  Write-Host "Excel COM no disponible: $($_.Exception.Message)"
  exit 1
}
