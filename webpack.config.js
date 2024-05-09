const path = require('path');

const PACKAGE = require(path.join(__dirname, 'package.json'));

const config = {
    entry: {
        [PACKAGE.name]: path.resolve(__dirname, 'lib/index.js'),
    },
    output: {
        path: path.resolve(__dirname, 'build/'),
    },
    target: 'web',
    resolve: {
        modules: ['node_modules', path.resolve(__dirname, 'lib/')],
    },
    watchOptions: {
        aggregateTimeout: 750,
    },
};

module.exports = [config];
