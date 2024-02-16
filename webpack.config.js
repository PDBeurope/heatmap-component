const path = require('path');
const webpack = require('webpack');
const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const PACKAGE_ROOT_PATH = process.cwd();
const PACKAGE = require(path.join(PACKAGE_ROOT_PATH, 'package.json'));

/** Webpack configuration for building the plugin bundle (pdbe-molstar-plugin-*.js, pdbe-molstar-*.css).
 * Also builds the light-skin version (pdbe-molstar-light-plugin-*.js, pdbe-molstar-light-*.css). */
const molstarConfig = {
    entry: {
        [PACKAGE.name]: path.resolve(__dirname, 'lib/index.js'),
    },
    output: {
        path: path.resolve(__dirname, 'build/'),
    },
    target: 'web',
    module: {
        rules: [
            {
                test: /\.(html|ico)$/,
                use: [
                    {
                        loader: 'file-loader',
                        options: { name: '[name].[ext]' },
                    },
                ],
            },
            {
                test: /\.(s*)css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    { loader: 'css-loader', options: { sourceMap: false } },
                    { loader: 'sass-loader', options: { sourceMap: false } },
                ],
            },
        ],
    },
    plugins: [
        new ExtraWatchWebpackPlugin({
            files: ['./lib/**/*.scss', './lib/**/*.html'],
        }),
        new webpack.DefinePlugin({
            'process.env.DEBUG': JSON.stringify(process.env.DEBUG),
            __MOLSTAR_DEBUG_TIMESTAMP__: webpack.DefinePlugin.runtimeValue(() => `${new Date().valueOf()}`, true),
        }),
        new MiniCssExtractPlugin({
            filename: `[name]-${PACKAGE.version}.css`,
        }),
    ],
    resolve: {
        modules: ['node_modules', path.resolve(__dirname, 'lib/')],
        fallback: {
            // fs: false,
            // crypto: require.resolve('crypto-browserify'),
            // path: require.resolve('path-browserify'),
            // stream: require.resolve('stream-browserify'),
        },
        alias: {
            Molstar: 'molstar/lib',
        },
    },
    watchOptions: {
        aggregateTimeout: 750,
    },
};

module.exports = [molstarConfig];
