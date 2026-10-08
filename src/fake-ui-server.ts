import Fastify, { type FastifyInstance } from "fastify";

const fakeAiHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Fake AI</title></head>
  <body>
    <main>
      <h1>Fake AI</h1>
      <div data-testid="provider-status">ready</div>
      <section data-testid="transcript" aria-live="polite"></section>
      <textarea data-testid="prompt-input" aria-label="Prompt"></textarea>
      <button data-testid="send-button" type="button">Send</button>
      <button data-testid="stop-button" type="button" hidden>Stop</button>
    </main>
    <script>
      const status = document.querySelector('[data-testid="provider-status"]');
      const transcript = document.querySelector('[data-testid="transcript"]');
      const input = document.querySelector('[data-testid="prompt-input"]');
      const send = document.querySelector('[data-testid="send-button"]');
      const stop = document.querySelector('[data-testid="stop-button"]');
      let timer;
      stop.addEventListener('click', () => {
        clearInterval(timer);
        status.textContent = 'ready';
        stop.hidden = true;
        send.disabled = false;
      });
      send.addEventListener('click', () => {
        const prompt = input.value;
        if (!prompt) return;
        const user = document.createElement('div');
        user.dataset.role = 'user';
        user.textContent = prompt;
        transcript.appendChild(user);
        const assistant = document.createElement('div');
        assistant.dataset.role = 'assistant';
        transcript.appendChild(assistant);
        status.textContent = 'generating';
        send.disabled = true;
        stop.hidden = false;
        const answer = 'Fake response: ' + prompt;
        let index = 0;
        timer = setInterval(() => {
          assistant.textContent = answer.slice(0, ++index);
          if (index >= answer.length) {
            clearInterval(timer);
            status.textContent = 'ready';
            stop.hidden = true;
            send.disabled = false;
          }
        }, 2);
      });
    </script>
  </body>
</html>`;

export function buildFakeUiServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/fake-ai", async (_request, reply) => reply.type("text/html").send(fakeAiHtml));
  return app;
}