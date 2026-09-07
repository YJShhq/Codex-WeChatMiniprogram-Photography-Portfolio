param([string]$Source = ".\待处理图片")
$ErrorActionPreference = "Stop"
$python = "C:\Users\hhq20\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not (Test-Path -LiteralPath $Source)) { New-Item -ItemType Directory -Path $Source | Out-Null; Write-Host "已创建待处理图片文件夹，请把照片放进去后再次运行。"; exit }
$script = @'
from PIL import Image, ImageOps
from pathlib import Path
import io, sys, re
src, dest = Path(sys.argv[1]), Path(sys.argv[2])
dest.mkdir(parents=True, exist_ok=True)
for n, p in enumerate([x for x in src.iterdir() if x.suffix.lower() in {'.jpg','.jpeg','.png'}], 1):
    im = ImageOps.exif_transpose(Image.open(p)).convert('RGB'); im.thumbnail((1200,1200), Image.Resampling.LANCZOS)
    data = None
    for q in range(82,43,-3):
        b=io.BytesIO(); im.save(b,'JPEG',quality=q,optimize=True,progressive=True)
        if b.tell() <= 185*1024: data=b.getvalue(); break
    if data is None:
        b=io.BytesIO(); im.thumbnail((960,960),Image.Resampling.LANCZOS); im.save(b,'JPEG',quality=55,optimize=True,progressive=True); data=b.getvalue()
    name = re.sub(r'[^a-zA-Z0-9_-]+','-',p.stem).strip('-') or f'work-{n}'
    out=dest/(name+'.jpg'); out.write_bytes(data); print(f'{out.name}  {len(data)//1024} KB')
'@
$tempScript = Join-Path $env:TEMP "chengmu-image-import.py"
Set-Content -LiteralPath $tempScript -Value $script -Encoding UTF8
& $python $tempScript $Source ".\images"
Remove-Item -LiteralPath $tempScript -Force
Write-Host "处理完成。请在 data\works.js 中添加作品信息。"
