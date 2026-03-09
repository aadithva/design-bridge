/**
 * Test the MCP server by sending JSON-RPC requests directly.
 * This simulates what Agency would do when calling our tools.
 */
import { spawn, ChildProcess } from 'child_process';

const FIGMA_URL = process.argv[2] || "https://www.figma.com/design/Esphat9JFXGwqegUNBOblh/Inline-Citation?node-id=2106-41972";

async function sendJsonRpc(proc: ChildProcess, method: string, params: any, id: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = JSON.stringify({ jsonrpc: '2.0', method, params, id });
    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.id === id) {
            proc.stdout!.off('data', onData);
            resolve(parsed);
          }
        } catch {}
      }
    };

    proc.stdout!.on('data', onData);
    proc.stdin!.write(request + '\n');

    setTimeout(() => {
      proc.stdout!.off('data', onData);
      reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
    }, 120_000);
  });
}

async function main() {
  console.log('=== MCP Server Integration Test ===\n');

  console.log('[1] Starting MCP server...');
  const proc = spawn('node', ['dist/mcp-server.js'], {
    env: {
      ...process.env,
      FIGMA_API_TOKEN: process.env.FIGMA_API_TOKEN,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stderr!.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) console.log(`    [stderr] ${msg}`);
  });

  await new Promise(r => setTimeout(r, 1000));

  // Initialize
  console.log('[2] Sending initialize...');
  const initResp = await sendJsonRpc(proc, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' },
  }, 1);
  console.log(`    ✅ Server: ${initResp.result?.serverInfo?.name} v${initResp.result?.serverInfo?.version}`);

  // Send initialized notification
  proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // List tools
  console.log('\n[3] Listing tools...');
  const toolsResp = await sendJsonRpc(proc, 'tools/list', {}, 2);
  const tools = toolsResp.result?.tools || [];
  console.log(`    ✅ ${tools.length} tools registered:`);
  for (const t of tools) {
    console.log(`       - ${t.name}: ${(t.description || '').substring(0, 60)}...`);
  }

  // Call get_figma_design_spec with real URL
  console.log(`\n[4] Calling get_figma_design_spec with real Figma URL...`);
  console.log(`    URL: ${FIGMA_URL}`);
  const startTime = Date.now();

  const specResp = await sendJsonRpc(proc, 'tools/call', {
    name: 'get_figma_design_spec',
    arguments: { figma_url: FIGMA_URL },
  }, 3);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (specResp.result?.content?.[0]?.text) {
    const data = JSON.parse(specResp.result.content[0].text);
    if (data.error) {
      console.log(`    ❌ Error: ${data.error}`);
    } else {
      console.log(`    ✅ Design spec retrieved in ${elapsed}s`);
      console.log(`    POR Page: "${data.porPage.pageName}" (confidence: ${data.porPage.confidence})`);
      console.log(`    Summary:`);
      console.log(`       Colors: ${data.summary.uniqueColors}`);
      console.log(`       Typography: ${data.summary.typographyStyles}`);
      console.log(`       Spacing: ${data.summary.spacingValues}`);
      console.log(`       Border radius: ${data.summary.borderRadiusValues}`);
      console.log(`       Components: ${data.summary.componentTypes}`);

      if (data.tokens.colors.length > 0) {
        console.log(`\n    Sample colors (first 5):`);
        for (const c of data.tokens.colors.slice(0, 5)) {
          console.log(`       ${c.hex} — ${c.source.substring(0, 80)}`);
        }
      }
      if (data.tokens.components.length > 0) {
        console.log(`\n    Top components:`);
        for (const c of data.tokens.components.slice(0, 8)) {
          console.log(`       ${c.name} (×${c.instanceCount})`);
        }
      }
    }
  } else {
    console.log(`    ❌ Unexpected response:`, JSON.stringify(specResp).substring(0, 200));
  }

  // Stop the server
  proc.stdin!.end();
  proc.unref();
  setTimeout(() => process.exit(0), 500);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
