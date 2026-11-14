// Owner-run deployment helper. Credentials remain in process memory, never files/logs.
import { spawnSync } from 'node:child_process';
const owner = 'kklausmeyer-gmail';
const repo = 'honey-money';
const credentials = spawnSync('git', ['credential', 'fill'], {
  input: `protocol=https\nhost=github.com\nusername=${owner}\n\n`,
  encoding: 'utf8',
  windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
});
if (credentials.status !== 0) {
  console.error('GitHub authentication is unavailable. Enable Pages manually under repository Settings > Pages > GitHub Actions.');
  process.exit(1);
}
const fields = Object.fromEntries(credentials.stdout.trim().split(/\r?\n/).map(line => {
  const pos = line.indexOf('=');
  return [line.slice(0, pos), line.slice(pos + 1)];
}));
if (!fields.password) { console.error('No GitHub credential is available.'); process.exit(1); }
const headers = {
  Authorization: `Bearer ${fields.password}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Honey-Money-Owner-Setup',
};
const endpoint = `https://api.github.com/repos/${owner}/${repo}`;
async function request(path, method = 'GET', body) {
  const response = await fetch(endpoint + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  if (response.status !== 204) data = await response.json();
  return { response, data };
}
try {
  let pages = await request('/pages');
  if (pages.response.status === 404) pages = await request('/pages', 'POST', { build_type: 'workflow' });
  else if (pages.response.ok && pages.data.build_type !== 'workflow') pages = await request('/pages', 'PUT', { build_type: 'workflow' });
  if (!pages.response.ok) {
    console.error(`Pages setup failed (${pages.response.status}): ${pages.data.message || 'Check repository permissions.'}`);
    process.exit(1);
  }
  console.log(`Pages enabled with GitHub Actions: ${pages.data.html_url || `https://${owner}.github.io/${repo}/`}`);
  const run = await request('/actions/workflows/pages.yml/dispatches', 'POST', { ref: 'main' });
  if (!run.response.ok) {
    console.error(`Could not start deployment (${run.response.status}): ${run.data.message || 'Run the workflow manually.'}`);
    process.exit(1);
  }
  console.log('Deployment workflow started.');
} catch {
  console.error('GitHub setup request failed. Check the network and repository permissions.');
  process.exit(1);
}
