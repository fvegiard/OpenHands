@echo off
rem Agent Canvas dev browser - Chrome on the NVIDIA dGPU (RTX 5090) with performance flags.
rem Uses a dedicated dev profile so flags always apply (Chrome ignores flags when the
rem default profile is already running) and your main profile is untouched.
rem
rem Flag rationale:
rem   --force-high-performance-gpu  force the RTX 5090 instead of the Intel iGPU
rem   --disable-gpu-sandbox         fixes "BindToCurrentSequence failed" (Sandboxed=yes)
rem                                 seen in your console; DEV-ONLY, weakens GPU isolation
rem   --ignore-gpu-blocklist        RTX 5090 is new; keep WebGL/WebGPU/raster enabled
rem   --enable-gpu-rasterization    raster on GPU
rem   --enable-zero-copy            zero-copy raster path (lower latency)
rem   --enable-unsafe-webgpu        WebGPU available for canvas/devtools experiments
start "Chrome Dev (dGPU)" "C:\Program Files\Google\Chrome Dev\Application\chrome.exe" ^
  --user-data-dir="%LOCALAPPDATA%\chromedev-canvas-profile" ^
  --force-high-performance-gpu ^
  --disable-gpu-sandbox ^
  --ignore-gpu-blocklist ^
  --enable-gpu-rasterization ^
  --enable-zero-copy ^
  --enable-unsafe-webgpu ^
  --new-window http://localhost:8000
