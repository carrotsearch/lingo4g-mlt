process.on('uncaughtException', function(err) {
  console.log(err);
});

// Dependencies
const _        = require("lodash");
const program  = require('commander');
const connect  = require('connect');
const http     = require('http');
const url =      require('url');
const qs =       require('querystring');

const ejs =      require('ejs');

const MLTHandler = require('./handlers/mlt');
const SuggestHandler = require('./handlers/suggest.js');
const AboutHandler = require('./handlers/about');
const EmbeddingsHandler = require('./handlers/embeddings');

// Parse parameters
program
  .version("0.0.1") // TODO: replace this during build
  .option('--port [port]', 'The port to bind to.', parseInt)
  .option('--api [api-url-base]', 'The base URL of Lingo4G REST API.')
  .option('--debug', 'Print debugging information to the console.')
  .parse(process.argv);

const app = connect();
const mlt = new MLTHandler(program.api, program.debug);
const suggestHandler = new SuggestHandler(program.api, program.debug);
const about = new AboutHandler(program.api, program.debug);
const embeddings = new EmbeddingsHandler(program.api, program.debug);

const contentTypes = {
  json: "application/json",
  csv: "text/plain" // text/csv triggers download dialog in Chrome
};

const handlers = [
  { endpoint: "mlt", handler: mlt },
  { endpoint: "suggest", handler: suggestHandler },
  { endpoint: "about", handler: about },
  { endpoint: "embedding", handler: embeddings },
];

Promise.all(
  handlers.map(function (h) {
    return h.handler.init().then(function () {
      app.use("/" + h.endpoint, function(req, res, next) {
        let q;
        if (req.method === 'POST') {
          let body = '';

          req.on('data', function (data) {
            body += data;
          });

          req.on('end', function () {
            q = qs.parse(body);
            handle(q, res);
          });
        } else {
          q = url.parse(req.url, true).query;
          handle(q, res);
        }
      });

      function handle(q, res) {
        const requiredParams = Object.keys(h.handler.params()).filter(function (p) {
          return h.handler.params()[p].required;
        });

        requiredParams.forEach(function (p) {
          if (_.isEmpty(q[p])) {
            throw "The following parameters are required: " + requiredParams.join(", ") + ".";
          }
        });

        const format = q.format || "csv";
        delete q.format;

        h.handler.handle(q, { type: format, header: true }).then(function (output) {
          res.writeHead(200, { 'Content-Type': contentTypes[format] + "; charset=utf-8"});
          res.end(output);
        }).catch(function (error) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8'});
          res.end(_.get(error, "response.text"));
        });
      }
    });
  })
).then(function () {
  app.use("/", function(req, res, next) {
    const endpoints = handlers.map(function (h) {
      return {
        endpoint: h.endpoint,
        description: h.handler.description(),
        params: h.handler.params(),
        examples: h.handler.examples().map(function (e) {
          e.urlSuffix = "/" + h.endpoint + "?" + Object.keys(e.params).map(p => p + "=" + encodeURIComponent(e.params[p])).join("&")
          return e;
        })
      }
    });

    ejs.renderFile("./cli/pages/index.ejs", { endpoints: endpoints }, {}, function (err, str) {
      if (err) {
        console.log(err);
      }
      res.writeHead(200, { 'Content-Type': "text/html" });
      res.end(str);
    });
  });

  const port = program.port || 9090;
  console.log("Starting server on port " + port);
  http.createServer(app).listen(port);
});

