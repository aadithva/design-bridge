/**
 * Quick smoke test: connects to Figma API, lists files accessible with the token.
 * Usage: FIGMA_API_TOKEN=xxx npx ts-node src/test-figma.ts <figma-url>
 */
import { FigmaClient } from './services/figma/figma-client.js';

async function main() {
  const token = process.env.FIGMA_API_TOKEN;
  if (!token) {
    console.error('Set FIGMA_API_TOKEN env var');
    process.exit(1);
  }

  const url = process.argv[2];
  if (!url) {
    // Just test the API connection with a simple "me" endpoint
    const axios = (await import('axios')).default;
    try {
      const { data } = await axios.get('https://api.figma.com/v1/me', {
        headers: { 'X-Figma-Token': token },
        timeout: 10_000,
      });
      console.log('✅ Figma API connection successful!');
      console.log(`   User: ${data.handle} (${data.email})`);
      console.log(`   ID: ${data.id}`);
    } catch (err: any) {
      console.error('❌ Figma API connection failed:', err?.response?.status, err?.response?.data);
      process.exit(1);
    }
    return;
  }

  // If URL provided, fetch the file
  const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!match) {
    console.error('Invalid Figma URL');
    process.exit(1);
  }

  const fileKey = match[1];
  const client = new FigmaClient(token);

  console.log(`Fetching Figma file: ${fileKey}...`);
  try {
    const file = await client.getFile(fileKey);
    console.log('✅ File fetched successfully!');
    console.log(`   Name: ${file.name}`);
    console.log(`   Last modified: ${file.lastModified}`);
    console.log(`   Pages: ${file.document.children?.map((c: any) => c.name).join(', ')}`);
  } catch (err: any) {
    console.error('❌ Failed to fetch file:', err?.response?.status, err?.response?.data?.err ?? err.message);
    process.exit(1);
  }
}

main();
