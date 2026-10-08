import { buildFakeUiServer } from "./fake-ui-server.js";

const app = buildFakeUiServer();
const port = Number(process.env.FAKE_UI_PORT ?? 3001);

try {
  await app.listen({ host: "127.0.0.1", port });
  app.log.info(`Fake AI UI listening on http://127.0.0.1:${port}/fake-ai`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}