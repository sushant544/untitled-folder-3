const http = require('http');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const port = Number(process.env.PORT || 8000);

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(body);
}

function serveFile(response, fileName, contentType) {
  const filePath = path.join(__dirname, fileName);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(response, 404, { error: 'Page not found.' });
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(data);
  });
}

function getAnswer(data) {
  if (data.output_text) return data.output_text;
  return (data.output || []).flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text' && item.text)
    .map(item => item.text).join('\n').trim();
}

async function askOpenAI(response, request) {
  let body = '';
  request.on('data', chunk => {
    body += chunk;
    if (body.length > 100_000) request.destroy();
  });

  request.on('end', async () => {
    try {
      const { question } = JSON.parse(body);
      const apiKey = process.env.OPENAI_API_KEY;
      if (typeof question !== 'string' || !question.trim()) {
        sendJson(response, 400, { error: 'Please enter a question.' });
        return;
      }
      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        sendJson(response, 503, {
          error: 'OPENAI_API_KEY is missing. Add it to .env and restart the server.'
        });
        return;
      }

      const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          input: question.trim(),
          instructions: 'Answer clearly and briefly. Do not invent sources.'
        })
      });

      const result = await openAIResponse.json();
      if (!openAIResponse.ok) {
        sendJson(response, openAIResponse.status, {
          error: result.error?.message || 'OpenAI request failed.'
        });
        return;
      }

      sendJson(response, 200, {
        answer: getAnswer(result) || 'The model returned no answer.'
      });
    } catch (error) {
      sendJson(response, 400, { error: 'Invalid request.' });
    }
  });
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/ask') {
    askOpenAI(response, request);
    return;
  }

  if (request.method === 'GET' && (request.url === '/' || request.url === '/bro.html')) {
    serveFile(response, 'bro.html', 'text/html; charset=utf-8');
    return;
  }

  if (request.method === 'GET' && request.url === '/bro.css') {
    serveFile(response, 'bro.css', 'text/css; charset=utf-8');
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(port, 'localhost', () => {
  console.log(`Open http://localhost:${port}/bro.html`);
});
