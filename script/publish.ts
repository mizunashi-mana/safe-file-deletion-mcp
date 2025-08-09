import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify, parseArgs } from 'node:util';

const execFileAsync = promisify(execFile);

// Default branch name - change this if your repository uses a different default branch
const DEFAULT_BRANCH = 'main';

interface Options {
  dryRun: boolean;
}

async function gitTag(version: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`→ Would run: git tag v${version}`);
    return;
  }

  await execFileAsync('git', ['tag', `v${version}`]);
  console.log(`✓ Created git tag v${version}`);
}

async function checkCurrentBranch(): Promise<void> {
  const { stdout } = await execFileAsync('git', ['branch', '--show-current']);
  const currentBranch = stdout.trim();

  if (currentBranch !== DEFAULT_BRANCH) {
    console.error(`Error: Currently on branch '${currentBranch}'. Please switch to '${DEFAULT_BRANCH}' branch before publishing.`);
    throw new Error(`Not on ${DEFAULT_BRANCH} branch. Current branch: ${currentBranch}`);
  }

  console.log(`✓ Currently on ${DEFAULT_BRANCH} branch`);

  // Fetch latest default branch from origin
  console.log(`→ Fetching latest ${DEFAULT_BRANCH} branch from origin...`);
  await execFileAsync('git', ['fetch', 'origin', DEFAULT_BRANCH]);

  // Check if local default branch is behind origin
  try {
    const { stdout: behindCount } = await execFileAsync('git', ['rev-list', '--count', `${DEFAULT_BRANCH}..origin/${DEFAULT_BRANCH}`]);
    const behind = parseInt(behindCount.trim(), 10);

    if (behind > 0) {
      console.error(`Error: Local ${DEFAULT_BRANCH} branch is ${behind} commit(s) behind origin/${DEFAULT_BRANCH}. Please pull the latest changes first.`);
      throw new Error(`Local ${DEFAULT_BRANCH} branch is behind origin/${DEFAULT_BRANCH} by ${behind} commit(s)`);
    }

    console.log(`✓ Local ${DEFAULT_BRANCH} branch is up to date with origin/${DEFAULT_BRANCH}`);
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('unknown revision')) {
      console.log(`✓ No origin/${DEFAULT_BRANCH} found (likely first push)`);
    }
    else {
      throw error;
    }
  }
}

async function checkGitTagExists(version: string): Promise<boolean> {
  // First, fetch the specific tag from remote
  try {
    console.log(`→ Fetching tag v${version} from remote...`);
    await execFileAsync('git', ['fetch', 'origin', 'tag', `v${version}`]);
  }
  catch {
    // Tag doesn't exist on remote, which is fine
  }

  // Then check if tag exists locally (which now includes remote tags we just fetched)
  try {
    await execFileAsync('git', ['rev-parse', `v${version}`]);
    return true;
  }
  catch {
    return false;
  }
}

async function npmPublish(dryRun: boolean): Promise<void> {
  const args = ['publish'];
  if (dryRun) {
    args.push('--dry-run');
  }

  console.log(`→ Running: npm ${args.join(' ')}`);
  const { stdout } = await execFileAsync('npm', args);
  console.log(stdout);
}

async function gitPushTag(version: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`→ Would run: git push origin v${version}`);
    return;
  }

  await execFileAsync('git', ['push', 'origin', `v${version}`]);
  console.log('✓ Pushed tag to origin');
}

function loadPackageJson() {
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
  const packageJsonRaw: unknown = JSON.parse(packageJsonContent);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Assuming package.json has a specific structure
  return packageJsonRaw as {
    name: string;
    version: string;
  };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'dry-run': {
        type: 'boolean',
        default: false,
        short: 'd',
      },
      'help': {
        type: 'boolean',
        short: 'h',
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help === true) {
    console.log(`Usage: publish.ts [options]

Options:
  -d, --dry-run        Run without making actual changes
  -h, --help          Show this help message

Example:
  ./script/publish.ts
  ./script/publish.ts --dry-run`);
    return;
  }

  const packageJson = loadPackageJson();

  const version = packageJson.version;

  const options: Options = {
    dryRun: values['dry-run'],
  };

  console.log(`Current package version: ${version}`);

  // Check current branch
  await checkCurrentBranch();

  // Check for uncommitted changes
  const { stdout: gitStatus } = await execFileAsync('git', ['status', '--porcelain']);
  if (gitStatus.trim() !== '') {
    console.error('Error: Working directory has uncommitted changes. Please commit or stash changes before publishing.');
    throw new Error('Working directory has uncommitted changes');
  }

  // Check if tag already exists
  const tagExists = await checkGitTagExists(version);
  if (tagExists) {
    console.error(`\nError: Git tag v${version} already exists. Please update the version in package.json first.`);
    throw new Error(`Git tag v${version} already exists`);
  }

  console.log(`\nPublishing version ${version}${options.dryRun ? ' (dry run)' : ''}\n`);

  await npmPublish(options.dryRun);
  await gitTag(version, options.dryRun);
  await gitPushTag(version, options.dryRun);

  if (!options.dryRun) {
    console.log('\n✓ Release completed successfully!');
    console.log(`\n✓ Published ${packageJson.name}@${version} to npm`);
    console.log(`✓ Created and pushed git tag v${version}`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error('\nError:', error.message);
  }
  else {
    console.error('\nError:', error);
  }
  process.exit(1);
});
