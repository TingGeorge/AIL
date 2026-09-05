// Own both processes so Ctrl-C never leaves a hidden API server behind.
const port = process.env.PORT || "3000";
const api = Bun.spawn([process.execPath, "run", "--watch", "src/server/index.ts"], { stdio: ["inherit", "inherit", "inherit"] });
const ui = Bun.spawn([process.execPath, "run", "--bun", "vite"], {
  stdio: ["inherit", "inherit", "inherit"], env: { ...process.env, AIL_API_PORT: port },
});
let closing = false;
function stop() { if (closing) return; closing = true; api.kill(); ui.kill(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const code = await Promise.race([api.exited, ui.exited]);
stop();
await Promise.allSettled([api.exited, ui.exited]);
process.exit(code);
