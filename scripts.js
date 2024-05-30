/* Auxiliary scripts for use in package.json scripts */

const fs = require('fs');
const path = require('path');

const PACKAGE = require(path.join(__dirname, 'package.json'));

const banner = [
    `/**`,
    ` * ${PACKAGE.name}`,
    ` * @version ${PACKAGE.version}`,
    ` * @link ${PACKAGE.homepage}`,
    ` * @license ${PACKAGE.license}`,
    ` */`,
    //
].join('\n');

function removeFiles(...paths) {
    for (const path of paths) {
        fs.rmSync(path, { recursive: true, force: true });
    }
}

function addBanner(file) {
    if (!fs.existsSync(file)) return;
    const contents = [banner, fs.readFileSync(file, { encoding: 'utf8' })];
    fs.writeFileSync(file, contents.join('\n\n'), { encoding: 'utf8' });
}

const scripts = {
    /** Add a banner with version info to the built files */
    'add-banners': () => {
        addBanner(`build/${PACKAGE.name}.js`);
        addBanner(`build/${PACKAGE.name}.js.LICENSE.txt`);
        addBanner(`build/${PACKAGE.name}.css`);
    },

    /** Move a file */
    'mv': (src, dest) => {
        if (src === undefined) throw new Error('`src` parameter missing');
        if (dest === undefined) throw new Error('`dest` parameter missing');
        console.log('Moving file:', src, '->', dest);
        fs.renameSync(src, dest);
    },

    /** Remove files */
    'rm': (...paths) => {
        console.log('Removing files:', paths);
        removeFiles(...paths);
    },
};

// Parse command-line arguments
const [_node, _file, scriptName, ...params] = process.argv;

// Check if script name is provided and valid
if (!(scriptName in scripts)) {
    console.error(`usage: scripts.js [-h] {${Object.keys(scripts).join(',')}} [params ...]`);
    console.error(`scripts.js: error: argument script_name: invalid choice: ${scriptName} (choose from ${Object.keys(scripts).join(', ')})`);
    process.exit(2);
}

// Run selected script
scripts[scriptName](...params);
