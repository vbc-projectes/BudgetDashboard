const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { spawnSync } = require('child_process');

const packageJsonPath = path.join(process.cwd(), 'package.json');
const distPath = path.join(process.cwd(), 'dist');
const releaseNotesPath = path.join(process.cwd(), 'release-notes.json');

function run(command, args) {
  const prettyCommand = `${command} ${args.join(' ')}`;
  console.log(`\n> ${prettyCommand}`);

  let executable = command;
  let executableArgs = args;

  if (process.platform === 'win32' && command === 'npm') {
    executable = 'cmd.exe';
    executableArgs = ['/d', '/s', '/c', 'npm', ...args];
  }

  const result = spawnSync(executable, executableArgs, {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(`Error ejecutando: ${prettyCommand}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Fallo (${result.status || 1}) en: ${prettyCommand}`);
    process.exit(result.status || 1);
  }
}

function hasStagedChangesFor(filePath) {
  const result = spawnSync('git', ['diff', '--cached', '--quiet', '--', filePath], {
    stdio: 'ignore',
    shell: false,
  });

  return result.status === 1;
}

function stageReleaseNotesIfPresent() {
  if (fs.existsSync(releaseNotesPath)) {
    run('git', ['add', 'release-notes.json']);
  }
}

function incrementVersion(version, bumpType) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Version invalida en package.json: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (bumpType === 'major') {
    return `${major + 1}.0.0`;
  }

  if (bumpType === 'minor') {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

async function askQuestion(prompt, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`${prompt}${suffix}: `)).trim();
    return answer || defaultValue;
  } finally {
    rl.close();
  }
}

async function askList(title) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(`\n${title}`);
    console.log('Introduce una linea por elemento. Pulsa Enter en blanco para terminar.');

    const items = [];
    while (true) {
      const answer = (await rl.question(`- `)).trim();
      if (!answer) {
        break;
      }
      items.push(answer);
    }

    return items;
  } finally {
    rl.close();
  }
}

async function askBumpType() {
  while (true) {
    const answer = (await askQuestion('Tipo de subida de version (patch/minor/major)', 'patch')).toLowerCase();
    if (['patch', 'minor', 'major'].includes(answer)) {
      return answer;
    }

    console.log('Valor no valido. Usa patch, minor o major.');
  }
}

function writeReleaseNotes(newFeatures, bugFixes) {
  let staticInstructions = '';
  if (fs.existsSync(releaseNotesPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(releaseNotesPath, 'utf8'));
      if (typeof existing.Instructions === 'string') {
        staticInstructions = existing.Instructions;
      }
    } catch {
      staticInstructions = '';
    }
  }

  const content = {
    Instructions: staticInstructions,
    newFeatures,
    bugFixes,
  };

  fs.writeFileSync(releaseNotesPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function tagExistsLocal(tag) {
  const result = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    stdio: 'ignore',
    shell: false,
  });

  return result.status === 0;
}

function tagExistsRemote(tag) {
  const result = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], {
    encoding: 'utf8',
    shell: false,
  });

  if (result.error || result.status !== 0) {
    return false;
  }

  return Boolean((result.stdout || '').trim());
}

function getNextAvailableVersion(currentVersion, bumpType) {
  let candidateVersion = incrementVersion(currentVersion, bumpType);
  let candidateTag = `v${candidateVersion}`;

  while (tagExistsLocal(candidateTag) || tagExistsRemote(candidateTag)) {
    candidateVersion = incrementVersion(candidateVersion, bumpType);
    candidateTag = `v${candidateVersion}`;
  }

  return candidateVersion;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function killAppProcesses() {
  const processes = ['DashboardEconomic.exe', 'electron.exe', 'Electron.exe'];
  for (const proc of processes) {
    spawnSync('taskkill', ['/F', '/IM', proc, '/T'], { shell: false });
  }
}

function cleanPreviousBuilds() {
  if (!fs.existsSync(distPath)) return;

  console.log('\nCerrando procesos Electron antes de limpiar...');
  killAppProcesses();
  sleep(2000);

  console.log(`Limpiando builds anteriores en: ${distPath}`);
  try {
    fs.rmSync(distPath, { recursive: true, force: true });
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      console.warn(`Archivos aún bloqueados (${err.code}), reintentando en 3 segundos...`);
      sleep(3000);
      try {
        fs.rmSync(distPath, { recursive: true, force: true });
      } catch {
        console.warn('No se pudo limpiar dist/ completamente. Continuando de todos modos...');
      }
    } else {
      throw err;
    }
  }
}

const DOCKER_USER = 'cpachecoperello';
const DOCKER_IMAGE = `${DOCKER_USER}/dashboardeconomic`;

function buildAndPushDocker(version) {
  const tagVersioned = `${DOCKER_IMAGE}:${version}`;
  const tagLatest = `${DOCKER_IMAGE}:latest`;

  console.log(`\nConstruyendo imagen Docker: ${tagVersioned}`);
  run('docker', ['build', '-t', tagVersioned, '-t', tagLatest, '.']);

  console.log(`\nPublicando imagen: ${tagVersioned}`);
  run('docker', ['push', tagVersioned]);

  console.log(`\nPublicando imagen: ${tagLatest}`);
  run('docker', ['push', tagLatest]);

  console.log(`Imagen Docker publicada: ${tagVersioned}`);
}

async function main() {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('No se encontro package.json en la raiz del proyecto.');
  }

  const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageData.version;
  const bumpType = await askBumpType();
  const newFeatures = await askList('New features');
  const bugFixes = await askList('Bug fixes');
  const nextVersion = getNextAvailableVersion(currentVersion, bumpType);
  const tag = `v${nextVersion}`;

  packageData.version = nextVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageData, null, 2)}\n`, 'utf8');
  writeReleaseNotes(newFeatures, bugFixes);

  console.log(`Version actual: ${currentVersion}`);
  console.log(`Nueva version: ${nextVersion}`);
  if (nextVersion !== incrementVersion(currentVersion, bumpType)) {
    console.log(`Se detectaron tags existentes, se uso el siguiente ${bumpType} disponible.`);
  }

  cleanPreviousBuilds();

  run('npm', ['run', 'dist']);

  run('git', ['add', 'package.json']);
  stageReleaseNotesIfPresent();

  if (hasStagedChangesFor('package.json') || hasStagedChangesFor('release-notes.json')) {
    run('git', ['commit', '-m', `chore: version ${nextVersion}`]);
  } else {
    console.warn('No hay cambios en package.json ni en release-notes.json para commitear. Se continua sin commit.');
  }

  run('git', ['tag', tag]);
  run('git', ['push', 'origin']);
  run('git', ['push', 'origin', tag]);

  buildAndPushDocker(nextVersion);

  console.log(`Proceso completado. Tag publicado: ${tag}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
