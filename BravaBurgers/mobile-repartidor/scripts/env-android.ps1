# Ejecutar antes de gradlew en PowerShell:  . .\scripts\env-android.ps1
$jdk = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
if (Test-Path $jdk) {
	$env:JAVA_HOME = $jdk
}
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"
Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
