03:42:29.347 Running build in Washington, D.C., USA (East) – iad1
03:42:29.348 Build machine configuration: 2 cores, 8 GB
03:42:29.576 Cloning github.com/finance229/accubooks (Branch: main, Commit: af8c808)
03:42:30.047 Cloning completed: 471.000ms
03:42:31.193 Restored build cache from previous deployment (9JTbxj6A4i8gan1uw4wX4q7MHsGk)
03:42:31.394 Running "vercel build"
03:42:31.409 Vercel CLI 54.7.1
03:42:31.882 Installing dependencies...
03:42:39.286 
03:42:39.286 up to date in 7s
03:42:39.287 
03:42:39.287 10 packages are looking for funding
03:42:39.287   run `npm fund` for details
03:42:39.327 Running "npm run build"
03:42:39.435 
03:42:39.435 > accubooks@1.0.0 build
03:42:39.436 > vite build
03:42:39.436 
03:42:39.794 vite v5.4.21 building for production...
03:42:39.881 transforming...
03:42:40.259 ✓ 19 modules transformed.
03:42:40.260 x Build failed in 425ms
03:42:40.261 error during build:
03:42:40.262 [vite:esbuild] Transform failed with 1 error:
03:42:40.262 /vercel/path0/src/pages/Invoices.tsx:343:76: ERROR: Expected identifier but found "\\"
03:42:40.262 file: /vercel/path0/src/pages/Invoices.tsx:343:76
03:42:40.262 
03:42:40.262 Expected identifier but found "\\"
03:42:40.262 341|              <tbody className="divide-y divide-border">
03:42:40.263 342|                {loading ? (
03:42:40.263 343|                  <tr><td colSpan={6} className="text-center py-8">Loading...<\/td></tr>
03:42:40.263    |                                                                              ^
03:42:40.263 344|                ) : (
03:42:40.263 345|                  filteredInvoices.map((invoice) => (
03:42:40.263 
03:42:40.264     at failureErrorWithLog (/vercel/path0/node_modules/esbuild/lib/main.js:1472:15)
03:42:40.264     at /vercel/path0/node_modules/esbuild/lib/main.js:755:50
03:42:40.264     at responseCallbacks.<computed> (/vercel/path0/node_modules/esbuild/lib/main.js:622:9)
03:42:40.264     at handleIncomingPacket (/vercel/path0/node_modules/esbuild/lib/main.js:677:12)
03:42:40.264     at Socket.readFromStdout (/vercel/path0/node_modules/esbuild/lib/main.js:600:7)
03:42:40.264     at Socket.emit (node:events:509:28)
03:42:40.264     at addChunk (node:internal/streams/readable:563:12)
03:42:40.265     at readableAddChunkPushByteMode (node:internal/streams/readable:514:3)
03:42:40.265     at Readable.push (node:internal/streams/readable:394:5)
03:42:40.265     at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
03:42:40.283 Error: Command "npm run build" exited with 1
