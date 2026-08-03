# Crea .xlsx sin Excel (Open XML)
param(
  [string]$OutPath = (Join-Path $PSScriptRoot "BRAVA-BURGERS-Pedilo.xlsx"),
  [string]$ProductosCsv = (Join-Path $PSScriptRoot "brava-productos.csv"),
  [string]$ConfigCsv = (Join-Path $PSScriptRoot "brava-configuracion.csv")
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-Utf8File([string]$path, [string]$content) {
  [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
}

function Escape-Xml([string]$s) {
  if ($null -eq $s) { return "" }
  return [System.Security.SecurityElement]::Escape($s)
}

function Col-Letter([int]$n) {
  $s = ""
  while ($n -gt 0) {
    $n--
    $s = [char](65 + ($n % 26)) + $s
    $n = [Math]::Floor($n / 26)
  }
  return $s
}

function Csv-ToMatrix([string]$path) {
  $lines = Get-Content -Path $path -Encoding UTF8
  $rows = @()
  foreach ($line in $lines) {
    if ($line.Trim() -eq "") { continue }
    $rows += ,@(Parse-CsvLine $line)
  }
  return $rows
}

function Parse-CsvLine([string]$line) {
  $fields = New-Object System.Collections.Generic.List[string]
  $i = 0
  $cur = New-Object System.Text.StringBuilder
  $inQuotes = $false
  while ($i -lt $line.Length) {
    $ch = $line[$i]
    if ($inQuotes) {
      if ($ch -eq '"') {
        if ($i + 1 -lt $line.Length -and $line[$i + 1] -eq '"') {
          [void]$cur.Append('"')
          $i += 2
          continue
        }
        $inQuotes = $false
        $i++
        continue
      }
      [void]$cur.Append($ch)
      $i++
      continue
    }
    if ($ch -eq '"') { $inQuotes = $true; $i++; continue }
    if ($ch -eq ',') {
      $fields.Add($cur.ToString())
      [void]$cur.Clear()
      $i++
      continue
    }
    [void]$cur.Append($ch)
    $i++
  }
  $fields.Add($cur.ToString())
  return $fields.ToArray()
}

function Build-SheetXml([object[][]]$matrix) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  [void]$sb.Append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
  [void]$sb.Append('<sheetData>')
  for ($r = 0; $r -lt $matrix.Count; $r++) {
    $rowNum = $r + 1
    [void]$sb.Append("<row r=`"$rowNum`">")
    $row = $matrix[$r]
    for ($c = 0; $c -lt $row.Count; $c++) {
      $col = Col-Letter($c + 1)
      $ref = "$col$rowNum"
      $val = $row[$c]
      if ($val -match '^\d+$' -and $rowNum -gt 1 -and $col -eq 'D' -and $matrix[0][$c] -eq 'Precio') {
        [void]$sb.Append("<c r=`"$ref`"><v>$val</v></c>")
      }
      elseif ($val -match '^\d+$' -and $rowNum -gt 1 -and $matrix[0][1] -eq 'Valor' -and $col -eq 'B' -and $matrix[$r][0] -match 'Costo|Monto|Columnas') {
        [void]$sb.Append("<c r=`"$ref`"><v>$val</v></c>")
      }
      else {
        $t = Escape-Xml $val
        [void]$sb.Append("<c r=`"$ref`" t=`"inlineStr`"><is><t xml:space=`"preserve`">$t</t></is></c>")
      }
    }
    [void]$sb.Append('</row>')
  }
  [void]$sb.Append('</sheetData></worksheet>')
  return $sb.ToString()
}

$prodMatrix = Csv-ToMatrix $ProductosCsv
$cfgMatrix = Csv-ToMatrix $ConfigCsv
$sheet1 = Build-SheetXml $prodMatrix
$sheet2 = Build-SheetXml $cfgMatrix

$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("brava_xlsx_" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\_rels" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\xl\_rels" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\xl\worksheets" -Force | Out-Null

Write-Utf8File (Join-Path $tempDir '[Content_Types].xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
'@

Write-Utf8File (Join-Path $tempDir '_rels\.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
'@

Write-Utf8File (Join-Path $tempDir 'xl\workbook.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="productos" sheetId="1" r:id="rId1"/>
<sheet name="configuracion" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>
'@

Write-Utf8File (Join-Path $tempDir 'xl\_rels\workbook.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
'@

Write-Utf8File (Join-Path $tempDir 'xl\styles.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="1"><xf xfId="0"/></cellXfs>
</styleSheet>
'@

Write-Utf8File (Join-Path $tempDir 'xl\worksheets\sheet1.xml') $sheet1
Write-Utf8File (Join-Path $tempDir 'xl\worksheets\sheet2.xml') $sheet2

if (Test-Path $OutPath) { Remove-Item $OutPath -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $OutPath)
Remove-Item $tempDir -Recurse -Force
Write-Host "OK: $OutPath"
