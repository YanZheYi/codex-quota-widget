@echo off
chcp 65001 >nul
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression (Get-Content -LiteralPath '%~f0' -Encoding UTF8 | Select-Object -Skip 5 | Out-String)"
goto :EOF

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Codex Monitor - 启动开发模式 (Dev)" -ForegroundColor Cyan
Write-Host "========================================================"

$port = 3000
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connections) {
    Write-Host "检测到端口 $port 被占用！" -ForegroundColor Yellow
    $choice = Read-Host "是否强制关闭占用该端口的程序？(Y/N) [默认 Y]"
    if ([string]::IsNullOrWhiteSpace($choice) -or $choice.ToUpper() -eq 'Y') {
        foreach ($conn in $connections) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        Write-Host "已清理占用端口的程序。" -ForegroundColor Green
    } else {
        Write-Host "已取消操作，脚本退出。" -ForegroundColor Red
        exit
    }
}

Write-Host "正在初始化 MSVC 编译环境和 Rust 环境变量..." -ForegroundColor Cyan
$sysProxy = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction SilentlyContinue).ProxyServer
if ($sysProxy) {
    Write-Host "检测到 Windows 系统代理: $sysProxy，已自动注入到底层网络引擎！" -ForegroundColor Green
    $env:HTTP_PROXY = "http://$sysProxy"
    $env:HTTPS_PROXY = "http://$sysProxy"
}
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$msvcPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64"
$sdkBin = (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\x64"
$env:PATH = "$msvcPath;$sdkBin;$env:PATH"

Write-Host "正在检查并安装依赖..." -ForegroundColor Cyan
npm install

Write-Host "启动 Tauri 开发环境..." -ForegroundColor Green
npm run tauri dev

Write-Host "按任意键退出..."
[void][System.Console]::ReadKey($true)
