const path = require('path');

const compatHook = path.join(__dirname, 'node25-fs-compat.cjs');
const isAffectedRuntime =
  process.platform === 'win32' && Number(process.versions.node.split('.')[0]) >= 25;

function quoteNodeOption(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

if (isAffectedRuntime) {
  require(compatHook);

  const hookOption = `--require ${quoteNodeOption(compatHook)}`;
  const existingOptions = process.env.NODE_OPTIONS || '';
  if (!existingOptions.includes(compatHook)) {
    process.env.NODE_OPTIONS = `${existingOptions} ${hookOption}`.trim();
  }
}

process.argv = [
  process.argv[0],
  require.resolve('next/dist/bin/next'),
  ...process.argv.slice(2),
];

require('next/dist/bin/next');
