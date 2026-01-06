# Pinball Territory War 打包脚本
# 用途：打包游戏文件以便在其他电脑上运行

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Pinball Territory War 打包工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在项目根目录
if (-not (Test-Path "package.json")) {
    Write-Host "错误：请在项目根目录运行此脚本！" -ForegroundColor Red
    exit 1
}

# 创建临时目录
$tempDir = ".\temp_package"
if (Test-Path $tempDir) {
    Remove-Item -Path $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Host "正在复制文件..." -ForegroundColor Yellow

# 复制必需文件
$filesToCopy = @(
    "index.html",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    ".env.local",
    "App.tsx",
    "types.ts"
)

foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination $tempDir -Force
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (文件不存在，已跳过)" -ForegroundColor Yellow
    }
}

# 复制 services 目录
if (Test-Path "services") {
    Copy-Item -Path "services" -Destination "$tempDir\" -Recurse -Force
    Write-Host "  ✓ services/ (包含 engine.ts)" -ForegroundColor Green
}

# 复制 node_modules（可选）
$includeNodeModules = Read-Host "是否包含 node_modules 文件夹？(Y/N，推荐N)"
if ($includeNodeModules -eq "Y" -or $includeNodeModules -eq "y") {
    if (Test-Path "node_modules") {
        Copy-Item -Path "node_modules" -Destination "$tempDir\" -Recurse -Force
        Write-Host "  ✓ node_modules/" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "正在创建压缩包..." -ForegroundColor Yellow

# 创建压缩包
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$zipFileName = "pinball-territory-war_$timestamp.zip"
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFileName -Force

Write-Host "  ✓ 压缩包已创建: $zipFileName" -ForegroundColor Green

# 清理临时目录
Remove-Item -Path $tempDir -Recurse -Force

Write-Host ""
Write-Host "正在生成部署说明..." -ForegroundColor Yellow

# 生成部署说明
$readmeContent = @"
# Pinball Territory War 部署说明

## 文件说明
- index.html: HTML 入口文件
- package.json: 项目依赖配置
- package-lock.json: 依赖版本锁定
- tsconfig.json: TypeScript 配置
- vite.config.ts: Vite 构建工具配置
- .env.local: 环境变量（包含 API 密钥）
- App.tsx: 主应用组件
- types.ts: TypeScript 类型定义
- services/engine.ts: 游戏引擎核心逻辑
- node_modules/: 项目依赖（如果包含）

## 在目标电脑上运行

### 1. 解压文件
将压缩包解压到目标目录

### 2. 安装依赖
在项目根目录打开 PowerShell，执行：
\`\`\`powershell
npm install
\`\`\`

### 3. 配置环境变量
确保 .env.local 文件包含：
\`\`\`
GEMINI_API_KEY=your_api_key_here
\`\`\`

### 4. 运行开发服务器
\`\`\`powershell
npm run dev
\`\`\`

### 5. 访问游戏
打开浏览器访问：http://localhost:3000

## 系统要求
- Node.js 18 或更高版本
- PowerShell
- 现代浏览器（Chrome、Firefox、Edge 等）

## 常见问题

### Q: npm install 失败怎么办？
A: 检查网络连接，或尝试使用国内镜像：
\`\`\`powershell
npm config set registry https://registry.npmmirror.com
npm install
\`\`\`

### Q: 端口 3000 被占用怎么办？
A: 开发服务器会自动切换到其他可用端口（如 3001）

### Q: 游戏无法运行怎么办？
A: 检查：
1. Node.js 版本是否符合要求
2. .env.local 文件是否存在且配置正确
3. 所有依赖是否成功安装

## 构建生产版本（可选）

如果需要构建生产版本：
\`\`\`powershell
npm run build
\`\`\`

构建完成后，dist 文件夹包含所有生产文件，可以使用任何静态服务器运行。

---

打包时间: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

$readmeFileName = "README_DEPLOYMENT.md"
$readmeContent | Out-File -FilePath $readmeFileName -Encoding UTF8

Write-Host "  ✓ 部署说明已创建: $readmeFileName" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  打包完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "生成的文件：" -ForegroundColor White
Write-Host "  - $zipFileName (压缩包)" -ForegroundColor Cyan
Write-Host "  - $readmeFileName (部署说明)" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步：" -ForegroundColor White
Write-Host "  1. 将 $zipFileName 复制到目标电脑" -ForegroundColor Yellow
Write-Host "  2. 在目标电脑上解压" -ForegroundColor Yellow
Write-Host "  3. 按照 $readmeFileName 中的说明运行游戏" -ForegroundColor Yellow
Write-Host ""