// npm run dev:mock: starts the mock API and the Vite dev server configured to use it.
import { createServer as createViteServer } from "vite";
import { createMockServer } from "./server.js";

const MOCK_PORT = Number(process.env.MOCK_API_PORT || 8787);
const WEB_PORT = Number(process.env.MOCK_WEB_PORT || 5173);

await createMockServer().listen(MOCK_PORT);
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`;

const vite = await createViteServer({ server: { port: WEB_PORT, strictPort: true } });
await vite.listen();

console.log(`\nWhisperBox with the MOCK API (demo and local tests only, data is lost on exit)`);
console.log(`  Mock API: http://127.0.0.1:${MOCK_PORT}`);
vite.printUrls();
