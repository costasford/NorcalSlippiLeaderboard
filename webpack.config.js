const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const CnameWebpackPlugin = require('cname-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const settings = require('./settings');

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const entry = path.join(__dirname, './src/index.tsx');
const port = 8262;
const output = path.join(__dirname, './dist');
const publicPath = mode === 'production' ? settings.repoPath || '/' : '/';
const ogImageUrl = settings.repoPath ? `${settings.repoPath}og-image.png` : null;

// Emits a static file into the output directory unchanged, without
// pulling in copy-webpack-plugin for the one asset (the Open Graph
// preview image) that needs a stable URL outside of webpack's normal
// content-hashed asset pipeline.
class CopyStaticFilePlugin {
  constructor(from, to) {
    this.from = from;
    this.to = to;
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap('CopyStaticFilePlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'CopyStaticFilePlugin', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          compilation.emitAsset(this.to, new webpack.sources.RawSource(fs.readFileSync(this.from)));
        },
      );
    });
  }
}

module.exports = (env = {}) => ({

  mode,
  optimization: {
    minimizer: [new TerserJSPlugin({})],
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },

  devServer: {
    port,
    compress: true,
    static: {
      directory: output,
    },
    hot: true,
    historyApiFallback: true,
    open: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https://slp-rank.herokuapp.com; img-src 'self' data:; font-src 'self' data:"
    },
    allowedHosts: ['localhost', '.localhost', '127.0.0.1']
  },

  devtool: mode === 'production' ? false : 'eval',

  entry:
    mode === 'production'
      ? entry
      : [
          `webpack-dev-server/client?http://localhost:${port}`,
          'webpack/hot/only-dev-server',
          entry,
        ],

  output: {
    path: output,
    filename: mode === 'production' ? '[name].[contenthash].js' : '[name].js',
    chunkFilename: mode === 'production' ? '[name].[contenthash].chunk.js' : '[name].chunk.js',
    publicPath,
  },

  resolve: {
    modules: [path.join(__dirname, './node_modules')],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },

  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        include: path.join(__dirname, './src'),
        use: 'ts-loader',
      },
      {
        test: /\.(svg|png|jpg|gif|woff|woff2|otf|ttf|eot)$/,
        type: 'asset/resource',
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader', 'sass-loader'],
      },
      {
        test: /node_modules\/https-proxy-agent\//,
        use: 'null-loader',
      },
    ],
  },

  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(mode),
      },
    }),
    new HtmlWebpackPlugin({
      favicon: path.join(__dirname, './favicon.png'),
      templateContent: ({ htmlWebpackPlugin }) => `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>${settings.title}</title>
            <meta name="description" content="${settings.description}">
            <meta property="og:type" content="website">
            <meta property="og:title" content="${settings.title}">
            <meta property="og:description" content="${settings.description}">
            ${settings.repoPath ? `<meta property="og:url" content="${settings.repoPath}">` : ''}
            ${ogImageUrl ? `
            <meta property="og:image" content="${ogImageUrl}">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">` : ''}
            <meta name="twitter:card" content="${ogImageUrl ? 'summary_large_image' : 'summary'}">
            <meta name="twitter:title" content="${settings.title}">
            <meta name="twitter:description" content="${settings.description}">
            ${ogImageUrl ? `<meta name="twitter:image" content="${ogImageUrl}">` : ''}
          </head>
          <body class="bg-gray-600">
            <noscript>
              Enable JavaScript to use Frontend toolbox
            </noscript>

            <div id="app"></div>
            ${htmlWebpackPlugin.tags.bodyTags}
          </body>
        </html>
      `,
    }),
    new CopyStaticFilePlugin(path.join(__dirname, './images/og-image.png'), 'og-image.png'),
    ...(mode !== 'production'
      ? [new webpack.HotModuleReplacementPlugin()]
      : [...(settings.cname ? [new CnameWebpackPlugin({ domain: settings.cname })] : [])]),
    ...(env.analyze ? [new BundleAnalyzerPlugin()] : []),
  ],
});
