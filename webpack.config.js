const { resolve } = require('path');
var glob = require('glob');
var path = require('path');
const http = require('http');
const https = require('https');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ESBuildMinifyPlugin } = require('esbuild-loader');
const { ProvidePlugin, BannerPlugin } = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

const isProd = process.env.NODE_ENV === 'production';
const isDevelopment = !isProd;

const SANDBOX_SUFFIX = '-sandbox';
const LOCAL_PROXY_PATH = '/__reader_translator_proxy__';
const DEFAULT_CORS_ALLOW_HEADERS =
  'Authorization, Content-Type, X-TC-Action, X-TC-Timestamp, X-TC-Version, X-TC-Region, Baggage, Sentry-Trace';

function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      resolveBody(Buffer.concat(chunks));
    });
    req.on('error', rejectBody);
  });
}

function shouldForwardRequestHeader(headerName) {
  return ![
    'accept-encoding',
    'connection',
    'content-length',
    'host',
    'origin',
    'referer',
  ].includes(headerName.toLowerCase());
}

function shouldForwardResponseHeader(headerName) {
  return !['connection', 'transfer-encoding'].includes(headerName.toLowerCase());
}

function applyProxyCorsHeaders(req, res) {
  const requestedHeaders = req.headers['access-control-request-headers'];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    typeof requestedHeaders === 'string' && requestedHeaders.trim()
      ? requestedHeaders
      : DEFAULT_CORS_ALLOW_HEADERS
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function proxyLocalDevelopmentRequest(req, res) {
  applyProxyCorsHeaders(req, res);
  res.setHeader('X-Reader-Translator-Proxy', '1');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, 'http://localhost:8080');
  const targetUrl = requestUrl.searchParams.get('url');

  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Missing target url.' }));
    return;
  }

  let parsedTargetUrl;

  try {
    parsedTargetUrl = new URL(targetUrl);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Invalid target url.' }));
    return;
  }

  if (!['http:', 'https:'].includes(parsedTargetUrl.protocol)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Unsupported target protocol.' }));
    return;
  }

  const body = await readRequestBody(req);
  const headers = Object.entries(req.headers).reduce((acc, [name, value]) => {
    if (!shouldForwardRequestHeader(name) || value == null) {
      return acc;
    }

    acc[name] = Array.isArray(value) ? value.join(', ') : value;
    return acc;
  }, {});

  if (body.length > 0) {
    headers['content-length'] = String(body.length);
  }

  const requestClient = parsedTargetUrl.protocol === 'https:' ? https : http;

  const proxyRequest = requestClient.request(
    {
      protocol: parsedTargetUrl.protocol,
      hostname: parsedTargetUrl.hostname,
      port: parsedTargetUrl.port || undefined,
      path: `${parsedTargetUrl.pathname}${parsedTargetUrl.search}`,
      method: req.method,
      headers,
    },
    (proxyResponse) => {
      res.statusCode = proxyResponse.statusCode ?? 502;

      Object.entries(proxyResponse.headers).forEach(([name, value]) => {
        if (value == null || !shouldForwardResponseHeader(name)) {
          return;
        }

        res.setHeader(name, value);
      });

      proxyResponse.pipe(res);
    }
  );

  proxyRequest.on('error', (error) => {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: `Local proxy request failed: ${error.message}` }));
  });

  if (body.length > 0) {
    proxyRequest.write(body);
  }

  proxyRequest.end();
}

const config = {
  mode: isProd ? 'production' : 'development',
  entry: glob.sync('./src/widgets/**/*.tsx').reduce((obj, el) => {
    const rel = path
      .relative('src/widgets', el)
      .replace(/\.[tj]sx?$/, '')
      .replace(/\\/g, '/');

    obj[rel] = el;
    obj[`${rel}${SANDBOX_SUFFIX}`] = el;
    return obj;
  }, {}),

  output: {
    path: resolve(__dirname, 'dist'),
    filename: `[name].js`,
    publicPath: '',
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|jsx|js)?$/,
        loader: 'esbuild-loader',
        options: {
          loader: 'tsx',
          target: 'es2020',
          minify: false,
        },
      },
      {
        test: /\.css$/i,
        use: [
          {
            loader: 'style-loader',
            options: {
              attributes: {
                'data-reader-translator-style': 'true',
              },
            },
          },
          { loader: 'css-loader', options: { url: false } },
          'postcss-loader',
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      templateContent: `
      <body></body>
      <script type="text/javascript">
      const urlSearchParams = new URLSearchParams(window.location.search);
      const queryParams = Object.fromEntries(urlSearchParams.entries());
      const widgetName = queryParams["widgetName"];
      if (widgetName == undefined) {document.body.innerHTML+="Widget ID not specified."}

      const s = document.createElement('script');
      s.type = "module";
      s.src = widgetName+"${SANDBOX_SUFFIX}.js";
      document.body.appendChild(s);
      </script>
    `,
      filename: 'index.html',
      inject: false,
    }),
    new ProvidePlugin({
      React: 'react',
      reactDOM: 'react-dom',
    }),
    new BannerPlugin({
      banner: (file) => {
        return !file.chunk.name.includes(SANDBOX_SUFFIX) ? 'const IMPORT_META=import.meta;' : '';
      },
      raw: true,
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '' },
        { from: 'README.md', to: '' },
      ],
    }),
  ].filter(Boolean),
};

if (isProd) {
  config.optimization = {
    minimize: isProd,
    minimizer: [new ESBuildMinifyPlugin()],
  };
} else {
  // for more information, see https://webpack.js.org/configuration/dev-server
  config.devServer = {
    port: 8080,
    open: true,
    hot: false,
    liveReload: true,
    compress: true,
    watchFiles: ['src/*'],
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': DEFAULT_CORS_ALLOW_HEADERS,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    },
    setupMiddlewares: (middlewares, devServer) => {
      if (devServer?.app) {
        devServer.app.all(LOCAL_PROXY_PATH, (req, res) => {
          void proxyLocalDevelopmentRequest(req, res).catch((error) => {
            res.statusCode = 500;
            res.setHeader('X-Reader-Translator-Proxy', '1');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: `Local proxy crashed: ${error.message}` }));
          });
        });
      }

      return middlewares;
    },
  };
}

module.exports = config;
